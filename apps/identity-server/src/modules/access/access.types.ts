import { type FastifyRequest } from 'fastify';

import { type AdminActor, type AdminPermission } from '@server/modules/admin';
import { type JwtClaims } from '@server/modules/auth/keys';
import { type ValidatedSession } from '@server/modules/auth/session';
import { type Organisation } from '@server/modules/infrastructure/datastore';

/**
 * Route-entry requirements resolved by the central access guard. Authorization that depends on
 * request bodies or comparing the caller with a target remains the handler's responsibility.
 */
export interface AuthOptions {
  /** Require a live first-party session (AAL1). Implied by `elevated`, `permission`, `orgRole` and `orgMember`. */
  session?: boolean;
  /** Require a recent second-factor proof (AAL2 step-up). */
  elevated?: boolean;
  /** Require this platform-admin permission, checked by the PDP in the platform organisation. */
  permission?: AdminPermission;
  /** Require at least this role in the organisation named by `orgParam`. */
  orgRole?: Organisation.MemberRole;
  /** Require any membership of the organisation named by `orgParam`. */
  orgMember?: boolean;
  /** Path parameter carrying the organisation id for `orgRole`/`orgMember`. Defaults to `organisationId`. */
  orgParam?: string;
  /**
   * Accept only an M2M service token (mutually exclusive with the session modes). A string
   * additionally requires that scope; `true` accepts any valid service token for a route whose
   * only subject is the caller itself.
   */
  service?: string | true;
  /** Explicitly unauthenticated. Documents intent and makes the guard a no-op for the route. */
  public?: boolean;
}

export interface ClientInfo {
  ip: string;
  userAgent?: string;
}

/**
 * Authentication state resolved by the guard. Populated fields correspond to the route's
 * `AuthOptions`; `clientInfo` is always present.
 */
export interface AuthContext {
  session?: ValidatedSession;
  /** Whether the session carries a still-valid second-factor step-up. */
  elevated?: boolean;
  actor?: AdminActor;
  membership?: Organisation.Member;
  /** The organisation resolved by the `orgRole` mode, so handlers need not re-fetch it. */
  organisation?: Organisation;
  serviceToken?: JwtClaims;
  clientInfo: ClientInfo;
}

/** A request augmented by the access guard with its resolved authentication context. */
export type AuthenticatedRequest = FastifyRequest & { auth?: AuthContext };
