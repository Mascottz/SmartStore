-- SmartStore NG — membership approval queue and system-admin RPCs
-- Existing members stay approved. New staff who join with a code must be
-- approved by their store owner before tenant data becomes accessible.

-- ============================================================ approval state

alter table public.store_members
  add column if not exists approval_status text;

-- Preserve access for accounts created before this migration.
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

-- Only approved members are considered tenant members by all existing RLS
-- policies. The membership RPC below still lets pending users see their own
-- status and the store name shown on the waiting screen.
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

-- A platform administrator must be assigned app_metadata.role=super_admin
-- with the Supabase Admin API. The hidden client-side entry point only reveals
-- the console; this server-side check remains the authorization boundary.
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'super_admin';
$$;

-- A signed-in user can retrieve only their own membership, including pending
-- state, without granting broad table access through RLS.
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

-- ============================================================ onboarding RPCs

-- Store creators are always approved owners, despite the pending default.
create or replace function public.create_store(
  p_name text,
  p_type text,
  p_categories jsonb default '[]'::jsonb
) returns public.stores
language plpgsql security definer set search_path = public as $$
declare
  v_store public.stores;
  v_email text;
  v_cat text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from store_members where user_id = auth.uid()) then
    raise exception 'You already belong to a store';
  end if;

  select coalesce(email, '') into v_email from auth.users where id = auth.uid();

  insert into stores (name, type, join_code, onboarding)
  values (
    p_name,
    p_type,
    upper(substr(md5(random()::text), 1, 6)),
    jsonb_build_object('completed', true, 'businessType', p_type,
                       'firstProductAdded', false, 'firstSaleCompleted', false)
  )
  returning * into v_store;

  insert into store_members
    (store_id, user_id, email, role, approval_status)
  values
    (v_store.id, auth.uid(), v_email, 'owner', 'approved');

  for v_cat in select jsonb_array_elements_text(p_categories) loop
    insert into categories (store_id, name) values (v_store.id, v_cat);
  end loop;

  return v_store;
end;
$$;

-- Staff join requests now enter the owner's approval queue.
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

  insert into store_members
    (store_id, user_id, email, role, approval_status)
  values
    (v_store.id, auth.uid(), v_email, 'cashier', 'pending')
  on conflict (user_id) do nothing;

  return v_store;
end;
$$;

-- ============================================================ approvals

-- Owners can decide requests for their own store. Platform super admins can
-- decide any non-owner request from the system dashboard.
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

-- ============================================================ super admin

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'stats', jsonb_build_object(
      'totalUsers', (select count(*) from auth.users),
      'totalStores', (select count(*) from public.stores),
      'totalMembers', (select count(*) from public.store_members),
      'pendingUsers', (
        select count(*) from public.store_members where approval_status = 'pending'
      ),
      'approvedUsers', (
        select count(*) from public.store_members where approval_status = 'approved'
      ),
      'rejectedUsers', (
        select count(*) from public.store_members where approval_status = 'rejected'
      )
    ),
    'users', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'userId', u.id,
          'membershipId', m.id,
          'email', coalesce(u.email, m.email, ''),
          'role', m.role,
          'approvalStatus', coalesce(m.approval_status, 'unassigned'),
          'storeId', s.id,
          'storeName', coalesce(s.name, ''),
          'createdAt', u.created_at,
          'joinedAt', m.created_at
        ) order by u.created_at desc
      )
      from auth.users u
      left join public.store_members m on m.user_id = u.id
      left join public.stores s on s.id = m.store_id
    ), '[]'::jsonb),
    'stores', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'type', s.type,
          'plan', s.plan,
          'isDemo', s.is_demo,
          'createdAt', s.created_at,
          'memberCount', (
            select count(*) from public.store_members m where m.store_id = s.id
          ),
          'pendingCount', (
            select count(*) from public.store_members m
            where m.store_id = s.id and m.approval_status = 'pending'
          )
        ) order by s.created_at desc
      )
      from public.stores s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Keep RPCs unavailable to anonymous clients. Each function also performs its
-- own ownership / app-metadata authorization check.
revoke all on function public.get_my_membership() from public;
revoke all on function public.set_member_approval(uuid, text) from public;
revoke all on function public.admin_dashboard() from public;
grant execute on function public.get_my_membership() to authenticated;
grant execute on function public.set_member_approval(uuid, text) to authenticated;
grant execute on function public.admin_dashboard() to authenticated;
