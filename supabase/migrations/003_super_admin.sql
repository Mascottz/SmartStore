-- SmartStore NG — Super Admin RLS
-- Lets a signed-in user with app_metadata.role = 'super_admin' read (and
-- when needed, delete) every tenant row from the client. Regular members
-- continue to see only their own store through the existing policies.
-- Pair this with SuperAdmin.jsx, which queries Supabase tables directly.

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'super_admin';
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

-- ------------------------------------------------------------ read-all
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stores' and policyname = 'super admin read stores'
  ) then
    create policy "super admin read stores" on public.stores
      for select using (public.is_super_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store_members' and policyname = 'super admin read members'
  ) then
    create policy "super admin read members" on public.store_members
      for select using (public.is_super_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'categories' and policyname = 'super admin read categories'
  ) then
    create policy "super admin read categories" on public.categories
      for select using (public.is_super_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'super admin read products'
  ) then
    create policy "super admin read products" on public.products
      for select using (public.is_super_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sales' and policyname = 'super admin read sales'
  ) then
    create policy "super admin read sales" on public.sales
      for select using (public.is_super_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'expenses' and policyname = 'super admin read expenses'
  ) then
    create policy "super admin read expenses" on public.expenses
      for select using (public.is_super_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'void_logs' and policyname = 'super admin read voids'
  ) then
    create policy "super admin read voids" on public.void_logs
      for select using (public.is_super_admin());
  end if;
end;
$$;

-- ------------------------------------------------------------ delete
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stores' and policyname = 'super admin delete stores'
  ) then
    create policy "super admin delete stores" on public.stores
      for delete using (public.is_super_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store_members' and policyname = 'super admin delete members'
  ) then
    create policy "super admin delete members" on public.store_members
      for delete using (public.is_super_admin());
  end if;
end;
$$;

-- Optional RPCs used when the client prefers a single round-trip.
create or replace function public.admin_delete_store(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required' using errcode = '42501';
  end if;
  delete from public.stores where id = p_store_id;
end;
$$;

create or replace function public.admin_delete_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.store_members;
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required' using errcode = '42501';
  end if;

  select * into v_member from public.store_members where id = p_member_id;
  if not found then
    raise exception 'Member not found';
  end if;
  if v_member.role = 'owner' then
    raise exception 'Remove the store instead of deleting the owner membership';
  end if;

  delete from public.store_members where id = p_member_id;
end;
$$;

revoke all on function public.admin_delete_store(uuid) from public;
revoke all on function public.admin_delete_member(uuid) from public;
grant execute on function public.admin_delete_store(uuid) to authenticated;
grant execute on function public.admin_delete_member(uuid) to authenticated;
