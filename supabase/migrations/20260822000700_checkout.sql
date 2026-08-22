create type public.checkout_status as enum ('IN_PROGRESS','READY','EXPIRED','CANCELED');
create type public.fulfillment_type as enum ('DELIVERY','PICKUP');

alter table public.locations add column checkout_delivery_enabled boolean not null default true;
alter table public.locations add column checkout_delivery_fee numeric(12,2) not null default 0 check(checkout_delivery_fee>=0);

create table public.checkout_sessions(
 id uuid primary key default gen_random_uuid(), location_id uuid not null, cart_id uuid not null unique,
 status public.checkout_status not null default 'IN_PROGRESS', fulfillment_type public.fulfillment_type,
 customer_name text, customer_phone text, postal_code text, street text, address_number text, complement text,
 neighborhood text, city text, state text, reference text, scheduled_for timestamptz,
 subtotal numeric(12,2) not null default 0 check(subtotal>=0), delivery_fee numeric(12,2) not null default 0 check(delivery_fee>=0), total numeric(12,2) not null default 0 check(total>=0),
 cart_revision_validated integer, revision integer not null default 0 check(revision>=0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '2 hours'),
 foreign key(location_id,cart_id) references public.carts(location_id,id) on delete cascade
);
create table public.checkout_commands(checkout_id uuid not null references public.checkout_sessions(id) on delete cascade,idempotency_key uuid not null,response jsonb not null,created_at timestamptz not null default now(),primary key(checkout_id,idempotency_key));
create index checkout_location_idx on public.checkout_sessions(location_id,status);
alter table public.checkout_sessions enable row level security;alter table public.checkout_commands enable row level security;

