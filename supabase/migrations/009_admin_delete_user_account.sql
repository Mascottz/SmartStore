-- SmartStore NG: full account deletion for the Super Admin console
--
-- admin.deleteUser() (and the Super Admin "Delete user" button) previously
-- only removed the public.store_members row, leaving the underlying
-- Supabase Auth account -- email, password, sessions, refresh tokens --
-- completely intact. That mismatch is what let a "deleted" account keep
-- signing in and land back in onboarding as if nothing had happened: not
-- what a confirmation dialog that says "Delete {email}? This cannot be
-- undone." promises.
--
-- This function removes the membership row(s) *and* the auth.users row
-- itself. Supabase's own auth schema cascades identities, sessions and
-- refresh tokens off of auth.users, so this immediately and fully revokes
-- the account: any cached session for it stops working right away (see the
-- getUser() revalidation added alongside this migration), and the email is
-- free for a brand new signup instantly, with no leftover data anywhere.
create or replace function public.admin_delete_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Cannot delete your own account from the super admin console';
  end if;

  delete from public.store_members where user_id = p_user_id;
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_user_account(uuid) from public;
grant execute on function public.admin_delete_user_account(uuid) to authenticated;
