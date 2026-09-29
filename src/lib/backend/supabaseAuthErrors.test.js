// isRevokedAccountError decides whether a failed auth.getUser() check means
// "this account is gone" (delete the local session too) versus "just a
// network hiccup" (keep trusting the cached session). Getting this wrong in
// either direction is bad: too loose and a flaky connection signs people
// out constantly; too strict and a deleted/banned account keeps acting like
// a valid, signed-in session (the original bug this guards against).
import { describe, expect, it } from 'vitest';
import { isRevokedAccountError } from './supabase';

describe('isRevokedAccountError', () => {
  it('flags a token whose account no longer exists', () => {
    expect(isRevokedAccountError({ code: 'user_not_found', status: 403 })).toBe(true);
  });

  it('flags a revoked/expired session', () => {
    expect(isRevokedAccountError({ code: 'session_not_found', status: 403 })).toBe(true);
    expect(isRevokedAccountError({ code: 'session_expired', status: 401 })).toBe(true);
    expect(isRevokedAccountError({ code: 'refresh_token_not_found', status: 401 })).toBe(true);
    expect(isRevokedAccountError({ code: 'refresh_token_already_used', status: 401 })).toBe(true);
    expect(isRevokedAccountError({ code: 'bad_jwt', status: 401 })).toBe(true);
  });

  it('falls back to status + message when an older GoTrue omits the code', () => {
    expect(
      isRevokedAccountError({
        status: 403,
        message: 'User from sub claim in JWT does not exist',
      })
    ).toBe(true);
  });

  it('does not flag a plain network failure', () => {
    expect(isRevokedAccountError({ message: 'Failed to fetch' })).toBe(false);
    expect(isRevokedAccountError({ name: 'AuthRetryableFetchError', status: undefined })).toBe(
      false
    );
  });

  it('does not flag an unrelated 4xx (e.g. a bad request elsewhere)', () => {
    expect(isRevokedAccountError({ status: 400, message: 'Invalid email' })).toBe(false);
  });

  it('handles a missing error', () => {
    expect(isRevokedAccountError(null)).toBe(false);
    expect(isRevokedAccountError(undefined)).toBe(false);
  });
});
