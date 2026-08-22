begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000000','authenticated','authenticated','orders-a@test.local','',now(),now(),now()),
('00000000-0000-0000-0000-000000000082','00000000-0000-0000-0000-000000000000','authenticated','authenticated','orders-b@test.local','',now(),now(),now());
insert into public.organizations(id,name) values('10000000-0000-0000-0000-000000000081','Orders A'),('10000000-0000-0000-0000-000000000082','Orders B');
insert into public.organization_members(organization_id,user_id,role) values('10000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000081','OWNER'),('10000000-0000-0000-0000-000000000082','00000000-0000-0000-0000-000000000082','OWNER');
insert into public.locations(id,organization_id,name,slug,checkout_delivery_fee) values('20000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081','Orders Location A','orders-a',5),('20000000-0000-0000-0000-000000000082','10000000-0000-0000-0000-000000000082','Orders Location B','orders-b',9);
insert into public.categories(id,location_id,name,slug) values('30000000-0000-0000-0000-000000000081','20000000-0000-0000-0000-000000000081','Meals','meals');
insert into public.products(id,location_id,category_id,name,slug,base_price) values('40000000-0000-0000-0000-000000000081','20000000-0000-0000-0000-000000000081','30000000-0000-0000-0000-000000000081','Meal','meal',20);
insert into public.carts(id,location_id,public_token_hash,status,revision) values('50000000-0000-0000-0000-000000000081','20000000-0000-0000-0000-000000000081',encode(extensions.digest(repeat('a',64),'sha256'),'hex'),'ACTIVE',1);
insert into public.cart_items(id,cart_id,product_id,product_name_snapshot,unit_price_snapshot,quantity,line_total) values('60000000-0000-0000-0000-000000000081','50000000-0000-0000-0000-000000000081','40000000-0000-0000-0000-000000000081','Meal',20,2,40);
insert into public.checkout_sessions(id,location_id,cart_id,status,revision,fulfillment_type,customer_name,customer_phone,postal_code,street,address_number,neighborhood,city,state,subtotal,delivery_fee,total,cart_revision_validated) values('70000000-0000-0000-0000-000000000081','20000000-0000-0000-0000-000000000081','50000000-0000-0000-0000-000000000081','READY',4,'DELIVERY','Ana Silva','11999999999','01001000','Praca da Se','1','Se','Sao Paulo','SP',40,5,45,1);

select ok(not has_table_privilege('anon','public.orders','select'),'anon cannot enumerate orders');
select ok(not has_table_privilege('anon','public.order_items','select'),'anon cannot enumerate order items');
select ok(has_function_privilege('anon','public.create_order_from_checkout(text,uuid)','execute'),'anon can use scoped conversion');
set local role anon;
create temporary table made as select public.create_order_from_checkout(repeat('a',64),'80000000-0000-0000-0000-000000000081') value;
select is(value->>'status','CONFIRMED','ready checkout becomes confirmed order') from made;
select is(value->>'displayNumber','0001','first location display number is deterministic') from made;
select is(value->>'total','45.00','authoritative total is snapshotted') from made;
select is(value->'items'->0->>'name','Meal','item name is snapshotted') from made;
select is(public.create_order_from_checkout(repeat('a',64),'80000000-0000-0000-0000-000000000082')->>'displayNumber','0001','conversion retry is idempotent');
select is(public.get_public_order_status(repeat('b',64)) is null,true,'unrelated opaque token reveals nothing');
select is(public.get_public_order_status(repeat('a',64))->'customer','null'::jsonb,'public projection hides customer data');
select is(public.get_public_order_status(repeat('a',64))->'timeline','null'::jsonb,'public projection hides internal history');
reset role;
select is((select status from public.checkout_sessions where id='70000000-0000-0000-0000-000000000081'),'COMPLETED','checkout is consumed atomically');
select is((select status::text from public.carts where id='50000000-0000-0000-0000-000000000081'),'CONVERTED','cart is consumed atomically');
select is((select count(*)::integer from public.orders),1,'retry creates exactly one order');
select is((select count(*)::integer from public.order_status_history),1,'creation history is immutable fact');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000082',true);
select is((select count(*)::integer from public.orders),0,'foreign tenant cannot read order');
select throws_ok($$select public.update_order_status('70000000-0000-0000-0000-000000000081',0,'PREPARING',null)$$,'P0001','ORDER_NOT_FOUND','foreign tenant cannot mutate order');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000081',true);
select is(jsonb_array_length(public.list_orders('20000000-0000-0000-0000-000000000081')),1,'authorized admin RPC returns location orders');
select is(public.update_order_status((select id from public.orders),0,'PREPARING',null)->>'revision','1','authorized transition increments revision');
select throws_ok($$select public.update_order_status((select id from public.orders),0,'READY',null)$$,'P0001','ORDER_REVISION_CONFLICT','stale command is rejected');
select throws_ok($$select public.update_order_status((select id from public.orders),1,'DELIVERED',null)$$,'P0001','INVALID_ORDER_TRANSITION','invalid transition is rejected');
select * from finish();
rollback;
