/**
 * demoAccount.ts
 *
 * The public demo account (pre-filled sample portfolio). Its session must never stand in for a
 * real account in public navigation: the showcase keeps "Log in" / "Create account" visible and
 * the auth pages sign the demo out instead of redirecting to its dashboard.
 */
import type { User } from '../../types';

export const DEMO_ACCOUNT_EMAIL = 'demo@glassfolio.com';
/** Published on the login page and in the README: the demo holds sample data only. */
export const DEMO_ACCOUNT_PASSWORD = 'password';
const DEMO_ACCOUNT_ID = 'demo-123';

export function isDemoAccount(user: Pick<User, 'id' | 'email'> | null | undefined): boolean {
  if (!user) return false;
  return user.email?.toLowerCase() === DEMO_ACCOUNT_EMAIL || user.id === DEMO_ACCOUNT_ID;
}
