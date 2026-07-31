/**
 * Importing npm packages
 */
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';

import { AdminAccessService } from './admin-access.service';
import { AdminContextResponse } from './admin-context.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/admin/context')
@Auth({ session: true })
export class AdminContextController {
  constructor(private readonly access: AdminAccessService) {}

  /** Reports the caller's admin permissions so the operator console can gate itself before rendering. */
  @Get()
  @RespondFor(200, AdminContextResponse)
  async getAdminContext(): Promise<AdminContextResponse> {
    return { permissions: await this.access.listGrantedPermissions(Context.getSession()) };
  }
}
