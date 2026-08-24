begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000000','authenticated','authenticated','kitchen-a@test.local','',now(),now(),now()),
('00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000000','authenticated','authenticated','kitchen-b@test.local','',now(),now(),now()),
('00000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000000','authenticated','authenticated','no-kitchen@test.local','',now(),now(),now());
insert into public.organizations(id,name) values('10000000-0000-0000-0000-000000000091','Kitchen A'),('10000000-0000-0000-0000-000000000092','Kitchen B');
insert into public.organization_members(organization_id,user_id,role) values('10000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000091','KITCHEN'),('10000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000092','KITCHEN');
insert into public.locations(id,organization_id,name,slug) values('20000000-0000-0000-0000-000000000091','10000000-0000-0000-0000-000000000091','Kitchen Location A','kitchen-a'),('20000000-0000-0000-0000-000000000092','10000000-0000-0000-0000-000000000092','Kitchen Location B','kitchen-b');
insert into public.location_members(location_id,user_id) values('20000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000091'),('20000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000092');
insert into public.carts(id,location_id,public_token_hash,status) values('50000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091',repeat('a',64),'CONVERTED'),('50000000-0000-0000-0000-000000000092','20000000-0000-0000-0000-000000000092',repeat('b',64),'CONVERTED');
insert into public.checkout_sessions(id,location_id,cart_id,status,fulfillment_type,customer_name,customer_phone,subtotal,delivery_fee,total) values('60000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091','50000000-0000-0000-0000-000000000091','COMPLETED','PICKUP','Ana','11999999999',20,0,20),('60000000-0000-0000-0000-000000000092','20000000-0000-0000-0000-000000000092','50000000-0000-0000-0000-000000000092','COMPLETED','DELIVERY','Bia','11888888888',30,0,30);
insert into public.orders(id,location_id,checkout_id,display_number,status,fulfillment_type,customer_name,customer_phone,delivery_address_snapshot,subtotal,delivery_fee,total) values('70000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091','60000000-0000-0000-0000-000000000091',1,'CONFIRMED','PICKUP','Ana','11999999999',null,20,0,20),('70000000-0000-0000-0000-000000000092','20000000-0000-0000-0000-000000000092','60000000-0000-0000-0000-000000000092',1,'CONFIRMED','DELIVERY','Bia','11888888888','{"street":"Secret"}',30,0,30);
insert into public.order_items(id,order_id,product_name_snapshot,unit_price,quantity,line_total) values('80000000-0000-0000-0000-000000000091','70000000-0000-0000-0000-000000000091','Burger',20,1,20);

select ok(not has_function_privilege('anon','public.list_kitchen_orders(uuid)','execute'),'public client cannot open Kitchen');
select ok(has_function_privilege('authenticated','public.list_kitchen_orders(uuid)','execute'),'authenticated role can reach authorized boundary');
select results_eq($$select column_name::text from information_schema.columns where table_schema='public' and table_name='kitchen_order_signals' order by column_name$$,array['changed_at','location_id','order_id','revision'],'realtime signal payload is minimal');
select ok((select count(*)=1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='kitchen_order_signals'),'minimal signal is published to Realtime');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000091',true);
create temporary table kitchen_a as select public.list_kitchen_orders('20000000-0000-0000-0000-000000000091') value;
select is(jsonb_array_length(value),1,'Kitchen reads its authorized location') from kitchen_a;
select is(value->0->>'displayNumber','0001','Kitchen receives display number') from kitchen_a;
select is(value->0->'items'->0->>'name','Burger','Kitchen receives preparation snapshot') from kitchen_a;
select is(value->0 ? 'customer',false,'Kitchen projection omits customer') from kitchen_a;
select is(value->0 ? 'total',false,'Kitchen projection omits financial totals') from kitchen_a;
select is(value->0 ? 'address',false,'Kitchen projection omits address') from kitchen_a;
select is((select count(*)::integer from public.kitchen_order_signals),1,'signal RLS excludes foreign location');
select is(jsonb_array_length(public.list_kitchen_orders('20000000-0000-0000-0000-000000000092')),0,'known foreign location UUID returns no orders');
select throws_ok($$select public.update_kitchen_order_status('70000000-0000-0000-0000-000000000092',0,'PREPARING')$$,'P0001','ORDER_NOT_FOUND','cross-location mutation is rejected');
select is(public.update_kitchen_order_status('70000000-0000-0000-0000-000000000091',0,'PREPARING')->>'status','PREPARING','Kitchen starts preparation');
select throws_ok($$select public.update_kitchen_order_status('70000000-0000-0000-0000-000000000091',0,'READY')$$,'P0001','ORDER_REVISION_CONFLICT','stale revision is rejected');
select is(public.update_kitchen_order_status('70000000-0000-0000-0000-000000000091',1,'READY')->>'status','READY','Kitchen marks order ready');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000093',true);
select is(jsonb_array_length(public.list_kitchen_orders('20000000-0000-0000-0000-000000000091')),0,'user without orders.read cannot open board');
select throws_ok($$select public.update_kitchen_order_status('70000000-0000-0000-0000-000000000091',2,'READY')$$,'P0001','ORDER_NOT_FOUND','user without orders.update cannot mutate status');
select * from finish();
rollback;
