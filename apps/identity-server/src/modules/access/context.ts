/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { type AdminActor } from '@server/modules/admin';
import { type JwtClaims } from '@server/modules/auth/keys';
import { type ValidatedSession } from '@server/modules/auth/session';
import { type Organisation } from '@server/modules/infrastructure/datastore';

import { type AuthContext, type AuthenticatedRequest, type ClientInfo } from './access.types';
import { clientInfoOf } from './auth-context.accessor';

/**
 * Defining types
 *
 * The request-scoped `ContextService` is extended (via its `extend()` method) with typed auth
 * accessors so controllers read the guard-resolved identity straight off the ambient context.
 * `ContextService` is ALS-bound to the router's single instance and is not DI-visible to feature
 * modules, so `ContextBinder` (registered in the root module, where the instance is injectable) binds
 * that one instance to the module-level `Context` — handlers call `Context.getSession()` directly,
 * with no `@Ctx` parameter. The shared `ContextExtension` interface is deliberately not augmented
 * here (the `@shadow-library/auth` SDK augments it for its own `getAuthPrincipal`, and `extend`'s
 * signature would then force every extender to satisfy the union); the accessor types live on the
 * local `ExtendedContext` instead.
 */
type ExtendedContext = ContextService & typeof AUTH_CONTEXT_EXTENSION;

/**
 * Declaring the constants
 */
const authOf = (context: ContextService): AuthContext => {
  const request = context.getRequest() as AuthenticatedRequest;
  if (!request.auth) throw AppErrorCode.AUTH_005.create();
  return request.auth;
};

export const AUTH_CONTEXT_EXTENSION = {
  getAuth(this: ContextService): AuthContext {
    return authOf(this);
  },
  getSession(this: ContextService): ValidatedSession {
    const session = authOf(this).session;
    if (!session) throw AppErrorCode.AUTH_005.create();
    return session;
  },
  getActor(this: ContextService): AdminActor {
    const actor = authOf(this).actor;
    if (!actor) throw AppErrorCode.ADM_001.create();
    return actor;
  },
  getMembership(this: ContextService): Organisation.Member {
    const membership = authOf(this).membership;
    if (!membership) throw AppErrorCode.ORG_001.create();
    return membership;
  },
  getOrganisation(this: ContextService): Organisation {
    const organisation = authOf(this).organisation;
    if (!organisation) throw AppErrorCode.ORG_001.create();
    return organisation;
  },
  getServiceToken(this: ContextService): JwtClaims {
    const claims = authOf(this).serviceToken;
    if (!claims) throw AppErrorCode.SEC_003.create();
    return claims;
  },
  getClientInfo(this: ContextService): ClientInfo {
    const request = this.getRequest() as AuthenticatedRequest;
    return request.auth?.clientInfo ?? clientInfoOf(request);
  },
};

let boundContext: ExtendedContext | null = null;

const current = (): ExtendedContext => {
  if (!boundContext) throw AppError.internal('Context has not been bound; ContextBinder did not initialise');
  return boundContext;
};

/** Ambient accessor for the guard-resolved identity of the in-flight request; backed by the router's `ContextService`. */
export const Context = {
  getAuth: (): AuthContext => current().getAuth(),
  getSession: (): ValidatedSession => current().getSession(),
  getActor: (): AdminActor => current().getActor(),
  getMembership: (): Organisation.Member => current().getMembership(),
  getOrganisation: (): Organisation => current().getOrganisation(),
  getServiceToken: (): JwtClaims => current().getServiceToken(),
  getClientInfo: (): ClientInfo => current().getClientInfo(),
};

/**
 * Extends the router's `ContextService` with the auth accessors and binds it to `Context`. Registered
 * in the root module (the only scope where `ContextService` is DI-visible) and constructed eagerly at
 * bootstrap, before any request is served.
 */
@Injectable()
export class ContextBinder {
  constructor(context: ContextService) {
    /** Cast around `extend`'s signature, which the SDK's `ContextExtension` augmentation constrains to its own members. */
    (context.extend as (extension: typeof AUTH_CONTEXT_EXTENSION) => ContextService)(AUTH_CONTEXT_EXTENSION);
    boundContext = context as ExtendedContext;
  }
}
