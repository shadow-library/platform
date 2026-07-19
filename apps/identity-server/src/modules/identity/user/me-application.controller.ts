/**
 * Importing npm packages
 */
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';
import { ApplicationMemberService, type UserApplicationRow } from '@server/modules/system/application';

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
@Auth({ session: true })
export class MeApplicationController {
  constructor(private readonly memberService: ApplicationMemberService) {}

  @Get('/applications')
  @RespondFor(200, MyApplicationsResponse)
  async listMyApplications(): Promise<{ applications: UserApplicationRow[] }> {
    return { applications: await this.memberService.listApplicationsForUser(Context.getSession().userId) };
  }
}
