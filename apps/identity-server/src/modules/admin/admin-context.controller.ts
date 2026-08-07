import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

import { Auth, Context } from '@server/modules/access';

import { AdminAccessService } from './admin-access.service';
import { AdminContextResponse } from './admin-context.dto';

@HttpController('/api/v1/admin/context')
@Auth({ session: true })
export class AdminContextController {
  constructor(private readonly access: AdminAccessService) {}

  @Get()
  @RespondFor(200, AdminContextResponse)
  async getAdminContext(): Promise<AdminContextResponse> {
    return { permissions: await this.access.listGrantedPermissions(Context.getSession()) };
  }
}
