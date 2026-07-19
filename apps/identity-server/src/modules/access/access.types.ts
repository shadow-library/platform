/**
 * Importing npm packages
 */
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { type AdminActor, type AdminPermission } from '@server/modules/admin';
import { type JwtClaims } from '@server/modules/auth/keys';
import { type ValidatedSession } from '@server/modules/auth/session';
import { type Organisation } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

/**
 * Declares what a route needs to be entered. The central `AccessGuard` reads this off the route
 * metadata and resolves identity plus the coarse, route-level authorization; anything that depends
 * on the request body or on comparing the caller against a target (member rank, last-owner
 * protection, conditional step-up) stays in the handler.
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
  /** Accept only an M2M service token carrying this scope (mutually exclusive with the session modes). */
  service?: string;
  /** Explicitly unauthenticated. Documents intent and makes the guard a no-op for the route. */
  public?: boolean;
}

export interface ClientInfo {
  ip: string;
  userAgent?: string;
}

/**
 * What the guard resolved for the current request. Which fields are populated is dictated by the
 * route's `AuthOptions`: `session` for the session modes, `actor` when a `permission` was checked,
 * `membership` for the org modes, `serviceToken` for the service mode. `clientInfo` is always set.
 */
export interface AuthContext {
  session?: ValidatedSession;
  /** Whether the session carries a still-valid second-factor step-up; mirrors `SessionService.isElevated`. */
  elevated?: boolean;
  actor?: AdminActor;
  membership?: Organisation.Member;
  /** The organisation resolved by the `orgRole` mode, so handlers need not re-fetch it. */
  organisation?: Organisation;
  serviceToken?: JwtClaims;
  clientInfo: ClientInfo;
}

/** The request the guard augments with the resolved {@link AuthContext}. */
export type AuthenticatedRequest = FastifyRequest & { auth?: AuthContext };
