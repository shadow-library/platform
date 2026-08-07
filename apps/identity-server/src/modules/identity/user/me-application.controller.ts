import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

import { Auth, Context } from '@server/modules/access';
import { type AccessibleApplicationRow, ApplicationMemberService } from '@server/modules/system/application';

import { MyApplicationsResponse } from './me-application.dto';

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
