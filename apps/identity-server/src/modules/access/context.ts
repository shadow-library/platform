import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { type AdminActor } from '@server/modules/admin';
import { type JwtClaims } from '@server/modules/auth/keys';
import { type ValidatedSession } from '@server/modules/auth/session';
import { type Organisation } from '@server/modules/infrastructure/datastore';

import { type AuthContext, type AuthenticatedRequest, type ClientInfo } from './access.types';
import { clientInfoOf } from './auth-context.accessor';

type ExtendedContext = ContextService & typeof AUTH_CONTEXT_EXTENSION;

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

export const Context = {
  getAuth: (): AuthContext => current().getAuth(),
  getSession: (): ValidatedSession => current().getSession(),
  getActor: (): AdminActor => current().getActor(),
  getMembership: (): Organisation.Member => current().getMembership(),
  getOrganisation: (): Organisation => current().getOrganisation(),
  getServiceToken: (): JwtClaims => current().getServiceToken(),
  getClientInfo: (): ClientInfo => current().getClientInfo(),
};

@Injectable()
export class ContextBinder {
  constructor(context: ContextService) {
    (context.extend as (extension: typeof AUTH_CONTEXT_EXTENSION) => ContextService)(AUTH_CONTEXT_EXTENSION);
    boundContext = context as ExtendedContext;
  }
}
