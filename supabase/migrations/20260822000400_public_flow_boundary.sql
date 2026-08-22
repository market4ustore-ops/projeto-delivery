alter table public.locations add column slug text;
update public.locations set slug='location-'||substr(replace(id::text,'-',''),1,12);
alter table public.locations alter column slug set not null;
alter table public.locations alter column slug set default ('location-'||substr(replace(gen_random_uuid()::text,'-',''),1,12));
alter table public.locations add constraint locations_slug_format check(slug~'^[a-z0-9]+(-[a-z0-9]+)*$');
alter table public.locations add constraint locations_slug_unique unique(slug);

create function private.public_flow_payload(target_flow_id uuid,target_version_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('flowId',f.id,'versionId',v.id,'locationId',f.location_id,'schemaVersion',v.schema_version,
'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'flowVersionId',n.flow_version_id,'type',n.type,'name',n.name,'config',jsonb_build_object('type',n.type)||n.config) order by n.created_at) from public.flow_nodes n where n.flow_version_id=v.id),'[]'::jsonb),
'edges',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'flowVersionId',e.flow_version_id,'sourceNodeId',e.source_node_id,'targetNodeId',e.target_node_id,'condition',jsonb_build_object('type',e.condition_type)||e.condition_config,'sortOrder',e.sort_order) order by e.sort_order,e.id) from public.flow_edges e where e.flow_version_id=v.id),'[]'::jsonb),
'catalog',jsonb_build_object('categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name)) from public.categories c where c.location_id=f.location_id and c.is_active),'[]'::jsonb),'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.base_price::text,'categoryId',p.category_id,'available',p.is_active and p.is_available,'description',p.description,'imageReference',p.image_reference)) from public.products p where p.location_id=f.location_id and p.is_active),'[]'::jsonb)))
from public.flows f join public.flow_versions v on v.id=target_version_id where f.id=target_flow_id and v.flow_id=f.id and v.status='PUBLISHED'$$;
revoke all on function private.public_flow_payload(uuid,uuid) from public;

