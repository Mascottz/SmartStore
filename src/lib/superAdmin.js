export const SUPER_ADMIN_EMAIL = 'mastech.ltd0@gmail.com';

export function isSuperAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}
