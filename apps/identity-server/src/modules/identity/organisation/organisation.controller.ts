/**
 * Importing npm packages
 */

import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Req, RespondFor } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { SessionAuthService, ValidatedSession } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { AuditService } from '@server/modules/infrastructure/audit';
import { Organisation } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';

import { InvitationService } from './invitation.service';
import {
  CreateOrganisationBody,
  InvitationParams,
  InvitationsResponse,
  InviteMemberBody,
  MemberParams,
  MembersResponse,
  OrganisationActionResponse,
  OrganisationIdParams,
  OrganisationResponse,
  RenameOrganisationBody,
  UpdateMemberRoleBody,
} from './organisation.dto';
import { OrganisationService } from './organisation.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Team administration authorization split (T-705): routine operations (rename, invite, member
 * changes below owner level) need an org ADMIN with an ordinary session; operations that can hand
 * over or destroy the organisation (owner changes, deletion) demand an OWNER with AAL2 step-up.
 * Rank rule: a caller only administers members ranked strictly below them — except owners, who may
 * also administer fellow owners (last-owner protected).
 */
const ROLE_RANK: Record<Organisation.MemberRole, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 };

const ROLE_CHANGED_TEMPLATE = 'organisation-role-changed';
const MEMBER_REMOVED_TEMPLATE = 'organisation-member-removed';

