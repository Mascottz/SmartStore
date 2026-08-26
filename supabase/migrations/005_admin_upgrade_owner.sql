-- SmartStore NG — Admin upgrade to Owner Mode without Paystack
-- Allows Super Admin to upgrade any store to the owner plan directly.
-- Adds an RLS policy so super_admin can update stores, plus a dedicated
-- security-definer RPC that enforces the super_admin check server-side.

-- ------------------------------------------------------------ update policy
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stores' and policyname = 'super admin update stores'
  ) then
    create policy "super admin update stores" on public.stores
      for update using (public.is_super_admin());
  end if;
end;
$$;

-- ------------------------------------------------------------ RPC: upgrade store to owner plan
create or replace function public.admin_upgrade_store_to_owner(p_store_id uuid)
returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.stores;
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required' using errcode = '42501';
  end if;

  if p_store_id is null then
    raise exception 'Store id is required';
  end if;

  update public.stores
  set plan = 'owner'
  where id = p_store_id
  returning * into v_store;

  if not found then
    raise exception 'Store not found';
  end if;

  return v_store;
end;
$$;

revoke all on function public.admin_upgrade_store_to_owner(uuid) from public;
grant execute on function public.admin_upgrade_store_to_owner(uuid) to authenticated;

-- Refresh PostgREST schema cache so the new RPC is immediately available.
notify pgrst, 'reload schema';
