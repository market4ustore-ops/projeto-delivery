begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.local','',now(),now(),now()),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.local','',now(),now(),now()),
('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','none@test.local','',now(),now(),now()),
('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cashier@test.local','',now(),now(),now());

insert into public.organizations(id,name) values
('10000000-0000-0000-0000-000000000001','Organization A'),
('10000000-0000-0000-0000-000000000002','Organization B');
insert into public.organization_members(organization_id,user_id,role) values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','OWNER'),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','OWNER'),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','CASHIER');
insert into public.locations(id,organization_id,name) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Location A'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Location B');
insert into public.location_members(location_id,user_id) values
('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select results_eq('select name from public.organizations order by name', array['Organization A'], 'member reads own organization only');
select results_eq('select name from public.locations order by name', array['Location A'], 'owner reads locations in own organization only');
select is((select count(*)::integer from public.organizations where id='10000000-0000-0000-0000-000000000002'),0,'foreign UUID does not reveal organization');
select is((select count(*)::integer from public.locations where id='20000000-0000-0000-0000-000000000002'),0,'foreign UUID does not reveal location');
select lives_ok($$update public.organizations set name='Compromised' where id='10000000-0000-0000-0000-000000000002'$$, 'foreign update leaks no error or row');
select throws_ok($$select public.create_location('10000000-0000-0000-0000-000000000002','Forged')$$, '42501', 'permission denied', 'cannot forge organization in create location RPC');
select lives_ok($$select public.create_location('10000000-0000-0000-0000-000000000001','Allowed')$$, 'owner creates location in own organization');
select is((select count(*)::integer from public.locations where organization_id='10000000-0000-0000-0000-000000000001'),2,'created location belongs to trusted authorized organization');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select is((select count(*)::integer from public.organizations),0,'non-member reads no organizations');
select is((select count(*)::integer from public.locations),0,'non-member reads no locations');
select throws_ok($$select public.create_location('10000000-0000-0000-0000-000000000001','Forged')$$, '42501', 'permission denied', 'non-member cannot create by UUID');
select ok(not public.can_access_location('20000000-0000-0000-0000-000000000001'),'location access requires membership');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select ok(public.can_access_location('20000000-0000-0000-0000-000000000001'),'cashier accesses explicitly assigned location');
select ok(not public.can_access_location('20000000-0000-0000-0000-000000000002'),'cashier cannot access foreign location');

reset role;
select is((select name from public.organizations where id='10000000-0000-0000-0000-000000000002'),'Organization B','foreign update changed no row');

select * from finish();
rollback;
