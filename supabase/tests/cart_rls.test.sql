begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.organizations(id,name) values
  ('10000000-0000-0000-0000-000000000061','Cart A'),
  ('10000000-0000-0000-0000-000000000062','Cart B');
insert into public.locations(id,organization_id,name,slug) values
  ('20000000-0000-0000-0000-000000000061','10000000-0000-0000-0000-000000000061','Cart Location A','cart-a'),
  ('20000000-0000-0000-0000-000000000062','10000000-0000-0000-0000-000000000062','Cart Location B','cart-b');
insert into public.categories(id,location_id,name,slug) values
  ('30000000-0000-0000-0000-000000000061','20000000-0000-0000-0000-000000000061','Burgers','burgers'),
  ('30000000-0000-0000-0000-000000000062','20000000-0000-0000-0000-000000000062','Other','other');
insert into public.products(id,location_id,category_id,name,slug,base_price) values
  ('40000000-0000-0000-0000-000000000061','20000000-0000-0000-0000-000000000061','30000000-0000-0000-0000-000000000061','Burger','burger',10),
  ('40000000-0000-0000-0000-000000000062','20000000-0000-0000-0000-000000000062','30000000-0000-0000-0000-000000000062','Foreign','foreign',99),
  ('40000000-0000-0000-0000-000000000063','20000000-0000-0000-0000-000000000061','30000000-0000-0000-0000-000000000061','Unavailable','unavailable',10);
update public.products set is_available=false where id='40000000-0000-0000-0000-000000000063';
insert into public.product_variants(id,product_id,name,price,is_default) values
  ('50000000-0000-0000-0000-000000000061','40000000-0000-0000-0000-000000000061','Large',12,true);
insert into public.modifier_groups(id,product_id,name,min_selections,max_selections,is_required) values
  ('60000000-0000-0000-0000-000000000061','40000000-0000-0000-0000-000000000061','Sauce',1,1,true);
insert into public.modifier_options(id,modifier_group_id,name,price_delta) values
  ('61000000-0000-0000-0000-000000000061','60000000-0000-0000-0000-000000000061','Special',2.50);

select ok(not has_table_privilege('anon','public.carts','select'),'anon cannot select carts');
select ok(not has_table_privilege('anon','public.cart_items','select'),'anon cannot select cart items');
select ok(not has_table_privilege('anon','public.cart_item_modifiers','select'),'anon cannot select modifiers');
select ok(has_function_privilege('anon','public.create_public_cart(text)','execute'),'anon can execute scoped cart RPC');

set local role anon;
create temporary table cart_result as select public.create_public_cart('cart-a') value;
select is(length(value->>'publicToken'),64,'cart returns a 256-bit opaque token') from cart_result;
select is(public.get_public_cart('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') is null,true,'invalid token reveals nothing');
select is(public.get_public_product_configuration((select value->>'publicToken' from cart_result),'40000000-0000-0000-0000-000000000061')->>'name','Burger','token reads configuration only in its location');
select is(public.get_public_product_configuration((select value->>'publicToken' from cart_result),'40000000-0000-0000-0000-000000000062') is null,true,'cross-location product is hidden');

create temporary table mutation_result as select public.mutate_public_cart(
  (select value->>'publicToken' from cart_result),0,'90000000-0000-0000-0000-000000000061',
  '{"type":"ADD","productId":"40000000-0000-0000-0000-000000000061","variantId":"50000000-0000-0000-0000-000000000061","modifierOptionIds":["61000000-0000-0000-0000-000000000061"],"quantity":2}'::jsonb
) value;
select is(value->>'subtotal','29.00','server computes variant plus modifiers times quantity') from mutation_result;
select is(public.mutate_public_cart((select value->>'publicToken' from cart_result),0,'90000000-0000-0000-0000-000000000061','{"type":"REMOVE","itemId":"ffffffff-ffff-ffff-ffff-ffffffffffff"}'::jsonb)->>'revision','1','idempotent retry returns cached response before revision check');
select throws_ok($$select public.mutate_public_cart((select value->>'publicToken' from cart_result),0,'90000000-0000-0000-0000-000000000062','{"type":"REMOVE","itemId":"ffffffff-ffff-ffff-ffff-ffffffffffff"}'::jsonb)$$,'P0001','CART_REVISION_CONFLICT','stale revision is rejected');
select throws_ok($$select public.mutate_public_cart((select value->>'publicToken' from cart_result),1,'90000000-0000-0000-0000-000000000063','{"type":"ADD","productId":"40000000-0000-0000-0000-000000000061","variantId":"50000000-0000-0000-0000-000000000061","modifierOptionIds":[],"quantity":1}'::jsonb)$$,'P0001','MODIFIER_MIN_NOT_MET','required modifier is enforced');
select throws_ok($$select public.mutate_public_cart((select value->>'publicToken' from cart_result),1,'90000000-0000-0000-0000-000000000064','{"type":"ADD","productId":"40000000-0000-0000-0000-000000000062","modifierOptionIds":[],"quantity":1}'::jsonb)$$,'P0001','CROSS_LOCATION_REFERENCE','cross-location product injection is rejected');
select throws_ok($$select public.mutate_public_cart((select value->>'publicToken' from cart_result),1,'90000000-0000-0000-0000-000000000065','{"type":"ADD","productId":"40000000-0000-0000-0000-000000000063","modifierOptionIds":[],"quantity":1}'::jsonb)$$,'P0001','PRODUCT_NOT_AVAILABLE','unavailable product is rejected');

select * from finish();
rollback;
