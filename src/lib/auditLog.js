// src/lib/auditLog.js
// Lightweight admin action audit trail persisted in localStorage.
//
// Super-admin actions that mutate tenant data (approve / reject a user,
// delete a user, delete a store) are recorded here so there is a writable
// history of what an administrator did, when, and to whom — independent of
// the tenant tables themselves.
//
// The log is capped at MAX_ENTRIES (500); oldest entries fall off first.
// New entries are prepended, so the list renders newest-first.

const STORAGE_KEY = 'smartstore-audit-log';

/** Maximum number of entries kept in storage. */
export const MAX_ENTRIES = 500;

const uid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
};

/**
 * Read the whole audit log (newest first). Never throws — degrades to `[]`.
 */
export function getAuditLog() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('audit log read failed', error);
    return [];
  }
}

/**
 * Append an entry to the audit log.
 *
 * @param {object} entry
 * @param {string} entry.action   e.g. 'approve_user' | 'reject_user' | 'delete_user' | 'delete_store'
 * @param {string} entry.actor     Who performed the action (admin email).
 * @param {string} entry.target    The object acted upon (email / store name / id).
 * @param {string} [entry.details] Optional human-readable context.
 * @returns {object|null} The stored entry, or null if storage is unavailable.
 */
export function logAudit({ action, actor, target, details }) {
  if (typeof localStorage === 'undefined') return null;
  const entry = {
    id: uid(),
    timestamp: new Date().toISOString(),
    action: String(action || 'unknown'),
    actor: String(actor || ''),
    target: String(target || ''),
    details: String(details || ''),
  };

  try {
    const next = [entry, ...getAuditLog()].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return entry;
  } catch (error) {
    console.error('audit log write failed', error);
    return null;
  }
}

/** Remove every audit entry (admin maintenance action). */
export function clearAuditLog() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('audit log clear failed', error);
  }
}