create function public.get_public_flow(location_slug text,flow_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare f public.flows;begin
 select f0.* into f from public.flows f0 join public.locations l on l.id=f0.location_id where l.slug=location_slug and f0.slug=flow_slug and f0.published_version_id is not null;
 if f.id is null then return null;end if;return private.public_flow_payload(f.id,f.published_version_id);end$$;

create function public.start_public_flow_session(location_slug text,flow_slug text,target_current_node_id uuid,target_engine_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare f public.flows;sid uuid;token text;first_node uuid;begin
 select f0.* into f from public.flows f0 join public.locations l on l.id=f0.location_id where l.slug=location_slug and f0.slug=flow_slug and f0.published_version_id is not null;
 if f.id is null then raise exception 'FLOW_NOT_AVAILABLE' using errcode='P0002';end if;
 select e.target_node_id into first_node from public.flow_nodes n join public.flow_edges e on e.flow_version_id=n.flow_version_id and e.source_node_id=n.id and e.condition_type='ALWAYS' where n.flow_version_id=f.published_version_id and n.type='START';
 if first_node is distinct from target_current_node_id then raise exception 'INVALID_PUBLIC_ACTION' using errcode='22023';end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');insert into public.flow_sessions(public_token_hash,flow_id,flow_version_id,location_id,current_node_id,expires_at) values(encode(extensions.digest(token,'sha256'),'hex'),f.id,f.published_version_id,f.location_id,target_current_node_id,now()+interval '45 minutes') returning id into sid;
 insert into public.flow_session_events(session_id,location_id,event_type,flow_node_id) values(sid,f.location_id,'FLOW_SESSION_STARTED',target_current_node_id),(sid,f.location_id,'FLOW_NODE_ENTERED',target_current_node_id);
 return jsonb_build_object('publicToken',token,'revision',0,'status','ACTIVE','engine',target_engine_result);end$$;

create function public.get_public_flow_session(public_token text) returns jsonb language plpgsql security definer set search_path='' as $$declare s public.flow_sessions;begin
 select * into s from public.flow_sessions where public_token_hash=encode(extensions.digest(public_token,'sha256'),'hex');if s.id is null then return null;end if;
 if s.status='ACTIVE' and (s.expires_at is null or s.expires_at<=now()) then update public.flow_sessions set status='EXPIRED',updated_at=now() where id=s.id;return jsonb_build_object('status','EXPIRED');end if;
 return jsonb_build_object('publicToken',public_token,'revision',s.revision,'status',s.status,'currentNodeId',s.current_node_id,'selectedChoiceKeys',s.selected_choice_keys,'definition',private.public_flow_payload(s.flow_id,s.flow_version_id));end$$;

create function public.advance_public_flow_session(public_token text,expected_revision integer,target_idempotency_key text,target_current_node_id uuid,target_completed boolean,target_selected_choice_keys jsonb,target_engine_result jsonb,action_type text,choice_key text default null) returns jsonb language plpgsql security definer set search_path='' as $$declare s public.flow_sessions;saved jsonb;valid_edge boolean;result jsonb;begin
 select * into s from public.flow_sessions where public_token_hash=encode(extensions.digest(public_token,'sha256'),'hex') for update;if s.id is null then raise exception 'FLOW_SESSION_NOT_AVAILABLE' using errcode='P0002';end if;
 select response into saved from public.flow_session_commands where session_id=s.id and idempotency_key=target_idempotency_key;if saved is not null then return saved;end if;
 if s.expires_at is null or s.expires_at<=now() then update public.flow_sessions set status='EXPIRED',updated_at=now() where id=s.id;raise exception 'FLOW_SESSION_EXPIRED' using errcode='55000';end if;
 if s.status<>'ACTIVE' then raise exception 'FLOW_SESSION_NOT_ACTIVE' using errcode='55000';end if;if s.revision<>expected_revision then raise exception 'FLOW_SESSION_CONFLICT' using errcode='40001';end if;
 select exists(select 1 from public.flow_edges e where e.flow_version_id=s.flow_version_id and e.source_node_id=s.current_node_id and e.target_node_id=target_current_node_id and ((action_type='CONTINUE' and e.condition_type='ALWAYS') or (action_type='SELECT_CHOICE' and e.condition_type='CHOICE_EQUALS' and e.condition_config->>'choiceKey'=choice_key))) into valid_edge;
 if not valid_edge then raise exception 'INVALID_PUBLIC_ACTION' using errcode='22023';end if;
 update public.flow_sessions set current_node_id=target_current_node_id,revision=revision+1,selected_choice_keys=target_selected_choice_keys,status=case when target_completed then 'COMPLETED'::public.flow_session_status else status end,completed_at=case when target_completed then now() end,updated_at=now(),expires_at=now()+interval '45 minutes' where id=s.id;
 result:=jsonb_build_object('publicToken',public_token,'revision',s.revision+1,'status',case when target_completed then 'COMPLETED' else 'ACTIVE' end,'engine',target_engine_result);insert into public.flow_session_commands values(s.id,target_idempotency_key,expected_revision,result,now());insert into public.flow_session_events(session_id,location_id,event_type,flow_node_id) values(s.id,s.location_id,'FLOW_NODE_ENTERED',target_current_node_id);if target_completed then insert into public.flow_session_events(session_id,location_id,event_type,flow_node_id) values(s.id,s.location_id,'FLOW_SESSION_COMPLETED',target_current_node_id);end if;return result;end$$;

revoke all on function public.get_public_flow(text,text),public.start_public_flow_session(text,text,uuid,jsonb),public.get_public_flow_session(text),public.advance_public_flow_session(text,integer,text,uuid,boolean,jsonb,jsonb,text,text) from public;
grant execute on function public.get_public_flow(text,text),public.start_public_flow_session(text,text,uuid,jsonb),public.get_public_flow_session(text),public.advance_public_flow_session(text,integer,text,uuid,boolean,jsonb,jsonb,text,text) to anon,authenticated;
