import { Authenticated } from '@shadow-library/auth/module';
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

import { SYNAPSE_PERMISSIONS } from '@modules/auth';

import { AdminAccessResponse } from './access.dto';
import { CallerService } from './caller.service';

const USER_PERMISSIONS = Object.values(SYNAPSE_PERMISSIONS);

/** A browser session carries no RBAC permissions, so the console asks here which controls to offer; the routes enforce them regardless. */
@HttpController('/api/v1/admin/access')
export class AccessController {
  constructor(private readonly caller: CallerService) {}

  @Get()
  @Authenticated()
  @RespondFor(200, AdminAccessResponse)
  async getAccess(): Promise<AdminAccessResponse> {
    const user = this.caller.user();
    const granted = await this.caller.permissions(user, USER_PERMISSIONS);
    return { permissions: USER_PERMISSIONS.filter(permission => granted.has(permission)) };
  }
}
