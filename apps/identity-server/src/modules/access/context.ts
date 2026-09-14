import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { ContextService, type HttpResponse } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { type AdminActor } from '@server/modules/admin';
import { type JwtClaims } from '@server/modules/auth/keys';
import { type ValidatedSession } from '@server/modules/auth/session';
import { type AuthenticatedBot } from '@server/modules/identity/bot';
import { type Organisation } from '@server/modules/infrastructure/datastore';

import { type AuthContext, type AuthenticatedRequest, type Caller, type ClientInfo } from './access.types';
import { clientInfoOf } from './auth-context.accessor';

type ExtendedContext = ContextService & typeof AUTH_CONTEXT_EXTENSION;

const authOf = (context: ContextService): AuthContext => {
  const request = context.getRequest() as AuthenticatedRequest;
  if (!request.auth) throw AppErrorCode.AUTH_005.create();
  return request.auth;
};

const AUTH_CONTEXT_EXTENSION = {
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
  getBot(this: ContextService): AuthenticatedBot {
    const bot = authOf(this).bot;
    if (!bot) throw AppErrorCode.AUTH_005.create();
    return bot;
  },
  getCaller(this: ContextService): Caller {
    const auth = authOf(this);
    if (auth.bot) return { kind: 'bot', bot: auth.bot, ip: auth.clientInfo.ip };
    if (!auth.session) throw AppErrorCode.AUTH_005.create();
    return { kind: 'user', session: auth.session, ip: auth.clientInfo.ip };
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
  getBot: (): AuthenticatedBot => current().getBot(),
  getCaller: (): Caller => current().getCaller(),
  /** Only for response headers a service must set itself, such as `Retry-After` on a throttle it raises; null when the caller is not an HTTP request */
  getResponse: (): HttpResponse | null => current().getResponse(false),
};

@Injectable()
export class ContextBinder {
  constructor(context: ContextService) {
    (context.extend as (extension: typeof AUTH_CONTEXT_EXTENSION) => ContextService)(AUTH_CONTEXT_EXTENSION);
    boundContext = context as ExtendedContext;
  }
}
