begin;
create extension if not exists pgtap with schema extensions;
select plan(6);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000000','authenticated','authenticated','builder-a@test.local','',now(),now(),now()),
('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000000','authenticated','authenticated','builder-b@test.local','',now(),now(),now());
insert into public.organizations(id,name) values('10000000-0000-0000-0000-000000000051','Builder Org A'),('10000000-0000-0000-0000-000000000052','Builder Org B');
insert into public.organization_members(organization_id,user_id,role) values('10000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000051','OWNER'),('10000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000052','OWNER');
insert into public.locations(id,organization_id,name) values('20000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000051','Builder Location A'),('20000000-0000-0000-0000-000000000052','10000000-0000-0000-0000-000000000052','Builder Location B');
set local role authenticated;select set_config('request.jwt.claim.role','authenticated',true);select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000051',true);
select public.create_flow('20000000-0000-0000-0000-000000000051','Builder Flow','builder-flow');
select is((select count(*)::int from public.flow_nodes n join public.flow_versions v on v.id=n.flow_version_id join public.flows f on f.id=v.flow_id where f.slug='builder-flow' and n.type='START'),1,'builder flow starts with exactly one automatic start');
select is((select name from public.flow_nodes n join public.flow_versions v on v.id=n.flow_version_id join public.flows f on f.id=v.flow_id where f.slug='builder-flow' and n.type='START'),'Comece aqui','automatic start has friendly name');
select lives_ok($$select public.update_flow_draft_node(n.id,n.updated_at,'Comece aqui','{}','{"position":{"x":10,"y":20}}') from public.flow_nodes n join public.flow_versions v on v.id=n.flow_version_id join public.flows f on f.id=v.flow_id where f.slug='builder-flow' and n.type='START'$$,'owner updates own draft with expected timestamp');
select set_config('test.builder_node',(select n.id::text from public.flow_nodes n join public.flow_versions v on v.id=n.flow_version_id join public.flows f on f.id=v.flow_id where f.slug='builder-flow' and n.type='START'),false);
select throws_ok($$select public.update_flow_draft_node(n.id,n.updated_at - interval '1 second','Comece aqui','{}','{}') from public.flow_nodes n join public.flow_versions v on v.id=n.flow_version_id join public.flows f on f.id=v.flow_id where f.slug='builder-flow' and n.type='START'$$,'40001','draft changed; reload before saving','stale editor update is rejected');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000052',true);
select throws_ok($$select public.update_flow_draft_node(current_setting('test.builder_node')::uuid,now(),'Forged','{}','{}')$$,'42501','permission denied','foreign tenant cannot edit draft');
select throws_ok($$select public.replace_flow_draft_branches(current_setting('test.builder_node')::uuid,'[]')$$,'42501','permission denied','foreign tenant cannot replace branches');
select * from finish();rollback;
