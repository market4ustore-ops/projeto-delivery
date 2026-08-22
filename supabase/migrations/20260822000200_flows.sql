create type public.flow_version_status as enum ('DRAFT','PUBLISHED','ARCHIVED');
create type public.flow_node_type as enum ('START','TEXT','CHOICE','CATEGORY','PRODUCT_LIST','PRODUCT','UPSELL','CART','DELIVERY','CHECKOUT','END');
create type public.flow_condition_type as enum ('ALWAYS','CHOICE_EQUALS');

create table public.flows (
 id uuid primary key default gen_random_uuid(), location_id uuid not null references public.locations(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 2 and 120), slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 published_version_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(location_id,slug), unique(id,location_id)
);
create table public.flow_versions (
 id uuid primary key default gen_random_uuid(), flow_id uuid not null references public.flows(id) on delete cascade,
 version_number integer not null check(version_number>0), status public.flow_version_status not null default 'DRAFT', schema_version integer not null default 1 check(schema_version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), published_at timestamptz,
 unique(flow_id,version_number), unique(flow_id,id), check((status='DRAFT' and published_at is null) or (status in('PUBLISHED','ARCHIVED') and published_at is not null))
);
create unique index flow_versions_one_draft on public.flow_versions(flow_id) where status='DRAFT';
alter table public.flows add constraint flows_published_own_version foreign key(id,published_version_id) references public.flow_versions(flow_id,id) deferrable initially deferred;
create table public.flow_nodes (
 id uuid primary key default gen_random_uuid(), flow_version_id uuid not null references public.flow_versions(id) on delete cascade,
 type public.flow_node_type not null, name text check(name is null or char_length(btrim(name)) between 1 and 120), config jsonb not null,
 editor_metadata jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(flow_version_id,id), check(jsonb_typeof(config)='object'), check(editor_metadata is null or jsonb_typeof(editor_metadata)='object')
);
create table public.flow_edges (
 id uuid primary key default gen_random_uuid(), flow_version_id uuid not null references public.flow_versions(id) on delete cascade,
 source_node_id uuid not null, target_node_id uuid not null, source_handle text, condition_type public.flow_condition_type not null default 'ALWAYS', condition_config jsonb not null default '{}'::jsonb,
 sort_order integer not null default 0 check(sort_order>=0), created_at timestamptz not null default now(),
 foreign key(flow_version_id,source_node_id) references public.flow_nodes(flow_version_id,id) on delete cascade,
 foreign key(flow_version_id,target_node_id) references public.flow_nodes(flow_version_id,id) on delete cascade,
 check(jsonb_typeof(condition_config)='object'), check((condition_type='ALWAYS' and condition_config='{}') or (condition_type='CHOICE_EQUALS' and nullif(btrim(condition_config->>'choiceKey'),'') is not null))
);
create table public.flow_audit_logs (
 id uuid primary key default gen_random_uuid(), location_id uuid not null references public.locations(id), flow_id uuid not null references public.flows(id), flow_version_id uuid references public.flow_versions(id),
 actor_id uuid not null references auth.users(id), event_type text not null check(event_type in('FLOW_CREATED','FLOW_VERSION_CREATED','FLOW_PUBLISHED')),
 details jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now()
);

create function private.flow_location(target_flow_id uuid) returns uuid language sql stable security definer set search_path='' as $$select location_id from public.flows where id=target_flow_id$$;
create function private.flow_version_location(target_version_id uuid) returns uuid language sql stable security definer set search_path='' as $$select f.location_id from public.flow_versions v join public.flows f on f.id=v.flow_id where v.id=target_version_id$$;
create function private.can_flow(target_location_id uuid, required_permission text) returns boolean language sql stable security definer set search_path='' as $$select public.can_access_location(target_location_id) and public.has_permission((select organization_id from public.locations where id=target_location_id),required_permission)$$;
revoke all on function private.flow_location(uuid),private.flow_version_location(uuid),private.can_flow(uuid,text) from public;
grant execute on function private.flow_location(uuid),private.flow_version_location(uuid),private.can_flow(uuid,text) to authenticated;

create function private.assert_draft_graph() returns trigger language plpgsql security definer set search_path='' as $$begin
 if (select status from public.flow_versions where id=coalesce(new.flow_version_id,old.flow_version_id)) <> 'DRAFT' then raise exception 'published and archived flow versions are immutable' using errcode='55000'; end if; return coalesce(new,old);
end$$;
create trigger flow_nodes_draft_only before insert or update or delete on public.flow_nodes for each row execute function private.assert_draft_graph();
create trigger flow_edges_draft_only before insert or update or delete on public.flow_edges for each row execute function private.assert_draft_graph();

