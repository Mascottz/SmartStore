-- SmartStore NG — Fix get_my_membership() RPC
-- Hotfix for the 404 (PGRST202) that prevented the dashboard from loading:
-- AuthContext resolves the signed-in user's store + role through this RPC,
-- and environments where the function was missing from the schema (or from
-- PostgREST's schema cache) failed every membership lookup. The function
-- first shipped inside 002_approval_queue.sql; this migration re-asserts it
-- idempotently so any database that applies migrations in order ends with a
-- working function, then refreshes the API schema cache.
--
-- The function runs as security definer so an authenticated user can read
-- their own membership row — including a pending/rejected approval state —
-- without opening store data up through broad RLS policies. The caller is
-- always resolved server-side via auth.uid(); no arguments are accepted.

create or replace function public.get_my_membership()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.get_my_membership() from public;
grant execute on function public.get_my_membership() to authenticated;

-- A 404 on an RPC that already exists is almost always a stale PostgREST
-- schema cache; ask it to reload so the endpoint is available immediately.
notify pgrst, 'reload schema';