create function private.checkout_json(target_checkout_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',x.id,'status',x.status,'revision',x.revision,'fulfillmentType',x.fulfillment_type,'customer',case when x.customer_name is null then null else jsonb_build_object('name',x.customer_name,'phone',x.customer_phone) end,'address',case when x.postal_code is null then null else jsonb_build_object('postalCode',x.postal_code,'street',x.street,'number',x.address_number,'complement',x.complement,'neighborhood',x.neighborhood,'city',x.city,'state',x.state,'reference',x.reference) end,'scheduledFor',x.scheduled_for,'subtotal',x.subtotal::text,'deliveryFee',x.delivery_fee::text,'total',x.total::text,'cartRevisionValidated',x.cart_revision_validated,'cartRevision',c.revision,'expiresAt',x.expires_at,'items',(private.cart_json(c.id)->'items')) from public.checkout_sessions x join public.carts c on c.id=x.cart_id where x.id=target_checkout_id
$$;
revoke all on function private.checkout_json(uuid) from public;

create function private.invalidate_checkout_on_cart_change() returns trigger language plpgsql security definer set search_path='' as $$begin if new.revision<>old.revision then update public.checkout_sessions set status='IN_PROGRESS',cart_revision_validated=null,updated_at=now() where cart_id=new.id and status='READY';end if;return new;end$$;
revoke all on function private.invalidate_checkout_on_cart_change() from public;
create trigger invalidate_ready_checkout after update of revision on public.carts for each row execute function private.invalidate_checkout_on_cart_change();

create function public.start_public_checkout(cart_token text,target_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare c public.carts;x public.checkout_sessions;begin
 select * into c from public.carts where public_token_hash=encode(extensions.digest(cart_token,'sha256'),'hex') for update;
 if c.id is null then raise exception 'CHECKOUT_NOT_FOUND';end if;if c.status<>'ACTIVE' or c.expires_at<=now() then raise exception 'CART_NOT_ACTIVE';end if;
 select * into x from public.checkout_sessions where cart_id=c.id;
 if x.id is null then insert into public.checkout_sessions(location_id,cart_id,subtotal,total) values(c.location_id,c.id,c.subtotal,c.subtotal) returning * into x;end if;
 return private.checkout_json(x.id);end$$;

create function public.get_public_checkout(cart_token text) returns jsonb language plpgsql security definer set search_path='' as $$declare xid uuid;begin
 select x.id into xid from public.checkout_sessions x join public.carts c on c.id=x.cart_id where c.public_token_hash=encode(extensions.digest(cart_token,'sha256'),'hex');if xid is null then return null;end if;update public.checkout_sessions set status='EXPIRED',updated_at=now() where id=xid and status in('IN_PROGRESS','READY') and expires_at<=now();return private.checkout_json(xid);end$$;

create function public.mutate_public_checkout(cart_token text,expected_revision integer,target_idempotency_key uuid,action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare x public.checkout_sessions;c public.carts;cached jsonb;kind text;result jsonb;authoritative_subtotal numeric(12,2):=0;authoritative_unit numeric(12,2);modifier_total numeric(12,2);item record;changes jsonb:='[]';begin
 select x0.* into x from public.checkout_sessions x0 join public.carts c0 on c0.id=x0.cart_id where c0.public_token_hash=encode(extensions.digest(cart_token,'sha256'),'hex') for update of x0;
 if x.id is null then raise exception 'CHECKOUT_NOT_FOUND';end if;select * into c from public.carts where id=x.cart_id for update;
 select response into cached from public.checkout_commands where checkout_id=x.id and idempotency_key=target_idempotency_key;if cached is not null then return cached;end if;
 if x.expires_at<=now() then update public.checkout_sessions set status='EXPIRED' where id=x.id;raise exception 'CHECKOUT_EXPIRED';end if;if x.status not in('IN_PROGRESS','READY') then raise exception 'CHECKOUT_NOT_ACTIVE';end if;if x.revision<>expected_revision then raise exception 'CHECKOUT_REVISION_CONFLICT';end if;
 kind:=action->>'type';
 if kind='CUSTOMER' then update public.checkout_sessions set customer_name=btrim(action->>'name'),customer_phone=btrim(action->>'phone'),status='IN_PROGRESS',cart_revision_validated=null,revision=revision+1,updated_at=now(),expires_at=now()+interval '2 hours' where id=x.id;
 elsif kind='FULFILLMENT' then update public.checkout_sessions set fulfillment_type=(action->>'fulfillmentType')::public.fulfillment_type,status='IN_PROGRESS',cart_revision_validated=null,revision=revision+1,updated_at=now(),expires_at=now()+interval '2 hours' where id=x.id;
 elsif kind='ADDRESS' then update public.checkout_sessions set postal_code=regexp_replace(action->'address'->>'postalCode','\D','','g'),street=btrim(action->'address'->>'street'),address_number=btrim(action->'address'->>'number'),complement=nullif(btrim(action->'address'->>'complement'),''),neighborhood=btrim(action->'address'->>'neighborhood'),city=btrim(action->'address'->>'city'),state=upper(action->'address'->>'state'),reference=nullif(btrim(action->'address'->>'reference'),''),status='IN_PROGRESS',cart_revision_validated=null,revision=revision+1,updated_at=now(),expires_at=now()+interval '2 hours' where id=x.id;
 elsif kind='CANCEL' then update public.checkout_sessions set status='CANCELED',revision=revision+1,updated_at=now() where id=x.id;
 elsif kind='VALIDATE' then
  if c.status<>'ACTIVE' or c.expires_at<=now() then raise exception 'CART_NOT_ACTIVE';end if;if not exists(select 1 from public.cart_items where cart_id=c.id) then raise exception 'CART_NOT_ACTIVE';end if;
  if x.customer_name is null or char_length(btrim(x.customer_name))<2 or x.customer_phone is null or char_length(btrim(x.customer_phone))<8 then raise exception 'CUSTOMER_INFO_REQUIRED';end if;if x.fulfillment_type is null then raise exception 'FULFILLMENT_REQUIRED';end if;
  if x.fulfillment_type='DELIVERY' then if x.postal_code is null or x.street is null or x.address_number is null or x.neighborhood is null or x.city is null or x.state is null or char_length(x.postal_code)<>8 or x.state!~'^[A-Z]{2}$' then raise exception 'INVALID_ADDRESS';end if;if not(select checkout_delivery_enabled from public.locations where id=x.location_id) then raise exception 'DELIVERY_NOT_AVAILABLE';end if;end if;
  for item in select i.* from public.cart_items i where i.cart_id=c.id loop
   if not exists(select 1 from public.products p where p.id=item.product_id and p.location_id=x.location_id and p.is_active and p.is_available) then raise exception 'PRODUCT_NOT_AVAILABLE';end if;
   if item.variant_id is not null then select v.price into authoritative_unit from public.product_variants v where v.id=item.variant_id and v.product_id=item.product_id and v.is_active;if authoritative_unit is null then raise exception 'VARIANT_NOT_AVAILABLE';end if;else select p.base_price into authoritative_unit from public.products p where p.id=item.product_id;end if;
   if exists(select 1 from public.cart_item_modifiers m left join public.modifier_options o on o.id=m.modifier_option_id and o.is_available left join public.modifier_groups g on g.id=o.modifier_group_id and g.product_id=item.product_id and g.is_active where m.cart_item_id=item.id and (o.id is null or g.id is null)) then raise exception 'MODIFIER_NOT_AVAILABLE';end if;
   select coalesce(sum(o.price_delta),0) into modifier_total from public.cart_item_modifiers m join public.modifier_options o on o.id=m.modifier_option_id where m.cart_item_id=item.id;authoritative_unit:=authoritative_unit+modifier_total;authoritative_subtotal:=authoritative_subtotal+(authoritative_unit*item.quantity);
   if authoritative_unit<>item.unit_price_snapshot then changes:=changes||jsonb_build_array(jsonb_build_object('itemId',item.id,'name',item.product_name_snapshot,'oldUnitPrice',item.unit_price_snapshot::text,'newUnitPrice',authoritative_unit::text));end if;
  end loop;
  if jsonb_array_length(changes)>0 or authoritative_subtotal<>c.subtotal then update public.checkout_sessions set status='IN_PROGRESS',cart_revision_validated=null,revision=revision+1,updated_at=now() where id=x.id;result:=jsonb_build_object('outcome','PRICE_CHANGED','changes',changes,'checkout',private.checkout_json(x.id));insert into public.checkout_commands values(x.id,target_idempotency_key,result);return result;end if;
  update public.checkout_sessions set status='READY',subtotal=authoritative_subtotal,delivery_fee=case when x.fulfillment_type='DELIVERY' then (select checkout_delivery_fee from public.locations where id=x.location_id) else 0 end,total=authoritative_subtotal+case when x.fulfillment_type='DELIVERY' then (select checkout_delivery_fee from public.locations where id=x.location_id) else 0 end,cart_revision_validated=c.revision,revision=revision+1,updated_at=now(),expires_at=now()+interval '2 hours' where id=x.id;
 else raise exception 'CHECKOUT_NOT_ACTIVE';end if;
 result:=private.checkout_json(x.id);insert into public.checkout_commands values(x.id,target_idempotency_key,result);return result;end$$;

revoke all on function public.start_public_checkout(text,uuid),public.get_public_checkout(text),public.mutate_public_checkout(text,integer,uuid,jsonb) from public;
grant execute on function public.start_public_checkout(text,uuid),public.get_public_checkout(text),public.mutate_public_checkout(text,integer,uuid,jsonb) to anon,authenticated;
