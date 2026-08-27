import { describe, expect, it } from 'vitest';
import {
  describeUpgradeFailure,
  isBlockedByRowSecurity,
  isSuperAdminRejected,
} from './adminErrors';

describe('isSuperAdminRejected', () => {
  it('recognises the server-side super_admin gate', () => {
    expect(isSuperAdminRejected({ code: '42501', message: 'permission denied' })).toBe(true);
    expect(isSuperAdminRejected(new Error('Super admin access required'))).toBe(true);
  });

  it('does not claim a gate failure for unrelated errors', () => {
    expect(isSuperAdminRejected(new Error('Store not found'))).toBe(false);
    expect(isSuperAdminRejected(null)).toBe(false);
  });
});

describe('isBlockedByRowSecurity', () => {
  it('recognises an update that matched zero rows', () => {
    expect(
      isBlockedByRowSecurity(
        new Error('JSON object requested, multiple (or no) rows returned')
      )
    ).toBe(true);
    expect(isBlockedByRowSecurity({ code: 'PGRST116', message: '' })).toBe(true);
  });

  it('leaves other errors alone', () => {
    expect(isBlockedByRowSecurity(new Error('Super admin access required'))).toBe(false);
  });
});

describe('describeUpgradeFailure', () => {
  it('tells the operator to set app_metadata when the gate rejects them', () => {
    expect(describeUpgradeFailure(new Error('Super admin access required'))).toMatch(
      /app_metadata\.role = "super_admin"/
    );
  });

  it('points at the missing migration when RLS swallows the write', () => {
    expect(
      describeUpgradeFailure(
        new Error('JSON object requested, multiple (or no) rows returned')
      )
    ).toMatch(/005_admin_upgrade_owner\.sql/);
  });

  it('passes an unknown message through', () => {
    expect(describeUpgradeFailure(new Error('Store not found'))).toBe('Store not found');
    expect(describeUpgradeFailure(null)).toBe('Could not upgrade store.');
  });
});
