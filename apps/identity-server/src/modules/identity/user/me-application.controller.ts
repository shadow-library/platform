/**
 * Importing npm packages
 */
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';
import { type AccessibleApplicationRow, ApplicationMemberService } from '@server/modules/system/application';

import { MyApplicationsResponse } from './me-application.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Self-service launcher: the signed-in user lists every application they may currently enter (per the
 * access resolver, T-901), enriched with first/last-used where they have opened it. Keying on the
 * accessible set rather than on membership surfaces apps they can open but never have, and drops apps
 * they once used but can no longer reach — so the launcher never advertises access the gate would deny.
 */

@HttpController('/api/v1/me')
@Auth({ session: true })
export class MeApplicationController {
  constructor(private readonly memberService: ApplicationMemberService) {}

  @Get('/applications')
  @RespondFor(200, MyApplicationsResponse)
  async listMyApplications(): Promise<{ applications: AccessibleApplicationRow[] }> {
    return { applications: await this.memberService.listAccessibleApplications(Context.getSession().userId) };
  }
}
