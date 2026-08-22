begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000000','authenticated','authenticated','runtime-a@test.local','',now(),now(),now()),
('00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000000','authenticated','authenticated','runtime-b@test.local','',now(),now(),now());
insert into public.organizations(id,name) values('10000000-0000-0000-0000-000000000031','Runtime Org A'),('10000000-0000-0000-0000-000000000032','Runtime Org B');
insert into public.organization_members(organization_id,user_id,role) values('10000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000031','OWNER'),('10000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000032','OWNER');
insert into public.locations(id,organization_id,name) values('20000000-0000-0000-0000-000000000031','10000000-0000-0000-0000-000000000031','Runtime Location A'),('20000000-0000-0000-0000-000000000032','10000000-0000-0000-0000-000000000032','Runtime Location B');
insert into public.flows(id,location_id,name,slug) values('70000000-0000-0000-0000-000000000031','20000000-0000-0000-0000-000000000031','Runtime Flow A','runtime-a'),('70000000-0000-0000-0000-000000000032','20000000-0000-0000-0000-000000000032','Runtime Flow B','runtime-b');
insert into public.flow_versions(id,flow_id,version_number) values('71000000-0000-0000-0000-000000000031','70000000-0000-0000-0000-000000000031',1),('71000000-0000-0000-0000-000000000032','70000000-0000-0000-0000-000000000032',1);
insert into public.flow_nodes(id,flow_version_id,type,config) values('72000000-0000-0000-0000-000000000031','71000000-0000-0000-0000-000000000031','END','{}'),('72000000-0000-0000-0000-000000000032','71000000-0000-0000-0000-000000000032','END','{}');
update public.flow_versions set status='PUBLISHED',published_at=now();
update public.flows set published_version_id=case id when '70000000-0000-0000-0000-000000000031' then '71000000-0000-0000-0000-000000000031'::uuid else '71000000-0000-0000-0000-000000000032'::uuid end;
insert into public.flow_sessions(id,public_token_hash,flow_id,flow_version_id,location_id,current_node_id) values('74000000-0000-0000-0000-000000000031','hash-a','70000000-0000-0000-0000-000000000031','71000000-0000-0000-0000-000000000031','20000000-0000-0000-0000-000000000031','72000000-0000-0000-0000-000000000031'),('74000000-0000-0000-0000-000000000032','hash-b','70000000-0000-0000-0000-000000000032','71000000-0000-0000-0000-000000000032','20000000-0000-0000-0000-000000000032','72000000-0000-0000-0000-000000000032');
select ok(not has_table_privilege('anon','public.flow_sessions','select'),'anon cannot list sessions');
select ok(not has_function_privilege('anon','public.create_flow_session(uuid,text,uuid,jsonb)','execute'),'anon cannot start through administrative RPC');
set local role authenticated;select set_config('request.jwt.claim.role','authenticated',true);select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000031',true);
select results_eq('select id from public.flow_sessions',array['74000000-0000-0000-0000-000000000031'::uuid],'tenant reads own session');
select is((select count(*)::int from public.flow_sessions where id='74000000-0000-0000-0000-000000000032'),0,'known foreign session UUID reveals nothing');
select is((select count(*)::int from public.flow_session_events),0,'foreign events are not exposed');
select lives_ok($$select public.create_flow_session('20000000-0000-0000-0000-000000000031','runtime-a','72000000-0000-0000-0000-000000000031','{"completed":false}')$$,'starts session on own published flow');
select is((select count(distinct flow_version_id)::int from public.flow_sessions where flow_id='70000000-0000-0000-0000-000000000031'),1,'sessions pin the published version');
select throws_ok($$select public.create_flow_session('20000000-0000-0000-0000-000000000032','runtime-b','72000000-0000-0000-0000-000000000032','{"completed":false}')$$,'42501','permission denied','cannot start foreign session');
select throws_ok($$update public.flow_sessions set revision=99 where id='74000000-0000-0000-0000-000000000031'$$,'42501',null,'normal clients cannot bypass atomic revision RPC');
select is((select revision from public.flow_sessions where id='74000000-0000-0000-0000-000000000031'),0,'revision remains unchanged');
select * from finish();rollback;
