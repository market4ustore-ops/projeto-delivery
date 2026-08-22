create type public.flow_session_status as enum ('ACTIVE','COMPLETED','ABANDONED','EXPIRED');

create table public.flow_sessions (
 id uuid primary key default gen_random_uuid(), public_token_hash text not null unique,
 flow_id uuid not null, flow_version_id uuid not null, location_id uuid not null,
 status public.flow_session_status not null default 'ACTIVE', current_node_id uuid not null,
 revision integer not null default 0 check(revision>=0), customer_id uuid,
 selected_choice_keys jsonb not null default '[]'::jsonb check(jsonb_typeof(selected_choice_keys)='array'), metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 started_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz, expires_at timestamptz,
 foreign key(flow_id,location_id) references public.flows(id,location_id),
 foreign key(flow_id,flow_version_id) references public.flow_versions(flow_id,id),
 foreign key(flow_version_id,current_node_id) references public.flow_nodes(flow_version_id,id),
 check((status='COMPLETED')=(completed_at is not null))
);
create index flow_sessions_location_updated_idx on public.flow_sessions(location_id,updated_at desc);
create index flow_sessions_version_idx on public.flow_sessions(flow_version_id);

create table public.flow_session_commands (
 session_id uuid not null references public.flow_sessions(id) on delete cascade,
 idempotency_key text not null check(char_length(idempotency_key) between 8 and 200),
 expected_revision integer not null, response jsonb not null, created_at timestamptz not null default now(),
 primary key(session_id,idempotency_key)
);
create table public.flow_session_events (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.flow_sessions(id) on delete cascade,
 location_id uuid not null references public.locations(id), event_type text not null check(event_type in('FLOW_SESSION_STARTED','FLOW_NODE_ENTERED','FLOW_OPTION_SELECTED','FLOW_SESSION_COMPLETED','FLOW_SESSION_ABANDONED')),
 flow_node_id uuid, payload jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now()
);

create function private.session_location(target_session_id uuid) returns uuid language sql stable security definer set search_path='' as $$select location_id from public.flow_sessions where id=target_session_id$$;
revoke all on function private.session_location(uuid) from public;grant execute on function private.session_location(uuid) to authenticated;

