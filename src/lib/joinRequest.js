// src/lib/joinRequest.js
// A staff member types a store join code exactly once, on the signup form.
// The account is created first and the membership request second, so anything
// in between — an email confirmation round-trip, a dropped request, a closed
// tab — leaves a brand new account with no membership at all. That used to
// drop the new staff member into store onboarding instead of the waiting
// screen, and the code they typed was gone for good.
//
// Persisting the request in localStorage means the app can send the join by
// itself the next time that email signs in, and the waiting screen can always
// show which store code it is waiting on.

import { isValidJoinCode } from './validate';

export const JOIN_REQUEST_KEY = 'smartstore-join-request';

// Safety valve: an unreachable backend must not turn into a request loop on
// every render. Manual retries from the waiting screen are always allowed.
export const MAX_AUTO_JOIN_ATTEMPTS = 3;

const normalizeCode = (code) => String(code ?? '').trim().toUpperCase();
const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

const storageAvailable = () => {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
};

function write(record) {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(JOIN_REQUEST_KEY, JSON.stringify(record));
  } catch (e) {
    console.error('could not persist join request', e);
  }
}

/**
 * Remember a join code for an email address. Returns the stored record, or
 * null when the code is not a usable 6-character join code.
 */
export function saveJoinRequest({ code, email } = {}) {
  const cleanCode = normalizeCode(code);
  if (!isValidJoinCode(cleanCode)) return null;

  const record = {
    code: cleanCode,
    email: normalizeEmail(email),
    requestedAt: new Date().toISOString(),
    joinedAt: null,
    attempts: 0,
    error: null,
    permanent: false,
  };
  write(record);
  return record;
}

/** Read the stored request, or null when there is none / it is unusable. */
export function readJoinRequest() {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(JOIN_REQUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidJoinCode(parsed?.code)) return null;
    return {
      code: normalizeCode(parsed.code),
      email: normalizeEmail(parsed.email),
      requestedAt: parsed.requestedAt || null,
      joinedAt: parsed.joinedAt || null,
      attempts: Number(parsed.attempts) || 0,
      error: typeof parsed.error === 'string' ? parsed.error : null,
      permanent: Boolean(parsed.permanent),
    };
  } catch {
    return null;
  }
}

/** Merge a patch into the stored record (used to log attempts and errors). */
export function updateJoinRequest(patch = {}) {
  const current = readJoinRequest();
  if (!current) return null;
  const next = { ...current, ...patch };
  if (patch.code !== undefined) next.code = normalizeCode(patch.code);
  if (patch.email !== undefined) next.email = normalizeEmail(patch.email);
  next.attempts = Number(next.attempts) || 0;
  write(next);
  return next;
}

export function clearJoinRequest() {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(JOIN_REQUEST_KEY);
  } catch (e) {
    console.error('could not clear join request', e);
  }
}

/**
 * Clear only when the stored request belongs to this email. Shops share
 * devices: someone else's queued join code must survive a different person
 * creating their own store on the same tablet.
 */
export function clearJoinRequestFor(email) {
  const request = readJoinRequest();
  if (request && isJoinRequestFor(request, { id: true, email })) {
    clearJoinRequest();
    return true;
  }
  return false;
}

/** Does this stored request belong to the signed-in user? */
export function isJoinRequestFor(request, user) {
  if (!request?.code) return false;
  // No email recorded (e.g. written by an older build): still treat it as ours.
  if (!request.email) return Boolean(user?.id);
  return request.email === normalizeEmail(user?.email);
}

/**
 * Should the app send this request by itself? Only while the request has never
 * landed: once a membership row exists the code has done its job, and a store
 * that later removed the member must not be silently re-joined. Retries also
 * stop after a few failures, or as soon as the code is known to be wrong.
 */
export function canAutoJoin(request) {
  if (!request?.code || request.permanent || request.joinedAt) return false;
  return request.attempts < MAX_AUTO_JOIN_ATTEMPTS;
}

/**
 * True when retrying with this code can never succeed, so the app should stop
 * auto-retrying and let the user enter a different code instead.
 */
export function isPermanentJoinError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('no store found') || message.includes('invalid join code')
  );
}
