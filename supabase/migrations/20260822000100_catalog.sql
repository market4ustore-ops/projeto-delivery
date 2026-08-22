create table public.categories (
  id uuid primary key default gen_random_uuid(), location_id uuid not null references public.locations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120), slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text, sort_order integer not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (location_id, id), unique (location_id, slug)
);

create table public.products (
  id uuid primary key default gen_random_uuid(), location_id uuid not null, category_id uuid not null,
  name text not null check (char_length(btrim(name)) between 2 and 120), slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text, image_reference text, base_price numeric(12,2) not null check (base_price >= 0),
  is_active boolean not null default true, is_available boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (location_id, slug), unique (location_id, id),
  foreign key (location_id, category_id) references public.categories(location_id, id) on delete restrict
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120), price numeric(12,2) not null check (price >= 0),
  is_default boolean not null default false, is_active boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index product_variants_one_active_default on public.product_variants(product_id) where is_default and is_active;

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120), min_selections integer not null default 0,
  max_selections integer not null, is_required boolean not null default false, is_active boolean not null default true,
  sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (min_selections >= 0 and max_selections >= min_selections), check (is_required = (min_selections > 0))
);

create table public.modifier_options (
  id uuid primary key default gen_random_uuid(), modifier_group_id uuid not null references public.modifier_groups(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120), price_delta numeric(12,2) not null default 0,
  is_available boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index categories_location_idx on public.categories(location_id, sort_order);
create index products_location_category_idx on public.products(location_id, category_id);
create index product_variants_product_idx on public.product_variants(product_id, sort_order);
create index modifier_groups_product_idx on public.modifier_groups(product_id, sort_order);
create index modifier_options_group_idx on public.modifier_options(modifier_group_id, sort_order);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.can_catalog(target_location_id uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_access_location(target_location_id) and public.has_permission((select organization_id from public.locations where id = target_location_id), required_permission);
$$;
create function private.catalog_product_location(target_product_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$ select location_id from public.products where id = target_product_id $$;
create function private.catalog_group_location(target_group_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$ select p.location_id from public.modifier_groups g join public.products p on p.id=g.product_id where g.id=target_group_id $$;
revoke all on function private.can_catalog(uuid,text), private.catalog_product_location(uuid), private.catalog_group_location(uuid) from public;
grant execute on function private.can_catalog(uuid,text), private.catalog_product_location(uuid), private.catalog_group_location(uuid) to authenticated;

alter table public.categories enable row level security; alter table public.products enable row level security;
alter table public.product_variants enable row level security; alter table public.modifier_groups enable row level security; alter table public.modifier_options enable row level security;

create policy categories_select on public.categories for select to authenticated using (private.can_catalog(location_id,'catalog.read'));
create policy categories_insert on public.categories for insert to authenticated with check (private.can_catalog(location_id,'catalog.write'));
create policy categories_update on public.categories for update to authenticated using (private.can_catalog(location_id,'catalog.write')) with check (private.can_catalog(location_id,'catalog.write'));
create policy products_select on public.products for select to authenticated using (private.can_catalog(location_id,'catalog.read'));
create policy products_insert on public.products for insert to authenticated with check (private.can_catalog(location_id,'catalog.write'));
create policy products_update on public.products for update to authenticated using (private.can_catalog(location_id,'catalog.write')) with check (private.can_catalog(location_id,'catalog.write'));
create policy variants_select on public.product_variants for select to authenticated using (private.can_catalog(private.catalog_product_location(product_id),'catalog.read'));
create policy variants_insert on public.product_variants for insert to authenticated with check (private.can_catalog(private.catalog_product_location(product_id),'catalog.write'));
create policy variants_update on public.product_variants for update to authenticated using (private.can_catalog(private.catalog_product_location(product_id),'catalog.write')) with check (private.can_catalog(private.catalog_product_location(product_id),'catalog.write'));
create policy groups_select on public.modifier_groups for select to authenticated using (private.can_catalog(private.catalog_product_location(product_id),'catalog.read'));
create policy groups_insert on public.modifier_groups for insert to authenticated with check (private.can_catalog(private.catalog_product_location(product_id),'catalog.write'));
create policy groups_update on public.modifier_groups for update to authenticated using (private.can_catalog(private.catalog_product_location(product_id),'catalog.write')) with check (private.can_catalog(private.catalog_product_location(product_id),'catalog.write'));
create policy options_select on public.modifier_options for select to authenticated using (private.can_catalog(private.catalog_group_location(modifier_group_id),'catalog.read'));
create policy options_insert on public.modifier_options for insert to authenticated with check (private.can_catalog(private.catalog_group_location(modifier_group_id),'catalog.write'));
create policy options_update on public.modifier_options for update to authenticated using (private.can_catalog(private.catalog_group_location(modifier_group_id),'catalog.write')) with check (private.can_catalog(private.catalog_group_location(modifier_group_id),'catalog.write'));

grant select,insert,update on public.categories,public.products,public.product_variants,public.modifier_groups,public.modifier_options to authenticated;

create function public.list_catalog(target_location_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object('categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.name) from public.categories c where c.location_id=target_location_id),'[]'::jsonb),'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.products p where p.location_id=target_location_id),'[]'::jsonb))
$$;
revoke all on function public.list_catalog(uuid) from public; grant execute on function public.list_catalog(uuid) to authenticated;