create function public.create_flow(target_location_id uuid,flow_name text,flow_slug text) returns uuid language plpgsql security definer set search_path='' as $$declare fid uuid;vid uuid;begin
 if not private.can_flow(target_location_id,'flow.write') then raise exception 'permission denied' using errcode='42501';end if;
 insert into public.flows(location_id,name,slug) values(target_location_id,btrim(flow_name),flow_slug) returning id into fid;
 insert into public.flow_versions(flow_id,version_number) values(fid,1) returning id into vid;
 insert into public.flow_audit_logs(location_id,flow_id,flow_version_id,actor_id,event_type) values(target_location_id,fid,vid,auth.uid(),'FLOW_CREATED'),(target_location_id,fid,vid,auth.uid(),'FLOW_VERSION_CREATED'); return fid;
end$$;
create function public.ensure_flow_draft(target_flow_id uuid) returns uuid language plpgsql security definer set search_path='' as $$declare loc uuid;draft uuid;published uuid;next_number integer;old_node record;new_node uuid;begin
 select location_id,published_version_id into loc,published from public.flows where id=target_flow_id;
 if loc is null or not private.can_flow(loc,'flow.write') then raise exception 'permission denied' using errcode='42501';end if;
 select id into draft from public.flow_versions where flow_id=target_flow_id and status='DRAFT'; if draft is not null then return draft;end if;
 select coalesce(max(version_number),0)+1 into next_number from public.flow_versions where flow_id=target_flow_id;
 insert into public.flow_versions(flow_id,version_number) values(target_flow_id,next_number) returning id into draft;
 if published is not null then
  create temporary table flow_node_map(old_id uuid primary key,new_id uuid not null) on commit drop;
  for old_node in select * from public.flow_nodes where flow_version_id=published loop
   insert into public.flow_nodes(flow_version_id,type,name,config,editor_metadata) values(draft,old_node.type,old_node.name,old_node.config,old_node.editor_metadata) returning id into new_node;
   insert into flow_node_map values(old_node.id,new_node);
  end loop;
  insert into public.flow_edges(flow_version_id,source_node_id,target_node_id,source_handle,condition_type,condition_config,sort_order)
   select draft,s.new_id,t.new_id,e.source_handle,e.condition_type,e.condition_config,e.sort_order from public.flow_edges e join flow_node_map s on s.old_id=e.source_node_id join flow_node_map t on t.old_id=e.target_node_id where e.flow_version_id=published;
 end if;
 insert into public.flow_audit_logs(location_id,flow_id,flow_version_id,actor_id,event_type) values(loc,target_flow_id,draft,auth.uid(),'FLOW_VERSION_CREATED');return draft;
end$$;

