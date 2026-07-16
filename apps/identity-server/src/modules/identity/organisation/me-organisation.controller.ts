/**
 * Importing npm packages
 */

import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Req, RespondFor } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { SessionAuthService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { AuditService } from '@server/modules/infrastructure/audit';

import { InvitationService } from './invitation.service';
import { InvitationTokenBody, MyOrganisationsResponse, OrganisationActionResponse, OrganisationIdParams, OrganisationResponse } from './organisation.dto';
import { OrganisationService } from './organisation.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Self-service membership: the signed-in user lists their organisations, resolves invitation
 * tokens from their inbox, and leaves teams. Acceptance requires the invited address to be one of
 * the caller's verified emails, so invitations issued before registration resolve naturally once
 * the user signs up and verifies that address.
 */

@HttpController('/api/v1/me')
export class MeOrganisationController {
  constructor(
    private readonly sessionAuthService: SessionAuthService,
    private readonly organisationService: OrganisationService,
    private readonly invitationService: InvitationService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly auditService: AuditService,
  ) {}

  @Get('/organisations')
  @RespondFor(200, MyOrganisationsResponse)
  async list(@Req() request: FastifyRequest): Promise<MyOrganisationsResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const entries = await this.organisationService.listOrganisationsForUser(session.userId);
    return {
      organisations: entries
        .filter(({ organisation }) => organisation.status !== 'DELETED')
        .map(({ membership, organisation }) => ({
          id: organisation.id.toString(),
          slug: organisation.slug,
          name: organisation.name,
          type: organisation.type,
          status: organisation.status,
          role: membership.role,
          isDefault: membership.isDefault,
          joinedAt: membership.joinedAt.toISOString(),
        })),
    };
  }

  /** Leaving is removal of oneself: same last-owner protection, same grant revocation. */
  @Delete('/organisations/:organisationId')
  @RespondFor(200, OrganisationActionResponse)
  async leave(@Params() params: OrganisationIdParams, @Req() request: FastifyRequest): Promise<OrganisationActionResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const organisationId = BigInt(params.organisationId);
    const membership = await this.organisationService.getMembership(session.userId, organisationId);
    const organisation = await this.organisationService.getById(organisationId);
    if (!membership || !organisation) throw AppErrorCode.ORG_001.create();
    if (organisation.type === 'PERSONAL') throw AppErrorCode.ORG_003.create();

    await this.organisationService.removeMember(organisationId, session.userId);
    await this.policyDecisionService.revokeAllForPrincipalInOrganisation({ type: 'USER', id: session.userId.toString() }, params.organisationId);
    await this.auditService.record({
      action: 'org.member_left',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: session.userId.toString(),
      organisationId: params.organisationId,
      ipAddress: request.ip,
    });
    return { success: true };
  }

  @Post('/invitations/accept')
  @HttpStatus(200)
  @RespondFor(200, OrganisationResponse)
  async accept(@Body() body: InvitationTokenBody, @Req() request: FastifyRequest): Promise<OrganisationResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const { invitation, organisation } = await this.invitationService.accept(session.userId, body.token);
    await this.auditService.record({
      action: 'org.invitation_accepted',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: session.userId.toString(),
      organisationId: organisation.id.toString(),
      targetType: 'organisation_invitation',
      targetId: invitation.id.toString(),
      ipAddress: request.ip,
    });
    return {
      id: organisation.id.toString(),
      slug: organisation.slug,
      name: organisation.name,
      type: organisation.type,
      status: organisation.status,
      createdAt: organisation.createdAt.toISOString(),
    };
  }

  @Post('/invitations/decline')
  @HttpStatus(200)
  @RespondFor(200, OrganisationActionResponse)
  async decline(@Body() body: InvitationTokenBody, @Req() request: FastifyRequest): Promise<OrganisationActionResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const invitation = await this.invitationService.decline(session.userId, body.token);
    await this.auditService.record({
      action: 'org.invitation_declined',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: session.userId.toString(),
      organisationId: invitation.organisationId.toString(),
      targetType: 'organisation_invitation',
      targetId: invitation.id.toString(),
      ipAddress: request.ip,
    });
    return { success: true };
  }
}
