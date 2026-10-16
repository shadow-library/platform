import { AuthClient, type ServicePrincipal, type UserPrincipal } from '@shadow-library/auth';
import { AuthGuardErrorCode } from '@shadow-library/auth/module';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { APP_NAME } from '@server/constants';

export interface ServiceCaller {
  app: string;
  principal: ServicePrincipal;
}

/** The SDK guard admits both principal kinds wherever a scope or permission is satisfied, so each route family pins the kind it serves here. */
@Injectable()
export class CallerService {
  private readonly logger = Logger.getLogger(APP_NAME, CallerService.name);

  constructor(
    private readonly context: ContextService,
    private readonly auth: AuthClient,
  ) {}

  service(): ServiceCaller {
    const principal = this.context.getAuthPrincipal();
    if (principal.kind === 'service' && principal.clientId) return { app: principal.clientId, principal };
    this.logger.warn('Refused a principal that is not a service on a service route', { kind: principal.kind, sub: principal.sub });
    throw AuthGuardErrorCode.IAM_002.create();
  }

  user(): UserPrincipal {
    const principal = this.context.getAuthPrincipal();
    if (principal.kind === 'user') return principal;
    this.logger.warn('Refused a principal that is not a user on an admin route', { kind: principal.kind, sub: principal.sub });
    throw AuthGuardErrorCode.IAM_002.create();
  }

  /** Asks the PDP in parallel, so a caller can decide on several permissions without a network round trip inside a lock; `sensitive` ones use the short high-risk cache. */
  async permissions(user: UserPrincipal, permissions: readonly string[], sensitive: readonly string[] = []): Promise<ReadonlySet<string>> {
    const [ordinary, strict] = await Promise.all([this.decide(user, permissions, false), this.decide(user, sensitive, true)]);
    return new Set([...ordinary, ...strict]);
  }

  private async decide(user: UserPrincipal, permissions: readonly string[], highRisk: boolean): Promise<string[]> {
    if (permissions.length === 0) return [];
    const decisions = await this.auth.checkAll(
      permissions.map(action => ({ action, principal: user })),
      { highRisk },
    );
    return permissions.filter((_, index) => decisions[index]);
  }
}
