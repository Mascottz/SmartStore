// src/lib/adminErrors.js
// Super-admin actions are gated twice, and the two gates do not agree:
// the client only checks the signed-in email, while the server checks
// auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin' (see
// supabase/migrations/002_approval_queue.sql and 003_super_admin.sql).
// When they disagree the server refuses and Postgres sends back text an
// operator cannot act on, so translate the known failures.

/** The server rejected the caller: the auth user lacks the super_admin flag. */
export function isSuperAdminRejected(error) {
  const message = String(error?.message || '');
  return error?.code === '42501' || /super admin access required/i.test(message);
}

/**
 * The write was swallowed by row-level security. PostgREST reports no error
 * for an update that matched zero rows, so the caller only finds out when it
 * asks for the row back (.select().single()) and gets nothing.
 */
export function isBlockedByRowSecurity(error) {
  const message = String(error?.message || '');
  return (
    error?.code === 'PGRST116' ||
    /multiple \(or no\) rows returned|JSON object requested/i.test(message)
  );
}

/** Turn a failed Owner Mode grant into something an operator can act on. */
export function describeUpgradeFailure(error) {
  if (isSuperAdminRejected(error)) {
    return 'Supabase rejected this: your account is not flagged as super_admin. Set app_metadata.role = "super_admin" on the auth user (Supabase Admin API), then try again.';
  }
  if (isBlockedByRowSecurity(error)) {
    return 'The plan did not change — row-level security blocked the update. Apply supabase/migrations/005_admin_upgrade_owner.sql to this project, then try again.';
  }
  return error?.message || 'Could not upgrade store.';
}
