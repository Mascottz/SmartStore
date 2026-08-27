// src/lib/joinRequest.test.js
import { beforeEach, describe, expect, it } from 'vitest';
import {
  JOIN_REQUEST_KEY,
  MAX_AUTO_JOIN_ATTEMPTS,
  canAutoJoin,
  clearJoinRequest,
  clearJoinRequestFor,
  isJoinRequestFor,
  isPermanentJoinError,
  readJoinRequest,
  saveJoinRequest,
  updateJoinRequest,
} from './joinRequest';

describe('join request persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores the code a staff member typed, normalised', () => {
    const saved = saveJoinRequest({ code: ' 8g2kqp ', email: ' Ada@Shop.com ' });

    expect(saved.code).toBe('8G2KQP');
    expect(saved.email).toBe('ada@shop.com');
    expect(JSON.parse(localStorage.getItem(JOIN_REQUEST_KEY)).code).toBe('8G2KQP');

    const read = readJoinRequest();
    expect(read.code).toBe('8G2KQP');
    expect(read.attempts).toBe(0);
    expect(read.error).toBe(null);
    expect(read.joinedAt).toBe(null);
  });

  it('refuses a code that could never join a store', () => {
    expect(saveJoinRequest({ code: '12AB', email: 'a@b.com' })).toBe(null);
    expect(saveJoinRequest({ code: '', email: 'a@b.com' })).toBe(null);
    expect(readJoinRequest()).toBe(null);
  });

  it('ignores corrupted storage instead of throwing', () => {
    localStorage.setItem(JOIN_REQUEST_KEY, '{not json');
    expect(readJoinRequest()).toBe(null);

    localStorage.setItem(JOIN_REQUEST_KEY, JSON.stringify({ code: 'nope' }));
    expect(readJoinRequest()).toBe(null);
  });

  it('records attempts and errors while keeping the code', () => {
    saveJoinRequest({ code: 'ABC123', email: 'a@b.com' });
    const updated = updateJoinRequest({ attempts: 1, error: 'Network down' });

    expect(updated.code).toBe('ABC123');
    expect(updated.attempts).toBe(1);
    expect(updated.error).toBe('Network down');
    expect(readJoinRequest().error).toBe('Network down');
  });

  it('clears on request', () => {
    saveJoinRequest({ code: 'ABC123', email: 'a@b.com' });
    clearJoinRequest();
    expect(readJoinRequest()).toBe(null);
    expect(localStorage.getItem(JOIN_REQUEST_KEY)).toBe(null);
  });

  it('only clears when the stored request belongs to that email', () => {
    saveJoinRequest({ code: 'ABC123', email: 'ada@shop.com' });
    expect(clearJoinRequestFor('owner@shop.com')).toBe(false);
    expect(readJoinRequest()).not.toBe(null);
    expect(clearJoinRequestFor('ADA@shop.com')).toBe(true);
    expect(readJoinRequest()).toBe(null);
  });
});

describe('isJoinRequestFor', () => {
  it('only matches the email that made the request', () => {
    const request = { code: 'ABC123', email: 'ada@shop.com' };
    expect(isJoinRequestFor(request, { id: 'u1', email: 'ADA@shop.com' })).toBe(true);
    expect(isJoinRequestFor(request, { id: 'u2', email: 'owner@shop.com' })).toBe(false);
  });

  it('is false without a code', () => {
    expect(isJoinRequestFor(null, { id: 'u1', email: 'a@b.com' })).toBe(false);
  });
});

describe('canAutoJoin', () => {
  it('allows while fresh, stops after the retry budget is spent', () => {
    const request = { code: 'ABC123', attempts: 0 };
    expect(canAutoJoin(request)).toBe(true);
    expect(canAutoJoin({ ...request, attempts: MAX_AUTO_JOIN_ATTEMPTS })).toBe(false);
  });

  it('never auto-retries once the request has landed (joinedAt set)', () => {
    expect(canAutoJoin({ code: 'ABC123', attempts: 0, joinedAt: '2026-08-27' })).toBe(false);
  });

  it('never retries a code known to be wrong', () => {
    expect(canAutoJoin({ code: 'ABC123', attempts: 0, permanent: true })).toBe(false);
  });

  it('recognises permanent join failures by message', () => {
    expect(isPermanentJoinError(new Error('No store found for that join code.'))).toBe(true);
    expect(isPermanentJoinError(new Error('Invalid join code format.'))).toBe(true);
    expect(isPermanentJoinError(new Error('Failed to fetch'))).toBe(false);
  });
});
