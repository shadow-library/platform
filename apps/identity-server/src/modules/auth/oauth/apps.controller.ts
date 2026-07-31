/**
 * Importing npm packages
 */
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { Auth, Context, serviceClientId } from '@server/modules/access';

import { ApplicationSelfResponse } from './apps.dto';
import { OAuthClientService } from './oauth-client.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The application as the unit of identity (D-21). A service configures an issuer and its own id and
 * reads everything else back from here — audience, redirect URIs, the scopes its API defines and
 * its grants on other applications — so a scope granted by an admin propagates without a redeploy.
 */
@HttpController('/api/v1/apps')
export class AppsController {
  constructor(private readonly clientService: OAuthClientService) {}

  /**
   * Needs no scope beyond a valid service token: the only subject is the caller itself, resolved
   * from the token rather than the path, so there is nothing here one application could read about
   * another. Deliberately not `@M2MBudget()` — the SDK reads this once at boot and on a TTL, and a
   * per-client budget only applies where something charges it at the point of authentication.
   */
  @Get('/me')
  @Auth({ service: true })
  @RespondFor(200, ApplicationSelfResponse)
  async describeSelf(): Promise<ApplicationSelfResponse> {
    const description = await this.clientService.describeApplication(serviceClientId(Context.getServiceToken()));
    if (!description) throw AppErrorCode.OAU_002.create();
    return { ...description, audience: description.audience ?? undefined };
  }
}
