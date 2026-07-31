/**
 * Importing npm packages
 */

import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';
import { type Organisation } from '@server/modules/infrastructure/datastore';

import { InvitationTokenBody, MyOrganisationsResponse, OrganisationActionResponse, OrganisationIdParams, OrganisationResponse } from './organisation.dto';
import { type MyOrganisationListItem, OrganisationService } from './organisation.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Self-service membership: the signed-in user lists their organisations, resolves invitation
 * tokens from their inbox, and leaves teams. Every route needs only a session, so `@Auth` is
 * declared once on the controller.
 */

@HttpController('/api/v1/me')
@Auth({ session: true })
export class MeOrganisationController {
  constructor(private readonly organisationService: OrganisationService) {}

  private caller() {
    return { session: Context.getSession(), ip: Context.getClientInfo().ip };
  }

  @Get('/organisations')
  @RespondFor(200, MyOrganisationsResponse)
  async listMyOrganisations(): Promise<{ organisations: MyOrganisationListItem[] }> {
    return { organisations: await this.organisationService.listMyOrganisationItems(Context.getSession().userId) };
  }

  @Delete('/organisations/:organisationId')
  @RespondFor(200, OrganisationActionResponse)
  async leaveOrganisation(@Params() params: OrganisationIdParams): Promise<OrganisationActionResponse> {
    await this.organisationService.leaveOrganisation(this.caller(), params.organisationId);
    return { success: true };
  }

  @Post('/invitations/accept')
  @HttpStatus(200)
  @RespondFor(200, OrganisationResponse)
  acceptOrganisationInvitation(@Body() body: InvitationTokenBody): Promise<Organisation> {
    return this.organisationService.acceptInvitation(this.caller(), body.token);
  }

  @Post('/invitations/decline')
  @HttpStatus(200)
  @RespondFor(200, OrganisationActionResponse)
  async declineOrganisationInvitation(@Body() body: InvitationTokenBody): Promise<OrganisationActionResponse> {
    await this.organisationService.declineInvitation(this.caller(), body.token);
    return { success: true };
  }
}
