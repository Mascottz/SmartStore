-- SmartStore NG: two-way Owner Mode app + Shop Mode team limits
--
-- 1. stores.billing_cycle records which cycle an Owner Mode subscriber paid
--    for (monthly / yearly). The Paystack reference already carries the plan
--    (SS-MONTHLY-… / SS-YEARLY-…); this makes it queryable on the store.
--
-- 2. A trigger on store_members enforces the Shop Mode (free plan) team
--    allowance at the database: one approved cashier, one approved manager,
--    no admins. The owner's own row is exempt. Pending and rejected members
--    never count — approval is the gate, not the request.
--    The client (Team page, User Approvals) and the local demo adapter
--    enforce the same rule for a friendly message; this trigger is the
--    actual boundary.

-- ============================================================ billing cycle

alter table public.stores
  add column if not exists billing_cycle text;

-- Stores already on the Owner Mode plan paid monthly unless noted otherwise.
update public.stores
set billing_cycle = 'monthly'
where billing_cycle is null and plan = 'owner';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stores_billing_cycle_check'
      and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_billing_cycle_check
      check (billing_cycle in ('monthly', 'yearly'));
  end if;
end;
$$;

-- ============================================================ team limits

create or replace function public.enforce_free_team_limits()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_is_demo boolean;
  v_others int;
begin
  -- The store owner's own membership is never limited.
  if new.role = 'owner' then
    return new;
  end if;

  select plan, is_demo into v_plan, v_is_demo
  from public.stores where id = new.store_id;

  -- Owner Mode subscribers (and demo stores) have unlimited staff.
  if v_plan = 'free' and coalesce(v_is_demo, false) = false then
    if new.approval_status = 'approved' then
      if new.role = 'admin' then
        raise exception
          'The admin role is an Owner Mode feature. Upgrade the store plan to add an admin.';
      end if;

      select count(*) into v_others
      from public.store_members m
      where m.store_id = new.store_id
        and m.id <> new.id
        and m.role = new.role
        and m.approval_status = 'approved';

      if v_others >= 1 then
        raise exception
          'Shop Mode allows one % at a time. Upgrade to Owner Mode for unlimited staff.', new.role;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists store_members_free_team_limits on public.store_members;
create trigger store_members_free_team_limits
before insert or update on public.store_members
for each row execute function public.enforce_free_team_limits();
