import { AuthClient } from '@shadow-library/auth';
import { Authenticated } from '@shadow-library/auth/module';
import { ContextService, Get, HttpController, RespondFor } from '@shadow-library/fastify';

import { ADMIN_PERMISSION } from '@server/constants';

import { AccessResponse } from './access.dto';

/**
 * A browser session carries OIDC scopes, never the RBAC permissions identity evaluates per organisation, so
 * the web gate asks here rather than reading the session. It answers the same PDP question the admin routes'
 * `@RequirePermission` does, which keeps the nav and the server from disagreeing about who is an admin.
 */
@Authenticated()
@HttpController('/api/v1/access')
export class AccessController {
  constructor(
    private readonly authClient: AuthClient,
    private readonly context: ContextService,
  ) {}

  @Get()
  @RespondFor(200, AccessResponse)
  async getAccess(): Promise<AccessResponse> {
    const principal = this.context.getAuthPrincipal();
    if (!principal.org) return { admin: false };

    const admin = await this.authClient.check({ action: ADMIN_PERMISSION, organisationId: principal.org, principal }, { highRisk: true });
    return { admin };
  }
}
