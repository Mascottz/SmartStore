-- SmartStore NG — Fix the owner approval queue
--
-- Symptom: a staff member signs up with a join code and waits on the
-- "Approval pending" screen, but the request never shows up on the owner's
-- User Approvals page. Two causes, both fixed here:
--
--   1. Schema drift. The approval queue lives in migration 002 and the
--      membership RPC was re-asserted in 004, but a live project that missed
--      (or half-applied) either of those silently loses the queue: joins
--      still succeed, `approval_status` falls back to 'approved' in the
--      client mapping, and no owner is ever asked to approve anyone. Like
--      004, this migration re-asserts the whole contract idempotently so
--      any database that applies migrations in order ends up consistent.
--
--   2. Phantom joins. `join_store_with_code` used `on conflict (user_id) do
--      nothing`, so a staff member who first typed the wrong store's code
--      and then re-entered the correct one kept their pending row on the
--      WRONG store — the client reported 'pending' on the store they
--      expected, while that store's owner saw nothing. The request now
--      follows the code that was typed last while it is still pending or
--      rejected; an approved membership is never moved or demoted.

-- ============================================================ approval state

alter table public.store_members
  add column if not exists approval_status text;

-- Preserve access for accounts created before the approval queue existed.
update public.store_members
set approval_status = 'approved'
where approval_status is null;

alter table public.store_members
  alter column approval_status set default 'pending',
  alter column approval_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'store_members_approval_status_check'
      and conrelid = 'public.store_members'::regclass
  ) then
    alter table public.store_members
      add constraint store_members_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end;
$$;

create index if not exists idx_members_store_approval
  on public.store_members(store_id, approval_status);

-- ============================================================ tenant helpers

-- Only approved members are considered tenant members by the RLS policies.
-- The membership RPC below still lets pending users see their own status and
-- the store name shown on the waiting screen.
create or replace function public.my_store_id()
returns uuid language sql stable security definer set search_path = public as $$
  select store_id
  from public.store_members
  where user_id = auth.uid() and approval_status = 'approved'
  limit 1;
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role
  from public.store_members
  where user_id = auth.uid() and approval_status = 'approved'
  limit 1;
$$;

-- A signed-in user can retrieve only their own membership, including pending
-- state, without granting broad table access through RLS. AuthContext reads
-- this on every auth change to decide between the app and the waiting screen.
create or replace function public.get_my_membership()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'role', m.role,
    'approval_status', m.approval_status,
    'store', to_jsonb(s)
  )
  from public.store_members m
  join public.stores s on s.id = m.store_id
  where m.user_id = auth.uid()
  limit 1;
$$;

-- ============================================================ join + approvals

-- Staff join requests enter the owner's approval queue as 'pending'.
create or replace function public.join_store_with_code(p_code text)
returns public.stores
language plpgsql security definer set search_path = public as $$
declare
  v_store public.stores;
  v_email text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_store from stores where join_code = upper(p_code);
  if not found then raise exception 'No store found for that join code.'; end if;

  select coalesce(email, '') into v_email from auth.users where id = auth.uid();

  -- One membership per account. While a request is still pending or
  -- rejected it follows the code that was typed last, so a mistyped code
  -- can never strand the request in a store whose owner never sees it. An
  -- approved membership is left untouched (the where clause skips it).
  insert into store_members
    (store_id, user_id, email, role, approval_status)
  values
    (v_store.id, auth.uid(), v_email, 'cashier', 'pending')
  on conflict (user_id) do update
    set store_id = excluded.store_id,
        email = excluded.email,
        role = 'cashier',
        approval_status = 'pending',
        created_at = now()
    where public.store_members.approval_status <> 'approved';

  return v_store;
end;
$$;

-- Owners decide requests for their own store; platform super admins can
-- decide any non-owner request from the system dashboard. Either way the
-- store_members approval_status row is what grants access.
create or replace function public.set_member_approval(
  p_member_id uuid,
  p_status text
) returns public.store_members
language plpgsql security definer set search_path = public as $$
declare
  v_member public.store_members;
  v_is_owner boolean;
begin
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid approval status';
  end if;

  select * into v_member
  from public.store_members
  where id = p_member_id;

  if not found then raise exception 'Member not found'; end if;
  if v_member.role = 'owner' then
    raise exception 'The store owner is always approved';
  end if;

  select exists (
    select 1
    from public.store_members caller
    where caller.user_id = auth.uid()
      and caller.store_id = v_member.store_id
      and caller.role = 'owner'
      and caller.approval_status = 'approved'
  ) into v_is_owner;

  if not v_is_owner and not public.is_super_admin() then
    raise exception 'Only the store owner or a super admin can manage approvals'
      using errcode = '42501';
  end if;

  update public.store_members
  set approval_status = p_status
  where id = p_member_id
  returning * into v_member;

  return v_member;
end;
$$;

-- ============================================================ grants

-- Keep the RPCs unavailable to anonymous clients; each function performs its
-- own ownership / app-metadata authorization check.
revoke all on function public.get_my_membership() from public;
revoke all on function public.set_member_approval(uuid, text) from public;
grant execute on function public.get_my_membership() to authenticated;
grant execute on function public.set_member_approval(uuid, text) to authenticated;

-- Refresh the PostgREST schema cache so the re-asserted RPCs answer
-- immediately instead of 404-ing until the next reload.
notify pgrst, 'reload schema';
