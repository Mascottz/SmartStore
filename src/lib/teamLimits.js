// src/lib/teamLimits.js
// Free-plan (Shop Mode) team restrictions: a free store can run with the
// owner's own account plus ONE cashier and ONE manager. A second cashier, a
// second manager, or any admin needs the Owner Mode plan.
//
// The rules are checked in three places so they hold everywhere:
//   - the UI (Team role changes, User Approvals) for a friendly message,
//   - the local demo backend, so the offline demo behaves the same,
//   - a Postgres trigger (supabase/migrations/008) as the real boundary.

export const FREE_TEAM_LIMITS = { cashier: 1, manager: 1, admin: 0 };

/** Free plan = not on Owner Mode. Demo stores behave as subscribed. */
export function isFreePlanStore({ plan, storeIsDemo }) {
  return plan !== 'owner' && !storeIsDemo;
}

/**
 * Count the APPROVED members (excluding `exceptId`) holding a role. Pending
 * and rejected requests never count towards the limit — the gate is approval,
 * not the request itself.
 */
export function countApprovedInRole(members, role, exceptId) {
  return (members || []).filter(
    (m) =>
      m.id !== exceptId &&
      m.role === role &&
      (m.approvalStatus || 'approved') === 'approved'
  ).length;
}

/**
 * Would moving `member` to `nextRole`/`nextStatus` break the free-plan team
 * limits for this store?
 *
 * @returns {null} when allowed, or an Error whose message is safe to show.
 */
export function checkTeamChange({
  plan,
  storeIsDemo,
  members,
  member,
  nextRole,
  nextStatus,
}) {
  if (!isFreePlanStore({ plan, storeIsDemo })) return null;
  if (!member || member.role === 'owner') return null;
  if ((nextStatus || member.approvalStatus || 'approved') !== 'approved') {
    return null; // rejecting or leaving pending never adds capacity
  }

  const role = nextRole || member.role;
  const limit = FREE_TEAM_LIMITS[role];
  if (limit === undefined) return null;

  const others = countApprovedInRole(members, role, member.id);
  if (others >= limit) {
    if (role === 'admin') {
      return new Error(
        'The admin role is an Owner Mode feature. Upgrade your plan to add an admin.'
      );
    }
    return new Error(
      `Shop Mode allows one ${role} at a time. Upgrade to Owner Mode for unlimited staff.`
    );
  }
  return null;
}

/**
 * Human-readable summary of the free-plan team allowance, for UI hints.
 */
export function freeTeamSummary() {
  return 'Shop Mode teams: just you, one cashier and one manager. Owner Mode unlocks unlimited staff and every role.';
}