create function public.create_flow_session(target_location_id uuid,target_flow_slug text,target_current_node_id uuid,target_engine_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare f public.flows;sid uuid;token text;result jsonb;begin
 if not private.can_flow(target_location_id,'flow.read') then raise exception 'permission denied' using errcode='42501';end if;
 select * into f from public.flows where location_id=target_location_id and slug=target_flow_slug and published_version_id is not null;
 if f.id is null then raise exception 'FLOW_NOT_PUBLISHED' using errcode='P0002';end if;
 if not exists(select 1 from public.flow_nodes where flow_version_id=f.published_version_id and id=target_current_node_id) then raise exception 'NODE_NOT_FOUND' using errcode='P0002';end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.flow_sessions(public_token_hash,flow_id,flow_version_id,location_id,current_node_id,status,completed_at)
 values(encode(extensions.digest(token,'sha256'),'hex'),f.id,f.published_version_id,target_location_id,target_current_node_id,case when coalesce((target_engine_result->>'completed')::boolean,false) then 'COMPLETED'::public.flow_session_status else 'ACTIVE'::public.flow_session_status end,case when coalesce((target_engine_result->>'completed')::boolean,false) then now() end) returning id into sid;
 insert into public.flow_session_events(session_id,location_id,event_type,flow_node_id) values(sid,target_location_id,'FLOW_SESSION_STARTED',target_current_node_id),(sid,target_location_id,'FLOW_NODE_ENTERED',target_current_node_id);
 result:=jsonb_build_object('id',sid,'publicToken',token,'flowId',f.id,'flowVersionId',f.published_version_id,'locationId',target_location_id,'status',case when coalesce((target_engine_result->>'completed')::boolean,false) then 'COMPLETED' else 'ACTIVE' end,'currentNodeId',target_current_node_id,'revision',0,'selectedChoiceKeys','[]'::jsonb,'engine',target_engine_result);return result;
end$$;

create function public.advance_flow_session(public_token text,target_location_id uuid,expected_revision integer,target_idempotency_key text,target_current_node_id uuid,target_completed boolean,target_selected_choice_keys jsonb,target_engine_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare s public.flow_sessions;saved jsonb;result jsonb;begin
 if not private.can_flow(target_location_id,'flow.read') then raise exception 'permission denied' using errcode='42501';end if;
 select * into s from public.flow_sessions where public_token_hash=encode(extensions.digest(public_token,'sha256'),'hex') and location_id=target_location_id for update;
 if s.id is null then raise exception 'INVALID_RUNTIME_STATE' using errcode='P0002';end if;
 select response into saved from public.flow_session_commands where session_id=s.id and idempotency_key=target_idempotency_key;if saved is not null then return saved;end if;
 if s.status<>'ACTIVE' then raise exception 'SESSION_NOT_ACTIVE' using errcode='55000';end if;if s.revision<>expected_revision then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 if not exists(select 1 from public.flow_nodes where flow_version_id=s.flow_version_id and id=target_current_node_id) then raise exception 'NODE_NOT_FOUND' using errcode='P0002';end if;
 update public.flow_sessions set current_node_id=target_current_node_id,revision=revision+1,selected_choice_keys=target_selected_choice_keys,status=case when target_completed then 'COMPLETED'::public.flow_session_status else status end,completed_at=case when target_completed then now() else null end,updated_at=now() where id=s.id;
 result:=jsonb_build_object('id',s.id,'publicToken',public_token,'flowId',s.flow_id,'flowVersionId',s.flow_version_id,'locationId',s.location_id,'status',case when target_completed then 'COMPLETED' else 'ACTIVE' end,'currentNodeId',target_current_node_id,'revision',s.revision+1,'selectedChoiceKeys',target_selected_choice_keys,'engine',target_engine_result);
 insert into public.flow_session_commands values(s.id,target_idempotency_key,expected_revision,result,now());
 insert into public.flow_session_events(session_id,location_id,event_type,flow_node_id,payload) values(s.id,s.location_id,'FLOW_NODE_ENTERED',target_current_node_id,'{}');
 if jsonb_array_length(target_selected_choice_keys)>jsonb_array_length(s.selected_choice_keys) then insert into public.flow_session_events(session_id,location_id,event_type,flow_node_id,payload) values(s.id,s.location_id,'FLOW_OPTION_SELECTED',target_current_node_id,jsonb_build_object('choiceKey',target_selected_choice_keys->-1));end if;
 if target_completed then insert into public.flow_session_events(session_id,location_id,event_type,flow_node_id) values(s.id,s.location_id,'FLOW_SESSION_COMPLETED',target_current_node_id);end if;return result;
end$$;

alter table public.flow_sessions enable row level security;alter table public.flow_session_commands enable row level security;alter table public.flow_session_events enable row level security;
create policy sessions_admin_read on public.flow_sessions for select to authenticated using(private.can_flow(location_id,'flow.read'));
create policy session_commands_admin_read on public.flow_session_commands for select to authenticated using(private.can_flow(private.session_location(session_id),'flow.read'));
create policy session_events_admin_read on public.flow_session_events for select to authenticated using(private.can_flow(location_id,'flow.read'));
grant select on public.flow_sessions,public.flow_session_commands,public.flow_session_events to authenticated;
revoke all on function public.create_flow_session(uuid,text,uuid,jsonb),public.advance_flow_session(text,uuid,integer,text,uuid,boolean,jsonb,jsonb) from public;
grant execute on function public.create_flow_session(uuid,text,uuid,jsonb),public.advance_flow_session(text,uuid,integer,text,uuid,boolean,jsonb,jsonb) to authenticated;
