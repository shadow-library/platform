/**
 * Importing npm packages
 */
import { Body, Get, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context, serviceClientId } from '@server/modules/access';
import { M2MBudget } from '@server/modules/infrastructure/security';

import { OrganisationMemberParams, OrganisationMemberResponse, ResolveUsersBody, ResolveUsersResponse } from './directory.dto';
import { DirectoryService } from './directory.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The service-only directory surface (see {@link DirectoryService} for why it is safe to expose).
 * `users:resolve` is a `SERVICE` scope, so a user token can never carry it, and only a client the
 * ecosystem seed grants it to can mint a token that carries it.
 *
 * Budgeted per calling client rather than per source IP: this is the one surface where the rate
 * limit is a real control rather than hygiene, and a whole fleet sharing one egress IP would
 * otherwise be throttled as a single caller while telling an operator nothing about which
 * application went walking through the directory.
 */

@HttpController('/api/v1/internal')
@Auth({ service: 'users:resolve' })
@M2MBudget()
export class DirectoryController {
  constructor(private readonly directoryService: DirectoryService) {}

  @Post('/users/resolve')
  @RespondFor(200, ResolveUsersResponse)
  async resolveUsers(@Body() body: ResolveUsersBody): Promise<ResolveUsersResponse> {
    const users = await this.directoryService.resolveByEmail(body.emails, serviceClientId(Context.getServiceToken()));
    return { users };
  }

  /** Answers the membership question directly rather than handing out the roster, so a caller learns only what it asked. */
  @Get('/organisations/:organisationId/members/:userId')
  @RespondFor(200, OrganisationMemberResponse)
  async isOrganisationMember(@Params() params: OrganisationMemberParams): Promise<OrganisationMemberResponse> {
    const member = await this.directoryService.isOrganisationMember(params.organisationId, params.userId);
    return { member };
  }
}
