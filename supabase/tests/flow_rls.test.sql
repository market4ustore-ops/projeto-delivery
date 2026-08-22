begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000000','authenticated','authenticated','flow-a@test.local','',now(),now(),now()),
('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000000','authenticated','authenticated','flow-b@test.local','',now(),now(),now()),
('00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000000','authenticated','authenticated','flow-cashier@test.local','',now(),now(),now());
insert into public.organizations(id,name) values('10000000-0000-0000-0000-000000000021','Flow Org A'),('10000000-0000-0000-0000-000000000022','Flow Org B');
insert into public.organization_members(organization_id,user_id,role) values('10000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000021','OWNER'),('10000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000022','OWNER'),('10000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000023','CASHIER');
insert into public.locations(id,organization_id,name) values('20000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000021','Flow Location A'),('20000000-0000-0000-0000-000000000022','10000000-0000-0000-0000-000000000022','Flow Location B');
insert into public.location_members(location_id,user_id) values('20000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000023');
insert into public.flows(id,location_id,name,slug) values('70000000-0000-0000-0000-000000000021','20000000-0000-0000-0000-000000000021','Flow A','flow-a'),('70000000-0000-0000-0000-000000000022','20000000-0000-0000-0000-000000000022','Flow B','flow-b');
insert into public.flow_versions(id,flow_id,version_number) values('71000000-0000-0000-0000-000000000021','70000000-0000-0000-0000-000000000021',1),('71000000-0000-0000-0000-000000000022','70000000-0000-0000-0000-000000000022',1);
insert into public.flow_nodes(id,flow_version_id,type,config) values('72000000-0000-0000-0000-000000000021','71000000-0000-0000-0000-000000000021','START','{}'),('72000000-0000-0000-0000-000000000023','71000000-0000-0000-0000-000000000021','END','{}'),('72000000-0000-0000-0000-000000000022','71000000-0000-0000-0000-000000000022','START','{}');
insert into public.flow_edges(id,flow_version_id,source_node_id,target_node_id) values('73000000-0000-0000-0000-000000000021','71000000-0000-0000-0000-000000000021','72000000-0000-0000-0000-000000000021','72000000-0000-0000-0000-000000000023');
set local role authenticated;select set_config('request.jwt.claim.role','authenticated',true);select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
select results_eq('select name from public.flows',array['Flow A'],'reads own flow');
select is((select count(*)::int from public.flows where id='70000000-0000-0000-0000-000000000022'),0,'known foreign UUID reveals nothing');
select throws_ok($$select public.create_flow('20000000-0000-0000-0000-000000000022','Forged Flow','forged-flow')$$,'42501','permission denied','cannot write foreign location');
select throws_ok($$insert into public.flow_versions(flow_id,version_number) values('70000000-0000-0000-0000-000000000022',2)$$,'42501',null,'cannot create foreign version');
select throws_ok($$insert into public.flow_nodes(flow_version_id,type,config) values('71000000-0000-0000-0000-000000000022','END','{}')$$,'42501',null,'cannot create foreign node');
select throws_ok($$insert into public.flow_edges(flow_version_id,source_node_id,target_node_id) values('71000000-0000-0000-0000-000000000021','72000000-0000-0000-0000-000000000021','72000000-0000-0000-0000-000000000022')$$,'23503',null,'composite FK blocks cross-version edge');
select lives_ok($$select public.publish_flow_version('71000000-0000-0000-0000-000000000021')$$,'owner publishes valid draft');
select is((select published_version_id from public.flows where id='70000000-0000-0000-0000-000000000021'),'71000000-0000-0000-0000-000000000021'::uuid,'flow points to own published version');
select throws_ok($$update public.flow_nodes set name='mutated' where id='72000000-0000-0000-0000-000000000021'$$,'55000',null,'published node is immutable');
select is((select count(*)::int from public.flow_audit_logs where event_type='FLOW_PUBLISHED'),1,'publication is audited');
select public.ensure_flow_draft('70000000-0000-0000-0000-000000000021');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000023',true);
select throws_ok($$select public.publish_flow_version((select id from public.flow_versions where flow_id='70000000-0000-0000-0000-000000000021' and status='DRAFT'))$$,'42501','permission denied','flow.read without publish cannot publish');
select throws_ok($$select public.create_flow('20000000-0000-0000-0000-000000000021','Cashier draft','cashier-draft')$$,'42501','permission denied','flow.read without write cannot create');
select * from finish();rollback;
