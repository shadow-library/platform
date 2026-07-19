/**
 * Importing npm packages
 */
import { type FastifyRequest } from 'fastify';
import { Get, HttpController, Req, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

import { AdminAccessService } from './admin-access.service';
import { AdminContextResponse } from './admin-context.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/admin/context')
export class AdminContextController {
  constructor(private readonly access: AdminAccessService) {}

  /** Reports the caller's admin permissions so the operator console can gate itself before rendering. */
  @Get()
  @RespondFor(200, AdminContextResponse)
  async context(@Req() request: FastifyRequest): Promise<AdminContextResponse> {
    const permissions = await this.access.listGrantedPermissions(request);
    return { permissions };
  }
}
