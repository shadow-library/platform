/**
 * Importing npm packages
 */
import { Body, Get, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context, serviceClientId } from '@server/modules/access';
import { M2MBudget } from '@server/modules/infrastructure/security';

import { LookupUsersBody, LookupUsersResponse, OrganisationMemberParams, OrganisationMemberResponse, ResolveUsersBody, ResolveUsersResponse } from './directory.dto';
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
 * All three routes share that one scope rather than splitting a second one out for the id direction.
 * A separate scope would read as tighter and would not be: the ecosystem seed is create-only
 * per application, so a new scope never reaches an already-seeded deployment without a console change,
 * and the grant every existing caller actually holds would still be this one. One scope that honestly
 * names the whole seam beats two where the narrower is unenforced everywhere it already runs.
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

  /** The id direction: names subjects the caller already holds, so a service can show a person rather than a number. */
  @Post('/users/lookup')
  @RespondFor(200, LookupUsersResponse)
  async lookupUsers(@Body() body: LookupUsersBody): Promise<LookupUsersResponse> {
    const users = await this.directoryService.lookupByUserId(body.userIds, serviceClientId(Context.getServiceToken()));
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
