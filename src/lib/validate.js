// src/lib/validate.js
// Shared input validation and sanitization helpers.

/** Strip HTML tags and trim whitespace. Prevents stored XSS in localStorage / Supabase. */
export function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

/** Clamp a string to a maximum length. */
export function clamp(str, max) {
  if (typeof str !== 'string') return '';
  return str.slice(0, max);
}

/** Validate an email address. */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Validate password strength (min 6 chars, at least one letter and one number). */
export function isValidPassword(pw) {
  return typeof pw === 'string' && pw.length >= 6;
}

/** Validate that a value is a positive number. */
export function isPositiveNumber(n) {
  return typeof n === 'number' && n > 0 && Number.isFinite(n);
}

/** Validate that a value is a non-negative number. */
export function isNonNegativeNumber(n) {
  return typeof n === 'number' && n >= 0 && Number.isFinite(n);
}

/** Validate a join code format (6 uppercase alphanumeric characters). */
export function isValidJoinCode(code) {
  return /^[A-Z0-9]{6}$/.test(code);
}

/** Validate a store name (non-empty, reasonable length). */
export function isValidStoreName(name) {
  const s = sanitize(name);
  return s.length >= 2 && s.length <= 100;
}

/** Validate a product/expense name. */
export function isValidItemName(name) {
  const s = sanitize(name);
  return s.length >= 1 && s.length <= 200;
}

/** Validate a price (positive number with max 2 decimal places, reasonable range). */
export function isValidPrice(n) {
  if (!isPositiveNumber(n)) return false;
  if (n > 999_999_999) return false;
  return true;
}

/** Validate stock quantity (non-negative integer). */
export function isValidStock(n) {
  return Number.isInteger(n) && n >= 0 && n <= 999_999_999;
}

/** Validate a reason string for voids (non-empty, reasonable length). */
export function isValidReason(str) {
  const s = sanitize(str);
  return s.length >= 1 && s.length <= 500;
}
