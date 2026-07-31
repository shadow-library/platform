/**
 * Importing npm packages
 */

import { ValidationError } from '@shadow-library/common';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { ERROR_MESSAGES } from '@server/constants';
import { Auth, Context } from '@server/modules/access';
import { type Organisation } from '@server/modules/infrastructure/datastore';
import { OrganisationApplicationService, type OrganisationApplicationsView } from '@server/modules/system/application';

import {
  AssignApplicationBody,
  CreateOrganisationBody,
  InvitationParams,
  InvitationsResponse,
  InviteMemberBody,
  MemberParams,
  MembersResponse,
  OrganisationActionResponse,
  OrganisationApplicationParams,
  OrganisationApplicationsResponse,
  OrganisationIdParams,
  OrganisationResponse,
  UpdateMemberRoleBody,
  UpdateMemberStatusBody,
  UpdateOrganisationBody,
} from './organisation.dto';
import { type MemberListItem, OrganisationService } from './organisation.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/organisations')
export class OrganisationController {
  constructor(
    private readonly organisationService: OrganisationService,
    private readonly organisationApplicationService: OrganisationApplicationService,
  ) {}

  private caller() {
    return { session: Context.getSession(), ip: Context.getClientInfo().ip };
  }

  private auditActor(): { actorId: string; ip?: string } {
    const caller = this.caller();
    return { actorId: caller.session.userId.toString(), ip: caller.ip };
  }

  @Post()
  @Auth({ session: true })
  @HttpStatus(201)
  @RespondFor(201, OrganisationResponse)
  createOrganisation(@Body() body: CreateOrganisationBody): Promise<Organisation> {
    return this.organisationService.createOrganisation(this.caller(), { name: body.name, slug: body.slug });
  }

  @Get('/:organisationId')
  @Auth({ orgMember: true })
  @RespondFor(200, OrganisationResponse)
  getOrganisationDetails(@Params() params: OrganisationIdParams): Promise<Organisation> {
    return this.organisationService.getOrganisation(params.organisationId);
  }

  /**
   * A rename is ADMIN-level (the guard), but flipping `appAccessMode` governs every member's app surface,
   * so it demands an elevated OWNER — a field-dependent authorization enforced in the service, leaving the
   * rename path's semantics untouched when `appAccessMode` is absent.
   */
  @Patch('/:organisationId')
  @Auth({ orgRole: 'ADMIN' })
  @RespondFor(200, OrganisationResponse)
  async updateOrganisation(@Params() params: OrganisationIdParams, @Body() body: UpdateOrganisationBody): Promise<Organisation> {
    let organisation = Context.getOrganisation();
    if (body.appAccessMode !== undefined) {
      const caller = { role: Context.getMembership().role, elevated: Context.getAuth().elevated ?? false };
      organisation = await this.organisationApplicationService.changeAppAccessMode(this.auditActor(), params.organisationId, caller, body.appAccessMode);
    }
    if (body.name !== undefined) organisation = await this.organisationService.renameOrganisation(this.caller(), organisation, body.name);
    return organisation;
  }

  @Delete('/:organisationId')
  @Auth({ orgRole: 'OWNER', elevated: true })
  @RespondFor(200, OrganisationActionResponse)
  async deleteOrganisation(@Params() params: OrganisationIdParams): Promise<OrganisationActionResponse> {
    await this.organisationService.deleteOrganisation(this.caller(), params.organisationId);
    return { success: true };
  }

  @Get('/:organisationId/members')
  @Auth({ orgMember: true })
  @RespondFor(200, MembersResponse)
  async listOrganisationMembers(@Params() params: OrganisationIdParams): Promise<{ members: MemberListItem[] }> {
    return { members: await this.organisationService.listMemberItems(params.organisationId) };
  }

  @Patch('/:organisationId/members/:userId')
  @Auth({ orgRole: 'ADMIN' })
  @RespondFor(200, OrganisationActionResponse)
  async changeOrganisationMemberRole(@Params() params: MemberParams, @Body() body: UpdateMemberRoleBody): Promise<OrganisationActionResponse> {
    await this.organisationService.changeMemberRole(this.caller(), Context.getMembership(), params.organisationId, params.userId, body.role);
    return { success: true };
  }

