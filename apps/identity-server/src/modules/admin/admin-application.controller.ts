/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, Params, Patch, Post, Req, RespondFor, ServerError } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { AuditService } from '@server/modules/infrastructure/audit';
import { Application } from '@server/modules/infrastructure/datastore';
import { ApplicationDetails, ApplicationMemberService, ApplicationService } from '@server/modules/system/application';

import { AdminAccessService, AdminActor } from './admin-access.service';
import {
  ApplicationDetailResponse,
  ApplicationIdParams,
  ApplicationListResponse,
  ApplicationMemberListResponse,
  ApplicationMemberParams,
  ApplicationSummaryItem,
  CreateApplicationBody,
  CreateApplicationResponse,
  UpdateApplicationBody,
} from './admin-application.dto';
import { AdminActionResponse } from './admin-user.dto';
import { ADMIN_PERMISSIONS } from './admin.constants';

/**
 * Defining types
 */

interface ApplicationUpdate {
  subDomain?: string;
  displayName?: string;
  description?: string;
  homePageUrl?: string;
  logoUrl?: string;
  isActive?: boolean;
}

/**
 * Declaring the constants
 *
 * Applications are the parent product entities that own OAuth clients, API resources, roles and
 * signing keys. Creating one is the entry point every other admin surface builds on (a client or
 * resource cannot exist without an `applicationId`). The platform application (`shadow-identity`)
 * is protected: it may never be deactivated or deleted, since the whole IdP hangs off it.
 */

@HttpController('/api/v1/admin/applications')
export class AdminApplicationController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly applicationService: ApplicationService,
    private readonly memberService: ApplicationMemberService,
    private readonly clientService: OAuthClientService,
    private readonly auditService: AuditService,
  ) {}

  private async record(actor: AdminActor, action: string, applicationId: string, detail?: Record<string, unknown>): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.session.userId.toString(),
      targetType: 'application',
      targetId: applicationId,
      detail: detail ?? null,
    });
  }

  private toSummary(application: Application): ApplicationSummaryItem {
    return {
      id: application.id,
      name: application.name,
      displayName: application.displayName ?? undefined,
      subDomain: application.subDomain,
      isActive: application.isActive,
      createdAt: application.createdAt.toISOString(),
    };
  }

  private toDetail(application: ApplicationDetails): ApplicationDetailResponse {
    return {
      ...this.toSummary(application),
      description: application.description ?? undefined,
      homePageUrl: application.homePageUrl ?? undefined,
      logoUrl: application.logoUrl ?? undefined,
      roles: application.roles.map(role => ({ id: role.id, roleName: role.roleName, description: role.description ?? undefined })),
      updatedAt: application.updatedAt.toISOString(),
    };
  }

  @Get()
  @RespondFor(200, ApplicationListResponse)
  async list(@Req() request: FastifyRequest): Promise<ApplicationListResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.appsRead);
    return { items: this.applicationService.listApplications().map(application => this.toSummary(application)) };
  }

  @Post()
  @RespondFor(201, CreateApplicationResponse)
  async create(@Body() body: CreateApplicationBody, @Req() request: FastifyRequest): Promise<CreateApplicationResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.appsManage);
    /** Fail fast on a name collision; the unique constraint is the race-safe backstop. */
    if (this.applicationService.getApplication(body.name)) throw new ServerError(AppErrorCode.APP_002);
    const application = await this.applicationService.createApplication({
      name: body.name,
      subDomain: body.subDomain,
      displayName: body.displayName,
      description: body.description,
      homePageUrl: body.homePageUrl,
      logoUrl: body.logoUrl,
      isActive: body.isActive,
    });
    await this.record(actor, 'admin.application.created', String(application.id), { name: application.name });
    return { id: application.id };
  }

  @Get('/:applicationId')
  @RespondFor(200, ApplicationDetailResponse)
  async detail(@Params() params: ApplicationIdParams, @Req() request: FastifyRequest): Promise<ApplicationDetailResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.appsRead);
    const application = this.applicationService.getApplicationByIdOrThrow(Number(params.applicationId));
    return this.toDetail(application);
  }

  @Patch('/:applicationId')
  @RespondFor(200, AdminActionResponse)
  async update(@Params() params: ApplicationIdParams, @Body() body: UpdateApplicationBody, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.appsManage);
    const application = this.applicationService.getApplicationByIdOrThrow(Number(params.applicationId));
    if (application.name === APP_NAME && body.isActive === false) throw new ServerError(AppErrorCode.APP_004);

    const update: ApplicationUpdate = {};
    if (body.subDomain !== undefined) update.subDomain = body.subDomain;
    if (body.displayName !== undefined) update.displayName = body.displayName;
    if (body.description !== undefined) update.description = body.description;
    if (body.homePageUrl !== undefined) update.homePageUrl = body.homePageUrl;
    if (body.logoUrl !== undefined) update.logoUrl = body.logoUrl;
    if (body.isActive !== undefined) update.isActive = body.isActive;

    const fields = Object.keys(update);
    if (fields.length) await this.applicationService.updateApplication(application.name, update);
    await this.record(actor, 'admin.application.updated', String(application.id), { fields });
    return { success: true };
  }

  @Delete('/:applicationId')
  @RespondFor(200, AdminActionResponse)
  async remove(@Params() params: ApplicationIdParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.appsManage);
    const application = this.applicationService.getApplicationByIdOrThrow(Number(params.applicationId));
    if (application.name === APP_NAME) throw new ServerError(AppErrorCode.APP_004);

    /** Clients FK-restrict the delete; resources, roles, permissions and keys cascade away with it. */
    const clients = await this.clientService.listClients();
    if (clients.some(client => client.applicationId === application.id)) throw new ServerError(AppErrorCode.APP_005);

    await this.applicationService.deleteApplication(application.name);
    await this.record(actor, 'admin.application.deleted', String(application.id), { name: application.name });
    return { success: true };
  }

  @Get('/:applicationId/members')
  @RespondFor(200, ApplicationMemberListResponse)
  async members(@Params() params: ApplicationIdParams, @Req() request: FastifyRequest): Promise<ApplicationMemberListResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.appsRead);
    const application = this.applicationService.getApplicationByIdOrThrow(Number(params.applicationId));
    const rows = await this.memberService.listMembers(application.id);
    return {
      items: rows.map(row => ({
        userId: row.userId.toString(),
        username: row.username ?? undefined,
        primaryEmail: row.primaryEmail ?? undefined,
        firstUsedAt: row.firstUsedAt.toISOString(),
        lastUsedAt: row.lastUsedAt.toISOString(),
      })),
    };
  }

  @Delete('/:applicationId/members/:userId')
  @RespondFor(200, AdminActionResponse)
  async removeMember(@Params() params: ApplicationMemberParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.appsManage);
    const application = this.applicationService.getApplicationByIdOrThrow(Number(params.applicationId));
    /** Idempotent: removing an absent membership is a no-op, so re-runs converge without a 404 race. */
    await this.memberService.removeMembership(application.id, BigInt(params.userId));
    await this.record(actor, 'admin.application.member_removed', String(application.id), { userId: params.userId });
    return { success: true };
  }
}
