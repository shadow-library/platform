import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { Logger } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { ADMIN_PERMISSION, APP_NAME } from '@server/constants';

/** The admin check `GET /access` answers the nav with and every model-identity redaction reads; `@RequirePermission(ADMIN_PERMISSION)` routes ask the PDP the same question. */
@Injectable()
export class AdminAccessService {
  private readonly logger = Logger.getLogger(APP_NAME, AdminAccessService.name);

  constructor(
    private readonly context: ContextService,
    private readonly authClient: AuthClient,
  ) {}

  async isAdmin(): Promise<boolean> {
    const principal = this.context.getAuthPrincipal();
    if (!principal.org) return false;
    return this.authClient.check({ action: ADMIN_PERMISSION, organisationId: principal.org, principal }, { highRisk: true });
  }

  /** Fails closed: a PDP that cannot answer (a throttle rethrows) hides model identity rather than failing the author's request. */
  async canSeeModels(): Promise<boolean> {
    try {
      return await this.isAdmin();
    } catch (err) {
      this.logger.warn('admin check failed, so model identity stays hidden', { err });
      return false;
    }
  }
}