create function public.validate_flow_version(target_version_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare errs jsonb='[]';starts int;ends int;loc uuid;begin
 loc:=private.flow_version_location(target_version_id); if loc is null or not private.can_flow(loc,'flow.read') then raise exception 'permission denied' using errcode='42501';end if;
 select count(*) filter(where type='START'),count(*) filter(where type='END') into starts,ends from public.flow_nodes where flow_version_id=target_version_id;
 if starts=0 then errs:=errs||'[{"code":"MISSING_START"}]';elsif starts>1 then errs:=errs||'[{"code":"MULTIPLE_START"}]';end if;
 if ends=0 then errs:=errs||'[{"code":"MISSING_END"}]';end if;
 if exists(select 1 from public.flow_nodes n join public.flow_edges e on e.target_node_id=n.id where n.flow_version_id=target_version_id and n.type='START') then errs:=errs||'[{"code":"START_HAS_INBOUND"}]';end if;
 if exists(select 1 from public.flow_nodes n join public.flow_edges e on e.source_node_id=n.id where n.flow_version_id=target_version_id and n.type='END') then errs:=errs||'[{"code":"END_HAS_OUTBOUND"}]';end if;
 if exists(select 1 from public.flow_nodes n where n.flow_version_id=target_version_id and n.type<>'END' and not exists(select 1 from public.flow_edges e where e.flow_version_id=target_version_id and e.source_node_id=n.id)) then errs:=errs||'[{"code":"MISSING_OUTPUT"}]';end if;
 if exists(select 1 from public.flow_nodes n where n.flow_version_id=target_version_id and ((n.type='START' and n.config<>'{}') or (n.type='TEXT' and nullif(btrim(n.config->>'title'),'') is null) or (n.type='CHOICE' and (nullif(btrim(n.config->>'title'),'') is null or jsonb_typeof(n.config->'options')<>'array' or jsonb_array_length(n.config->'options')=0)) or (n.type='CATEGORY' and (jsonb_typeof(n.config->'categoryIds')<>'array' or jsonb_array_length(n.config->'categoryIds')=0)) or (n.type='PRODUCT' and nullif(n.config->>'productId','') is null) or (n.type='UPSELL' and (jsonb_typeof(n.config->'productIds')<>'array' or jsonb_array_length(n.config->'productIds')=0)))) then errs:=errs||'[{"code":"INVALID_NODE_CONFIG"}]';end if;
 if exists(select 1 from public.flow_nodes n cross join lateral jsonb_array_elements_text(case when n.type='CATEGORY' then n.config->'categoryIds' else '[]' end) x where n.flow_version_id=target_version_id and not exists(select 1 from public.categories c where c.id=x.value::uuid and c.location_id=loc)) or exists(select 1 from public.flow_nodes n cross join lateral jsonb_array_elements_text(case when n.type in('UPSELL','PRODUCT_LIST') then coalesce(n.config->'productIds','[]') else case when n.type='PRODUCT' then jsonb_build_array(n.config->>'productId') else '[]' end end) x where n.flow_version_id=target_version_id and not exists(select 1 from public.products p where p.id=x.value::uuid and p.location_id=loc)) then errs:=errs||'[{"code":"INVALID_CATALOG_REFERENCE"}]';end if;
 if starts=1 and exists(with recursive reach(id,path,cycle) as (select id,array[id],false from public.flow_nodes where flow_version_id=target_version_id and type='START' union all select e.target_node_id,r.path||e.target_node_id,e.target_node_id=any(r.path) from reach r join public.flow_edges e on e.flow_version_id=target_version_id and e.source_node_id=r.id where not r.cycle) select 1 from reach where cycle) then errs:=errs||'[{"code":"CYCLE_DETECTED"}]';end if;
 if starts=1 and exists(with recursive reach(id) as (select id from public.flow_nodes where flow_version_id=target_version_id and type='START' union select e.target_node_id from reach r join public.flow_edges e on e.flow_version_id=target_version_id and e.source_node_id=r.id) select 1 from public.flow_nodes n where n.flow_version_id=target_version_id and n.id not in(select id from reach)) then errs:=errs||'[{"code":"UNREACHABLE_NODE"}]';end if;
 return jsonb_build_object('valid',jsonb_array_length(errs)=0,'errors',errs,'warnings','[]'::jsonb);end$$;

create function public.publish_flow_version(target_version_id uuid) returns uuid language plpgsql security definer set search_path='' as $$declare fid uuid;loc uuid;validation jsonb;begin
 select v.flow_id,f.location_id into fid,loc from public.flow_versions v join public.flows f on f.id=v.flow_id where v.id=target_version_id and v.status='DRAFT' for update;
 if fid is null then raise exception 'draft flow version not found' using errcode='55000';end if;if not private.can_flow(loc,'flow.publish') then raise exception 'permission denied' using errcode='42501';end if;
 validation:=public.validate_flow_version(target_version_id);if not (validation->>'valid')::boolean then raise exception 'invalid flow: %',validation using errcode='23514';end if;
 update public.flow_versions set status='ARCHIVED',updated_at=now() where flow_id=fid and status='PUBLISHED';
 update public.flow_versions set status='PUBLISHED',published_at=now(),updated_at=now() where id=target_version_id;
 update public.flows set published_version_id=target_version_id,updated_at=now() where id=fid;
 insert into public.flow_audit_logs(location_id,flow_id,flow_version_id,actor_id,event_type) values(loc,fid,target_version_id,auth.uid(),'FLOW_PUBLISHED');return target_version_id;end$$;

alter table public.flows enable row level security;alter table public.flow_versions enable row level security;alter table public.flow_nodes enable row level security;alter table public.flow_edges enable row level security;alter table public.flow_audit_logs enable row level security;
create policy flows_read on public.flows for select to authenticated using(private.can_flow(location_id,'flow.read'));
create policy versions_read on public.flow_versions for select to authenticated using(private.can_flow(private.flow_location(flow_id),'flow.read'));
create policy versions_write on public.flow_versions for insert to authenticated with check(private.can_flow(private.flow_location(flow_id),'flow.write') and status='DRAFT');
create policy nodes_read on public.flow_nodes for select to authenticated using(private.can_flow(private.flow_version_location(flow_version_id),'flow.read'));
create policy nodes_write on public.flow_nodes for all to authenticated using(private.can_flow(private.flow_version_location(flow_version_id),'flow.write')) with check(private.can_flow(private.flow_version_location(flow_version_id),'flow.write'));
create policy edges_read on public.flow_edges for select to authenticated using(private.can_flow(private.flow_version_location(flow_version_id),'flow.read'));
create policy edges_write on public.flow_edges for all to authenticated using(private.can_flow(private.flow_version_location(flow_version_id),'flow.write')) with check(private.can_flow(private.flow_version_location(flow_version_id),'flow.write'));
create policy flow_audit_read on public.flow_audit_logs for select to authenticated using(private.can_flow(location_id,'flow.read'));
grant select on public.flows,public.flow_versions,public.flow_nodes,public.flow_edges,public.flow_audit_logs to authenticated;
grant insert on public.flow_versions,public.flow_nodes,public.flow_edges to authenticated;grant update,delete on public.flow_nodes,public.flow_edges to authenticated;
revoke all on function public.create_flow(uuid,text,text),public.ensure_flow_draft(uuid),public.validate_flow_version(uuid),public.publish_flow_version(uuid) from public;
grant execute on function public.create_flow(uuid,text,text),public.ensure_flow_draft(uuid),public.validate_flow_version(uuid),public.publish_flow_version(uuid) to authenticated;
