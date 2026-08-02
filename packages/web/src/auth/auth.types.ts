/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * The wire contract of the browser-facing auth surface every non-identity backend inherits from
 * `@shadow-library/auth`'s `AuthController` — mounted at `/api/auth`, outside the versioned API. It is one
 * contract, so it is typed once here rather than re-declared by each web app.
 *
 * These mirror the server's `auth.dto.ts`. They are re-declared rather than imported because
 * `@shadow-library/auth` sits on the backend dependency chain (`app`, `class-schema`, `fastify`), and a
 * type-only import would still drag that whole `.d.ts` graph into every web app's type-check.
 */
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
