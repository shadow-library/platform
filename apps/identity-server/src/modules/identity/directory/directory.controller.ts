import { Body, Get, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import { Auth, Context, serviceClientId } from '@server/modules/access';
import { M2MBudget } from '@server/modules/infrastructure/security';

import { LookupUsersBody, LookupUsersResponse, OrganisationMemberParams, OrganisationMemberResponse, ResolveUsersBody, ResolveUsersResponse } from './directory.dto';
import { DirectoryService } from './directory.service';

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

  @Post('/users/lookup')
  @RespondFor(200, LookupUsersResponse)
  async lookupUsers(@Body() body: LookupUsersBody): Promise<LookupUsersResponse> {
    const users = await this.directoryService.lookupByUserId(body.userIds, serviceClientId(Context.getServiceToken()));
    return { users };
  }

  @Get('/organisations/:organisationId/members/:userId')
  @RespondFor(200, OrganisationMemberResponse)
  async isOrganisationMember(@Params() params: OrganisationMemberParams): Promise<OrganisationMemberResponse> {
    const member = await this.directoryService.isOrganisationMember(params.organisationId, params.userId);
    return { member };
  }
}
