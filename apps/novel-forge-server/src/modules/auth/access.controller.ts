import { Authenticated } from '@shadow-library/auth/module';
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

import { AdminAccessService } from '@modules/actor';

import { AccessResponse } from './access.dto';

/**
 * A browser session carries OIDC scopes, never the RBAC permissions identity evaluates per organisation, so
 * the web gate asks here rather than reading the session. It answers the same PDP question the admin routes'
 * `@RequirePermission` does, which keeps the nav and the server from disagreeing about who is an admin.
 */
@Authenticated()
@HttpController('/api/v1/access')
export class AccessController {
  constructor(private readonly adminAccess: AdminAccessService) {}

  @Get()
  @RespondFor(200, AccessResponse)
  async getAccess(): Promise<AccessResponse> {
    return { admin: await this.adminAccess.isAdmin() };
  }
}
