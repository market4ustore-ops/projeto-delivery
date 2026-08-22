create function private.touch_flow_node() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;
create trigger flow_nodes_touch before update on public.flow_nodes for each row execute function private.touch_flow_node();

create or replace function public.create_flow(target_location_id uuid,flow_name text,flow_slug text) returns uuid language plpgsql security definer set search_path='' as $$declare fid uuid;vid uuid;begin
 if not private.can_flow(target_location_id,'flow.write') then raise exception 'permission denied' using errcode='42501';end if;
 insert into public.flows(location_id,name,slug) values(target_location_id,btrim(flow_name),flow_slug) returning id into fid;
 insert into public.flow_versions(flow_id,version_number) values(fid,1) returning id into vid;
 insert into public.flow_nodes(flow_version_id,type,name,config,editor_metadata) values(vid,'START','Comece aqui','{}','{"position":{"x":32,"y":36}}');
 insert into public.flow_audit_logs(location_id,flow_id,flow_version_id,actor_id,event_type) values(target_location_id,fid,vid,auth.uid(),'FLOW_CREATED'),(target_location_id,fid,vid,auth.uid(),'FLOW_VERSION_CREATED'); return fid;
end$$;

create function public.update_flow_draft_node(target_node_id uuid,expected_updated_at timestamptz,target_name text,target_config jsonb,target_editor_metadata jsonb) returns public.flow_nodes language plpgsql security definer set search_path='' as $$declare result public.flow_nodes;loc uuid;begin
 select private.flow_version_location(n.flow_version_id) into loc from public.flow_nodes n join public.flow_versions v on v.id=n.flow_version_id where n.id=target_node_id and v.status='DRAFT';
 if loc is null or not private.can_flow(loc,'flow.write') then raise exception 'permission denied' using errcode='42501';end if;
 update public.flow_nodes set name=nullif(btrim(target_name),''),config=target_config,editor_metadata=target_editor_metadata where id=target_node_id and updated_at=expected_updated_at returning * into result;
 if result.id is null then raise exception 'draft changed; reload before saving' using errcode='40001';end if;
 return result;
end$$;

create function public.replace_flow_draft_branches(target_source_node_id uuid,target_branches jsonb) returns void language plpgsql security definer set search_path='' as $$declare source public.flow_nodes;loc uuid;branch jsonb;target uuid;choice text;begin
 select n.* into source from public.flow_nodes n join public.flow_versions v on v.id=n.flow_version_id where n.id=target_source_node_id and v.status='DRAFT' for update;
 loc:=private.flow_version_location(source.flow_version_id);
 if loc is null or not private.can_flow(loc,'flow.write') then raise exception 'permission denied' using errcode='42501';end if;
 if jsonb_typeof(target_branches)<>'array' then raise exception 'invalid branches' using errcode='22023';end if;
 delete from public.flow_edges where flow_version_id=source.flow_version_id and source_node_id=source.id;
 for branch in select value from jsonb_array_elements(target_branches) loop
  target:=(branch->>'targetNodeId')::uuid;choice:=nullif(btrim(branch->>'choiceKey'),'');
  if not exists(select 1 from public.flow_nodes where id=target and flow_version_id=source.flow_version_id) then raise exception 'invalid next step' using errcode='23503';end if;
  if source.type='CHOICE' then
   if choice is null or not exists(select 1 from jsonb_array_elements(source.config->'options') option where option->>'key'=choice) then raise exception 'invalid option' using errcode='22023';end if;
   insert into public.flow_edges(flow_version_id,source_node_id,target_node_id,condition_type,condition_config,sort_order) values(source.flow_version_id,source.id,target,'CHOICE_EQUALS',jsonb_build_object('choiceKey',choice),coalesce((branch->>'sortOrder')::integer,0));
  else
   if choice is not null then raise exception 'choice only allowed for question' using errcode='22023';end if;
   insert into public.flow_edges(flow_version_id,source_node_id,target_node_id,condition_type,sort_order) values(source.flow_version_id,source.id,target,'ALWAYS',coalesce((branch->>'sortOrder')::integer,0));
  end if;
 end loop;
end$$;

revoke all on function public.update_flow_draft_node(uuid,timestamptz,text,jsonb,jsonb),public.replace_flow_draft_branches(uuid,jsonb) from public;
grant execute on function public.update_flow_draft_node(uuid,timestamptz,text,jsonb,jsonb),public.replace_flow_draft_branches(uuid,jsonb) to authenticated;
