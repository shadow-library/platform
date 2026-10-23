// Mirrors `@shadow-library/auth`'s `auth.dto.ts`; re-declared because even a type-only import would drag the backend `.d.ts` graph into every web app's type-check.

export interface AuthPrincipal {
  /** The stable identity subject. The cookie carries an opaque handle, never a token — this is all the browser is told. */
  sub: string;
  scopes: string[];
  /** The organisation this session acts in; every permission on every request is evaluated there. */
  org?: string;
  /** `AAL2` only while a step-up grant for this application's audience is live. */
  aal?: string;
  clientId?: string;
}

export interface AuthOrganisation {
  id: string;
  slug: string;
  name: string;
  type: 'PERSONAL' | 'TEAM';
  /** Whether the session is acting in this organisation right now. */
  active: boolean;
}

export interface AuthLogoutResult {
  success: boolean;
  /** Set when identity's RP-initiated logout should be visited next; the caller navigates to it rather than fetching it. */
  redirectTo?: string;
}

export interface AuthSwitchOrganisationResult {
  organisationId: string;
}

export type AuthAccessMode = 'public' | 'private';

export interface AuthAccess {
  /** `private` requires a session on every route that is not explicitly public; `public` lets a guest browse. */
  mode: AuthAccessMode;
}
