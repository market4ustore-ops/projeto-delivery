begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','catalog-a@test.local','',now(),now(),now()),
('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','catalog-b@test.local','',now(),now(),now());
insert into public.organizations(id,name) values ('10000000-0000-0000-0000-000000000011','Catalog A'),('10000000-0000-0000-0000-000000000012','Catalog B');
insert into public.organization_members values ('10000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000011','OWNER',now(),now()),('10000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000012','OWNER',now(),now());
insert into public.locations(id,organization_id,name) values ('20000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000011','Location A'),('20000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000012','Location B');
insert into public.categories(id,location_id,name,slug) values ('30000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000011','Category A','category-a'),('30000000-0000-0000-0000-000000000012','20000000-0000-0000-0000-000000000012','Category B','category-b');
insert into public.products(id,location_id,category_id,name,slug,base_price) values ('40000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000011','30000000-0000-0000-0000-000000000011','Product A','product-a',10),('40000000-0000-0000-0000-000000000012','20000000-0000-0000-0000-000000000012','30000000-0000-0000-0000-000000000012','Product B','product-b',10);
insert into public.modifier_groups(id,product_id,name,max_selections) values ('60000000-0000-0000-0000-000000000012','40000000-0000-0000-0000-000000000012','Group B',1);
set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true); select set_config('request.jwt.claim.role','authenticated',true);
select results_eq('select name from public.categories',array['Category A'],'reads own category');
select is((select count(*)::int from public.categories where id='30000000-0000-0000-0000-000000000012'),0,'cannot read foreign category');
select lives_ok($$insert into public.categories(location_id,name,slug) values ('20000000-0000-0000-0000-000000000011','New A','new-a')$$,'creates own category');
select throws_ok($$insert into public.categories(location_id,name,slug) values ('20000000-0000-0000-0000-000000000012','Forged','forged')$$,'42501',null,'cannot create foreign category');
select is((select count(*)::int from public.products where id='40000000-0000-0000-0000-000000000012'),0,'cannot read foreign product UUID');
select lives_ok($$update public.products set name='Forged' where id='40000000-0000-0000-0000-000000000012'$$,'foreign update affects no visible row');
reset role;
select throws_ok($$insert into public.products(location_id,category_id,name,slug,base_price) values ('20000000-0000-0000-0000-000000000011','30000000-0000-0000-0000-000000000012','Cross','cross',1)$$,'23503',null,'composite FK blocks cross-location category');
set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true); select set_config('request.jwt.claim.role','authenticated',true);
select throws_ok($$insert into public.product_variants(product_id,name,price) values ('40000000-0000-0000-0000-000000000012','Forged',1)$$,'42501',null,'cannot create variant for foreign product');
select throws_ok($$insert into public.modifier_groups(product_id,name,max_selections) values ('40000000-0000-0000-0000-000000000012','Forged',1)$$,'42501',null,'cannot create group for foreign product');
select throws_ok($$insert into public.modifier_options(modifier_group_id,name,price_delta) values ('60000000-0000-0000-0000-000000000012','Forged',1)$$,'42501',null,'cannot create option for foreign group');
select is((select count(*)::int from public.products where name='Forged'),0,'foreign product remained unchanged');
select * from finish(); rollback;
