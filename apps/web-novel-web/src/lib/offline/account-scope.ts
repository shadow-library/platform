import { type AuthAccessMode } from '@shadow-library/web/auth';

export interface AccountScopeObservation {
  /** False for a session hydrated from an SSR document: the precached offline shell carries whoever was signed in when it was cached. */
  fetchedThisPage: boolean;
  accountId: string | null;
  accessMode: AuthAccessMode;
}

/**
 * Whether this page's session read may decide that the device changed hands. A private deployment's signed-out read
 * is a natural expiry landing on `/login`, not a guest about to inherit the shelf — explicit sign-out purges on its own.
 */
export function shouldReconcileAccount({ fetchedThisPage, accountId, accessMode }: AccountScopeObservation): boolean {
  if (!fetchedThisPage) return false;
  return accountId !== null || accessMode === 'public';
}