  /**
   * Org-scoped only: this pauses or bars the member inside this organisation and never touches their global account,
   * which a tenant administrator has no standing to disable.
   */
  @Patch('/:organisationId/members/:userId/status')
  @Auth({ orgRole: 'ADMIN' })
  @RespondFor(200, OrganisationActionResponse)
  async changeOrganisationMemberStatus(@Params() params: MemberParams, @Body() body: UpdateMemberStatusBody): Promise<OrganisationActionResponse> {
    const until = this.parseExpiry(body.status, body.until);
    await this.organisationService.changeMemberStatus(this.caller(), Context.getMembership(), params.organisationId, params.userId, body.status, { reason: body.reason, until });
    return { success: true };
  }

  /** Only a suspension lapses on its own, so only a suspension may carry an expiry — and it must be in the future. */
  private parseExpiry(status: Organisation.MemberStatus, value: string | undefined): Date | undefined {
    if (!value) return undefined;
    if (status !== 'SUSPENDED') throw new ValidationError('until', ERROR_MESSAGES.EXPIRY_NOT_APPLICABLE);
    const until = new Date(value);
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) throw new ValidationError('until', ERROR_MESSAGES.EXPIRY_MUST_BE_FUTURE);
    return until;
  }

  @Delete('/:organisationId/members/:userId')
  @Auth({ orgRole: 'ADMIN' })
  @RespondFor(200, OrganisationActionResponse)
  async removeOrganisationMember(@Params() params: MemberParams): Promise<OrganisationActionResponse> {
    await this.organisationService.removeOrganisationMember(this.caller(), Context.getMembership(), params.organisationId, params.userId);
    return { success: true };
  }

  @Get('/:organisationId/invitations')
  @Auth({ orgRole: 'ADMIN' })
  @RespondFor(200, InvitationsResponse)
  async listOrganisationInvitations(@Params() params: OrganisationIdParams): Promise<{ invitations: Organisation.Invitation[] }> {
    return { invitations: await this.organisationService.listPendingInvitations(params.organisationId) };
  }

  @Post('/:organisationId/invitations')
  @Auth({ orgRole: 'ADMIN' })
  @HttpStatus(200)
  @RespondFor(200, OrganisationActionResponse)
  async inviteOrganisationMember(@Params() params: OrganisationIdParams, @Body() body: InviteMemberBody): Promise<OrganisationActionResponse> {
    await this.organisationService.inviteMember(this.caller(), Context.getOrganisation(), body.email, body.role);
    return { success: true };
  }

  @Delete('/:organisationId/invitations/:invitationId')
  @Auth({ orgRole: 'ADMIN' })
  @RespondFor(200, OrganisationActionResponse)
  async revokeOrganisationInvitation(@Params() params: InvitationParams): Promise<OrganisationActionResponse> {
    await this.organisationService.revokeInvitation(this.caller(), params.organisationId, params.invitationId);
    return { success: true };
  }

  @Get('/:organisationId/applications')
  @Auth({ orgRole: 'ADMIN' })
  @RespondFor(200, OrganisationApplicationsResponse)
  listOrganisationApplications(@Params() params: OrganisationIdParams): Promise<OrganisationApplicationsView> {
    return this.organisationApplicationService.listForOrganisation(params.organisationId);
  }

  @Post('/:organisationId/applications')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @HttpStatus(200)
  @RespondFor(200, OrganisationActionResponse)
  async assignOrganisationApplication(@Params() params: OrganisationIdParams, @Body() body: AssignApplicationBody): Promise<OrganisationActionResponse> {
    await this.organisationApplicationService.assign(this.auditActor(), params.organisationId, body.applicationId);
    return { success: true };
  }

  @Delete('/:organisationId/applications/:applicationId')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @RespondFor(200, OrganisationActionResponse)
  async unassignOrganisationApplication(@Params() params: OrganisationApplicationParams): Promise<OrganisationActionResponse> {
    await this.organisationApplicationService.unassign(this.auditActor(), params.organisationId, params.applicationId);
    return { success: true };
  }
}
