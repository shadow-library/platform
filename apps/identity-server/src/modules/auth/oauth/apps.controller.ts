import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { Auth, Context, serviceClientId } from '@server/modules/access';

import { ApplicationSelfResponse } from './apps.dto';
import { OAuthClientService } from './oauth-client.service';

@HttpController('/api/v1/apps')
export class AppsController {
  constructor(private readonly clientService: OAuthClientService) {}

  @Get('/me')
  @Auth({ service: true })
  @RespondFor(200, ApplicationSelfResponse)
  async describeSelf(): Promise<ApplicationSelfResponse> {
    const description = await this.clientService.describeApplication(serviceClientId(Context.getServiceToken()));
    if (!description) throw AppErrorCode.OAU_002.create();
    return { ...description, audience: description.audience ?? undefined };
  }
}
