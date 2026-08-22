create type public.membership_role as enum ('OWNER', 'CASHIER', 'KITCHEN');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.location_members (
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (location_id, user_id)
);

create index organization_members_user_idx on public.organization_members(user_id, organization_id);
create index location_members_user_idx on public.location_members(user_id, location_id);
create index locations_organization_idx on public.locations(organization_id);

comment on table public.organization_members is 'Organizational membership and centrally assigned role.';
comment on table public.location_members is 'Optional operational location grants. OWNER access is inherited from organization membership.';

create function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id and user_id = auth.uid()
  );
$$;

create function public.has_permission(target_organization_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case om.role
      when 'OWNER' then required_permission = any(array[
        'organization.read','organization.update','location.read','location.update','members.read','members.manage',
        'catalog.read','catalog.write','orders.read','orders.update','flow.read','flow.write','flow.publish',
        'inventory.read','inventory.write','analytics.read'
      ])
      when 'CASHIER' then required_permission = any(array[
        'organization.read','location.read','catalog.read','catalog.write','orders.read','orders.update','flow.read','inventory.read'
      ])
      when 'KITCHEN' then required_permission = any(array[
        'organization.read','location.read','orders.read','orders.update','inventory.read'
      ])
      else false
    end
    from public.organization_members om
    where om.organization_id = target_organization_id and om.user_id = auth.uid()
  ), false);
$$;

create function public.can_access_location(target_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.locations l
    join public.organization_members om on om.organization_id = l.organization_id and om.user_id = auth.uid()
    left join public.location_members lm on lm.location_id = l.id and lm.user_id = auth.uid()
    where l.id = target_location_id and (om.role = 'OWNER' or lm.user_id is not null)
  );
$$;

revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.has_permission(uuid, text) from public;
revoke all on function public.can_access_location(uuid) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.can_access_location(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.locations enable row level security;
alter table public.organization_members enable row level security;
alter table public.location_members enable row level security;

create policy organizations_select on public.organizations for select to authenticated
using (public.has_permission(id, 'organization.read'));
create policy organizations_update on public.organizations for update to authenticated
using (public.has_permission(id, 'organization.update'))
with check (public.has_permission(id, 'organization.update'));

create policy locations_select on public.locations for select to authenticated
using (public.has_permission(organization_id, 'location.read') and public.can_access_location(id));
create policy locations_insert on public.locations for insert to authenticated
with check (public.has_permission(organization_id, 'location.update'));
create policy locations_update on public.locations for update to authenticated
using (public.has_permission(organization_id, 'location.update') and public.can_access_location(id))
with check (public.has_permission(organization_id, 'location.update'));

create policy organization_members_select on public.organization_members for select to authenticated
using (public.has_permission(organization_id, 'members.read') or user_id = auth.uid());
create policy organization_members_insert on public.organization_members for insert to authenticated
with check (public.has_permission(organization_id, 'members.manage'));
create policy organization_members_update on public.organization_members for update to authenticated
using (public.has_permission(organization_id, 'members.manage'))
with check (public.has_permission(organization_id, 'members.manage'));
create policy organization_members_delete on public.organization_members for delete to authenticated
using (public.has_permission(organization_id, 'members.manage') and user_id <> auth.uid());

create policy location_members_select on public.location_members for select to authenticated
using (public.can_access_location(location_id) or public.has_permission((select l.organization_id from public.locations l where l.id = location_id), 'members.read'));
create policy location_members_insert on public.location_members for insert to authenticated
with check (public.has_permission((select l.organization_id from public.locations l where l.id = location_id), 'members.manage'));
create policy location_members_delete on public.location_members for delete to authenticated
using (public.has_permission((select l.organization_id from public.locations l where l.id = location_id), 'members.manage'));

grant select, update on public.organizations to authenticated;
grant select, insert, update on public.locations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, delete on public.location_members to authenticated;

create function public.create_organization(organization_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if char_length(btrim(organization_name)) not between 2 and 120 then raise exception 'invalid organization name' using errcode = '22023'; end if;
  insert into public.organizations(name) values (btrim(organization_name)) returning id into new_id;
  insert into public.organization_members(organization_id, user_id, role) values (new_id, auth.uid(), 'OWNER');
  return new_id;
end;
$$;

-- Creation must bootstrap the first membership atomically, so this narrowly scoped
-- definer function is used instead of permitting direct organization inserts.
alter function public.create_organization(text) security definer;

create function public.create_location(target_organization_id uuid, location_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare new_id uuid;
begin
  if not public.has_permission(target_organization_id, 'location.update') then raise exception 'permission denied' using errcode = '42501'; end if;
  if char_length(btrim(location_name)) not between 2 and 120 then raise exception 'invalid location name' using errcode = '22023'; end if;
  new_id := gen_random_uuid();
  insert into public.locations(id, organization_id, name) values (new_id, target_organization_id, btrim(location_name));
  return new_id;
end;
$$;

create function public.list_my_organizations()
returns table(id uuid, name text, role public.membership_role)
language sql stable security invoker set search_path = ''
as $$ select o.id, o.name, om.role from public.organizations o join public.organization_members om on om.organization_id = o.id where om.user_id = auth.uid() order by o.name $$;

create function public.list_my_locations(target_organization_id uuid)
returns table(id uuid, organization_id uuid, name text)
language sql stable security invoker set search_path = ''
as $$ select l.id, l.organization_id, l.name from public.locations l where l.organization_id = target_organization_id and public.can_access_location(l.id) order by l.name $$;

revoke all on function public.create_organization(text) from public;
revoke all on function public.create_location(uuid, text) from public;
revoke all on function public.list_my_organizations() from public;
revoke all on function public.list_my_locations(uuid) from public;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.create_location(uuid, text) to authenticated;
grant execute on function public.list_my_organizations() to authenticated;
grant execute on function public.list_my_locations(uuid) to authenticated;
