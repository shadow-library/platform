/**
 * Importing npm packages
 */
import { type FastifyRequest } from 'fastify';
import { Get, HttpController, Req, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { SessionAuthService } from '@server/modules/auth/session';
import { ApplicationMemberService } from '@server/modules/system/application';

import { MyApplicationsResponse } from './me-application.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Self-service: the signed-in user lists the applications they use. Membership is provisioned on
 * first consent (ConsentService), so this reflects every product the user has authorised.
 */

@HttpController('/api/v1/me')
export class MeApplicationController {
  constructor(
    private readonly sessionAuthService: SessionAuthService,
    private readonly memberService: ApplicationMemberService,
  ) {}

  @Get('/applications')
  @RespondFor(200, MyApplicationsResponse)
  async list(@Req() request: FastifyRequest): Promise<MyApplicationsResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const rows = await this.memberService.listApplicationsForUser(session.userId);
    return {
      applications: rows.map(row => ({
        id: row.id,
        name: row.name,
        displayName: row.displayName ?? undefined,
        subDomain: row.subDomain,
        isActive: row.isActive,
        firstUsedAt: row.firstUsedAt.toISOString(),
        lastUsedAt: row.lastUsedAt.toISOString(),
      })),
    };
  }
}
