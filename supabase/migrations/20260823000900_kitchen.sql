create table public.kitchen_order_signals (
  order_id uuid primary key references public.orders(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  revision integer not null check (revision >= 0),
  changed_at timestamptz not null default now(),
  unique (location_id, order_id)
);
create index kitchen_order_signals_location_changed_idx
  on public.kitchen_order_signals(location_id, changed_at desc);
alter table public.kitchen_order_signals enable row level security;
create policy kitchen_signals_read on public.kitchen_order_signals
  for select to authenticated
  using (private.can_order(location_id, 'orders.read'));
grant select on public.kitchen_order_signals to authenticated;

create function private.signal_kitchen_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.kitchen_order_signals(order_id, location_id, revision, changed_at)
  values(new.id, new.location_id, new.revision, now())
  on conflict(order_id) do update
    set revision=excluded.revision, changed_at=excluded.changed_at;
  return new;
end$$;
revoke all on function private.signal_kitchen_order() from public;
create trigger orders_signal_kitchen
after insert or update of status, revision on public.orders
for each row execute function private.signal_kitchen_order();
insert into public.kitchen_order_signals(order_id, location_id, revision, changed_at)
select id, location_id, revision, now() from public.orders;
alter publication supabase_realtime add table public.kitchen_order_signals;

create function private.kitchen_order_json(target_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'id', o.id,
  'displayNumber', lpad(o.display_number::text,4,'0'),
  'status', o.status,
  'revision', o.revision,
  'confirmedAt', o.confirmed_at,
  'scheduledFor', o.scheduled_for,
  'fulfillmentType', o.fulfillment_type,
  'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', i.product_name_snapshot,
      'variant', i.variant_name_snapshot,
      'quantity', i.quantity,
      'modifiers', coalesce((
        select jsonb_agg(jsonb_build_object('name',m.modifier_option_name_snapshot) order by m.id)
        from public.order_item_modifiers m where m.order_item_id=i.id
      ),'[]'::jsonb)
    ) order by i.id)
    from public.order_items i where i.order_id=o.id
  ),'[]'::jsonb)
) from public.orders o where o.id=target_order_id
$$;
revoke all on function private.kitchen_order_json(uuid) from public;

create function public.list_kitchen_orders(target_location_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
select coalesce(jsonb_agg(private.kitchen_order_json(id) order by confirmed_at),'[]'::jsonb)
from public.orders
where location_id=target_location_id
  and status in ('CONFIRMED','PREPARING','READY')
  and private.can_order(location_id,'orders.read')
$$;

create function public.update_kitchen_order_status(
  target_order_id uuid,
  expected_revision integer,
  target_status public.order_status
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if target_status not in ('PREPARING','READY') then
    raise exception 'INVALID_ORDER_TRANSITION';
  end if;
  perform public.update_order_status(target_order_id, expected_revision, target_status, null);
  return private.kitchen_order_json(target_order_id);
end$$;

revoke all on function public.list_kitchen_orders(uuid), public.update_kitchen_order_status(uuid,integer,public.order_status) from public;
grant execute on function public.list_kitchen_orders(uuid), public.update_kitchen_order_status(uuid,integer,public.order_status) to authenticated;