@HttpController('/api/v1/organisations')
export class OrganisationController {
  constructor(
    private readonly sessionAuthService: SessionAuthService,
    private readonly organisationService: OrganisationService,
    private readonly invitationService: InvitationService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  private toResponse(organisation: Organisation): OrganisationResponse {
    return {
      id: organisation.id.toString(),
      slug: organisation.slug,
      name: organisation.name,
      type: organisation.type,
      status: organisation.status,
      createdAt: organisation.createdAt.toISOString(),
    };
  }

  private async audit(request: FastifyRequest, session: ValidatedSession, organisationId: bigint, action: string, targetType?: string, targetId?: string): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: session.userId.toString(),
      organisationId: organisationId.toString(),
      targetType,
      targetId,
      ipAddress: request.ip,
    });
  }

  @Post()
  @RespondFor(201, OrganisationResponse)
  async create(@Body() body: CreateOrganisationBody, @Req() request: FastifyRequest): Promise<OrganisationResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const organisation = await this.organisationService.createTeam(session.userId, { name: body.name, slug: body.slug });
    await this.audit(request, session, organisation.id, 'org.created');
    return this.toResponse(organisation);
  }

  @Get('/:organisationId')
  @RespondFor(200, OrganisationResponse)
  async get(@Params() params: OrganisationIdParams, @Req() request: FastifyRequest): Promise<OrganisationResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const organisationId = BigInt(params.organisationId);
    await this.organisationService.assertMember(session.userId, organisationId);
    const organisation = await this.organisationService.getById(organisationId);
    if (!organisation || organisation.status === 'DELETED') throw AppErrorCode.ORG_001.create();
    return this.toResponse(organisation);
  }

  @Patch('/:organisationId')
  @RespondFor(200, OrganisationResponse)
  async rename(@Params() params: OrganisationIdParams, @Body() body: RenameOrganisationBody, @Req() request: FastifyRequest): Promise<OrganisationResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const organisationId = BigInt(params.organisationId);
    const { organisation } = await this.organisationService.requireRole(session.userId, organisationId, 'ADMIN');
    await this.organisationService.rename(organisationId, body.name);
    await this.audit(request, session, organisationId, 'org.renamed');
    return this.toResponse({ ...organisation, name: body.name });
  }

  /** Deletion revokes every product-role grant scoped to the org so no PDP decision survives it. */
  @Delete('/:organisationId')
  @RespondFor(200, OrganisationActionResponse)
  async remove(@Params() params: OrganisationIdParams, @Req() request: FastifyRequest): Promise<OrganisationActionResponse> {
    const session = await this.sessionAuthService.authenticateElevated(request);
    const organisationId = BigInt(params.organisationId);
    await this.organisationService.requireRole(session.userId, organisationId, 'OWNER');
    await this.organisationService.softDelete(organisationId);
    await this.policyDecisionService.revokeAllForOrganisation(params.organisationId);
    await this.audit(request, session, organisationId, 'org.deleted');
    return { success: true };
  }

  @Get('/:organisationId/members')
  @RespondFor(200, MembersResponse)
  async listMembers(@Params() params: OrganisationIdParams, @Req() request: FastifyRequest): Promise<MembersResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const organisationId = BigInt(params.organisationId);
    await this.organisationService.assertMember(session.userId, organisationId);
    const members = await this.organisationService.listMembersDetailed(organisationId);
    return {
      members: members.map(({ member, email }) => ({
        userId: member.userId.toString(),
        role: member.role,
        email: email ?? undefined,
        joinedAt: member.joinedAt.toISOString(),
      })),
    };
  }

  @Patch('/:organisationId/members/:userId')
  @RespondFor(200, OrganisationActionResponse)
  async changeMemberRole(@Params() params: MemberParams, @Body() body: UpdateMemberRoleBody, @Req() request: FastifyRequest): Promise<OrganisationActionResponse> {
    const organisationId = BigInt(params.organisationId);
    const targetUserId = BigInt(params.userId);
    const ownerLevel = body.role === 'OWNER';

    const session = ownerLevel ? await this.sessionAuthService.authenticateElevated(request) : await this.sessionAuthService.authenticate(request);
    const { membership: caller } = await this.organisationService.requireRole(session.userId, organisationId, ownerLevel ? 'OWNER' : 'ADMIN');
    const target = await this.organisationService.getMembership(targetUserId, organisationId);
    if (!target) throw AppErrorCode.USR_001.create();
    if (target.role === 'OWNER' && caller.role !== 'OWNER') throw AppErrorCode.ORG_007.create();
    if (target.role === 'OWNER' && session.aal !== 'AAL2') throw AppErrorCode.AUTH_006.create();
    if (caller.role !== 'OWNER' && ROLE_RANK[target.role] >= ROLE_RANK[caller.role]) throw AppErrorCode.ORG_007.create();

    await this.organisationService.updateMemberRole(organisationId, targetUserId, body.role);
    await this.audit(request, session, organisationId, 'org.member_role_changed', 'user', params.userId);
    const email = await this.organisationService.getPrimaryVerifiedEmail(targetUserId);
    if (email) await this.notificationService.enqueue({ templateKey: ROLE_CHANGED_TEMPLATE, recipients: { email }, payload: { role: body.role } });
    return { success: true };
  }

  @Delete('/:organisationId/members/:userId')
  @RespondFor(200, OrganisationActionResponse)
  async removeMember(@Params() params: MemberParams, @Req() request: FastifyRequest): Promise<OrganisationActionResponse> {
    const organisationId = BigInt(params.organisationId);
    const targetUserId = BigInt(params.userId);

    const session = await this.sessionAuthService.authenticate(request);
    const { membership: caller } = await this.organisationService.requireRole(session.userId, organisationId, 'ADMIN');
    const target = await this.organisationService.getMembership(targetUserId, organisationId);
    if (!target) throw AppErrorCode.USR_001.create();
    if (target.userId === session.userId) throw AppErrorCode.ORG_007.create();
    if (target.role === 'OWNER' && (caller.role !== 'OWNER' || session.aal !== 'AAL2')) throw (caller.role !== 'OWNER' ? AppErrorCode.ORG_007 : AppErrorCode.AUTH_006).create();
    if (caller.role !== 'OWNER' && ROLE_RANK[target.role] >= ROLE_RANK[caller.role]) throw AppErrorCode.ORG_007.create();

    await this.organisationService.removeMember(organisationId, targetUserId);
    await this.policyDecisionService.revokeAllForPrincipalInOrganisation({ type: 'USER', id: params.userId }, params.organisationId);
    await this.audit(request, session, organisationId, 'org.member_removed', 'user', params.userId);
    const email = await this.organisationService.getPrimaryVerifiedEmail(targetUserId);
    if (email) await this.notificationService.enqueue({ templateKey: MEMBER_REMOVED_TEMPLATE, recipients: { email }, payload: {} });
    return { success: true };
  }

  @Get('/:organisationId/invitations')
  @RespondFor(200, InvitationsResponse)
  async listInvitations(@Params() params: OrganisationIdParams, @Req() request: FastifyRequest): Promise<InvitationsResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const organisationId = BigInt(params.organisationId);
    await this.organisationService.requireRole(session.userId, organisationId, 'ADMIN');
    const invitations = await this.invitationService.listPending(organisationId);
    return {
      invitations: invitations.map(invitation => ({
        id: invitation.id.toString(),
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
      })),
    };
  }

  @Post('/:organisationId/invitations')
  @HttpStatus(200)
  @RespondFor(200, OrganisationActionResponse)
  async invite(@Params() params: OrganisationIdParams, @Body() body: InviteMemberBody, @Req() request: FastifyRequest): Promise<OrganisationActionResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const organisationId = BigInt(params.organisationId);
    const { organisation } = await this.organisationService.requireRole(session.userId, organisationId, 'ADMIN');
    const invitation = await this.invitationService.invite({ organisation, email: body.email, role: body.role, invitedBy: session.userId });
    await this.audit(request, session, organisationId, 'org.invitation_sent', 'organisation_invitation', invitation.id.toString());
    return { success: true };
  }

  @Delete('/:organisationId/invitations/:invitationId')
  @RespondFor(200, OrganisationActionResponse)
  async revokeInvitation(@Params() params: InvitationParams, @Req() request: FastifyRequest): Promise<OrganisationActionResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const organisationId = BigInt(params.organisationId);
    await this.organisationService.requireRole(session.userId, organisationId, 'ADMIN');
    const invitation = await this.invitationService.revoke(organisationId, BigInt(params.invitationId));
    await this.audit(request, session, organisationId, 'org.invitation_revoked', 'organisation_invitation', invitation.id.toString());
    return { success: true };
  }
}
