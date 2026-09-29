// Shop Mode (free plan) team limits: you, one cashier, one manager. The rules
// are enforced in the UI, the local backend and the database trigger; these
// tests pin the shared rule itself.
import { describe, expect, it } from 'vitest';
import {
  checkTeamChange,
  countApprovedInRole,
  freeTeamSummary,
  isFreePlanStore,
} from './teamLimits';

const member = (id, role, approvalStatus = 'approved') => ({
  id,
  role,
  approvalStatus,
});

describe('isFreePlanStore', () => {
  it('is true only for non-demo stores outside the Owner Mode plan', () => {
    expect(isFreePlanStore({ plan: 'free', storeIsDemo: false })).toBe(true);
    expect(isFreePlanStore({ plan: 'owner', storeIsDemo: false })).toBe(false);
    expect(isFreePlanStore({ plan: 'free', storeIsDemo: true })).toBe(false);
  });
});

describe('countApprovedInRole', () => {
  const members = [
    member('o', 'owner'),
    member('c1', 'cashier'),
    member('c2', 'cashier', 'pending'),
    member('m1', 'manager'),
    member('m2', 'manager', 'rejected'),
  ];

  it('counts only approved members, excluding the one being changed', () => {
    expect(countApprovedInRole(members, 'cashier')).toBe(1);
    expect(countApprovedInRole(members, 'cashier', 'c1')).toBe(0);
    expect(countApprovedInRole(members, 'manager')).toBe(1);
    expect(countApprovedInRole(members, 'admin')).toBe(0);
  });
});

describe('checkTeamChange', () => {
  const freeStore = { plan: 'free', storeIsDemo: false };
  const ownerStore = { plan: 'owner', storeIsDemo: false };

  it('allows anything on the Owner Mode plan', () => {
    const members = [member('c1', 'cashier'), member('c2', 'cashier'), member('a', 'admin')];
    expect(
      checkTeamChange({
        ...ownerStore,
        members,
        member: member('c3', 'cashier', 'pending'),
        nextRole: 'admin',
        nextStatus: 'approved',
      })
    ).toBeNull();
  });

  it('allows the first cashier and the first manager on the free plan', () => {
    const members = [member('o', 'owner')];
    expect(
      checkTeamChange({
        ...freeStore,
        members,
        member: member('c1', 'cashier', 'pending'),
        nextStatus: 'approved',
      })
    ).toBeNull();
  });

  it('blocks a second cashier or second manager on the free plan', () => {
    const members = [member('o', 'owner'), member('c1', 'cashier'), member('m1', 'manager')];
    const secondCashier = checkTeamChange({
      ...freeStore,
      members,
      member: member('c2', 'cashier', 'pending'),
      nextStatus: 'approved',
    });
    expect(secondCashier).toBeInstanceOf(Error);
    expect(secondCashier.message).toMatch(/one cashier/i);

    const secondManager = checkTeamChange({
      ...freeStore,
      members,
      member: member('m2', 'cashier', 'pending'),
      nextRole: 'manager',
      nextStatus: 'approved',
    });
    expect(secondManager).toBeInstanceOf(Error);
    expect(secondManager.message).toMatch(/one manager/i);
  });

  it('blocks any admin on the free plan, even the first', () => {
    const members = [member('o', 'owner')];
    const err = checkTeamChange({
      ...freeStore,
      members,
      member: member('c1', 'cashier'),
      nextRole: 'admin',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/admin role is an Owner Mode feature/i);
  });

  it('never blocks rejecting or leaving a member pending', () => {
    const members = [member('o', 'owner'), member('c1', 'cashier'), member('c2', 'cashier')];
    for (const nextStatus of ['pending', 'rejected']) {
      expect(
        checkTeamChange({
          ...freeStore,
          members,
          member: member('c2', 'cashier'),
          nextStatus,
        })
      ).toBeNull();
    }
  });

  it('pending and rejected members never count towards the limit', () => {
    // No approved cashier exists yet; only a pending request and a rejected
    // one, neither of which occupies the slot. Approving is fine.
    const members = [
      member('o', 'owner'),
      member('c2', 'cashier', 'pending'),
      member('c3', 'cashier', 'rejected'),
    ];
    expect(
      checkTeamChange({
        ...freeStore,
        members,
        member: member('c2', 'cashier', 'pending'),
        nextStatus: 'approved',
      })
    ).toBeNull();

    // But once an approved cashier exists, a second pending request cannot be
    // approved even though the first pending one was never counted.
    const withApproved = [...members, member('c1', 'cashier')];
    expect(
      checkTeamChange({
        ...freeStore,
        members: withApproved,
        member: member('c3', 'cashier', 'rejected'),
        nextStatus: 'approved',
      })
    ).toBeInstanceOf(Error);
  });

  it('never limits the store owner row', () => {
    expect(
      checkTeamChange({
        ...freeStore,
        members: [member('o', 'owner')],
        member: member('o', 'owner'),
        nextRole: 'owner',
        nextStatus: 'approved',
      })
    ).toBeNull();
  });

  it('exposes a UI-friendly summary of the allowance', () => {
    expect(freeTeamSummary()).toMatch(/one cashier and one manager/i);
  });
});
