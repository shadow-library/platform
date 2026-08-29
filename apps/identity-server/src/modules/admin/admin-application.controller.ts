import { Body, Delete, Get, HttpController, Params, Patch, Post, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { Auth, Context } from '@server/modules/access';
import { OAUTH_CALLBACK_PATH, OAuthClientService } from '@server/modules/auth/oauth';
import { AuditService } from '@server/modules/infrastructure/audit';
import { Application } from '@server/modules/infrastructure/datastore';
import { ApplicationAccessService, ApplicationDetails, ApplicationMemberService, ApplicationService, OrganisationApplicationService } from '@server/modules/system/application';

import { AdminActor } from './admin-access.service';
import {
  ApplicationDetailResponse,
  ApplicationIdParams,
  ApplicationListResponse,
  ApplicationMemberListResponse,
  ApplicationMemberParams,
  ApplicationOrganisationListResponse,
  ApplicationOrganisationParams,
  ApplicationSummaryItem,
  CreateApplicationBody,
  CreateApplicationResponse,
  ReleaseApplicationBody,
  UpdateApplicationBody,
} from './admin-application.dto';
import { AdminActionResponse } from './admin-user.dto';
import { ADMIN_PERMISSIONS } from './admin.constants';

interface ApplicationUpdate {
  subDomain?: string;
  displayName?: string;
  description?: string;
  homePageUrl?: string;
  logoUrl?: string;
  isActive?: boolean;
  visibility?: Application.Visibility;
  publicUrls?: string[];
}

@HttpController('/api/v1/admin/applications')
export class AdminApplicationController {
  constructor(
    private readonly applicationService: ApplicationService,
    private readonly memberService: ApplicationMemberService,
    private readonly accessService: ApplicationAccessService,
    private readonly organisationApplicationService: OrganisationApplicationService,
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
      visibility: application.visibility,
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
      publicUrls: application.publicUrls,
      updatedAt: application.updatedAt.toISOString(),
    };
  }

  @Get()
  @Auth({ permission: ADMIN_PERMISSIONS.appsRead })
  @RespondFor(200, ApplicationListResponse)
  listApplications(): ApplicationListResponse {
    return { items: this.applicationService.listApplications().map(application => this.toSummary(application)) };
  }

  @Post()
  @Auth({ permission: ADMIN_PERMISSIONS.appsManage, elevated: true })
  @RespondFor(201, CreateApplicationResponse)
  async createApplication(@Body() body: CreateApplicationBody): Promise<CreateApplicationResponse> {
    const actor = Context.getActor();
    /** Fail fast on a name collision; the unique constraint is the race-safe backstop. */
    if (this.applicationService.getApplication(body.name)) throw AppErrorCode.APP_002.create();
    const application = await this.applicationService.createApplication({
      name: body.name,
      subDomain: body.subDomain,
      displayName: body.displayName,
      description: body.description,
      homePageUrl: body.homePageUrl,
      logoUrl: body.logoUrl,
      isActive: body.isActive,
      publicUrls: body.publicUrls ? this.normaliseOrigins(body.publicUrls) : undefined,
    });

    const provisioned = await this.clientService.provisionApplicationIdentity({
      applicationId: application.id,
      name: application.name,
      publicUrls: application.publicUrls,
    });
    await this.record(actor, 'admin.application.created', String(application.id), { name: application.name, clientId: provisioned.clientId });
    return { id: application.id, clientId: provisioned.clientId, audience: provisioned.audience, clientSecret: provisioned.secret };
  }

  @Get('/:applicationId')
  @Auth({ permission: ADMIN_PERMISSIONS.appsRead })
  @RespondFor(200, ApplicationDetailResponse)
  getApplicationDetails(@Params() params: ApplicationIdParams): ApplicationDetailResponse {
    const application = this.applicationService.getApplicationByIdOrThrow(params.applicationId);
    return this.toDetail(application);
  }

  @Patch('/:applicationId')
  @Auth({ permission: ADMIN_PERMISSIONS.appsManage, elevated: true })
  @RespondFor(200, AdminActionResponse)
  async updateApplication(@Params() params: ApplicationIdParams, @Body() body: UpdateApplicationBody): Promise<AdminActionResponse> {
    const actor = Context.getActor();
    const application = this.applicationService.getApplicationByIdOrThrow(params.applicationId);
    if (application.name === APP_NAME && body.isActive === false) throw AppErrorCode.APP_004.create();
    if (application.ownerOrganisationId !== null) throw AppErrorCode.APP_009.create();

    const update: ApplicationUpdate = {};
    if (body.subDomain !== undefined) update.subDomain = body.subDomain;
    if (body.displayName !== undefined) update.displayName = body.displayName;
    if (body.description !== undefined) update.description = body.description;
    if (body.homePageUrl !== undefined) update.homePageUrl = body.homePageUrl;
    if (body.logoUrl !== undefined) update.logoUrl = body.logoUrl;
    if (body.isActive !== undefined) update.isActive = body.isActive;
    if (body.visibility !== undefined) update.visibility = body.visibility;
    if (body.publicUrls !== undefined) update.publicUrls = this.normaliseOrigins(body.publicUrls);

    const fields = Object.keys(update);
    if (fields.length) await this.applicationService.updateApplication(application.name, update);
    if (update.publicUrls !== undefined) await this.regenerateRelyingPartyRedirectUris(application.id, update.publicUrls);
    await this.record(actor, 'admin.application.updated', String(application.id), { fields });

    if (body.visibility !== undefined) {
      await this.accessService.invalidateGlobal();
      await this.record(actor, 'application.visibility.changed', String(application.id), { visibility: body.visibility });
    }
    return { success: true };
  }

  private normaliseOrigins(origins: string[]): string[] {
    return [...new Set(origins.map(origin => origin.trim().replace(/\/$/, '')).filter(Boolean))];
  }

  private async regenerateRelyingPartyRedirectUris(applicationId: number, publicUrls: string[]): Promise<void> {
    const redirectUris = publicUrls.map(origin => `${origin}${OAUTH_CALLBACK_PATH}`);
    const clients = await this.clientService.listClients(applicationId);
    for (const client of clients) {
      if (client.kind === 'WEB_CONFIDENTIAL') await this.clientService.updateClient(client.id, { redirectUris });
    }
  }

  @Delete('/:applicationId')
  @Auth({ permission: ADMIN_PERMISSIONS.appsManage, elevated: true })
  @RespondFor(200, AdminActionResponse)
  async deleteApplication(@Params() params: ApplicationIdParams): Promise<AdminActionResponse> {
    const actor = Context.getActor();
    const application = this.applicationService.getApplicationByIdOrThrow(params.applicationId);
    if (application.name === APP_NAME) throw AppErrorCode.APP_004.create();
    if (application.ownerOrganisationId !== null) throw AppErrorCode.APP_009.create();

    const clients = (await this.clientService.listClients()).filter(client => client.applicationId === application.id);
    if (clients.some(client => client.id !== application.name)) throw AppErrorCode.APP_005.create();
    for (const client of clients) await this.clientService.deleteClient(client.id);

    await this.applicationService.deleteApplication(application.name);
    await this.record(actor, 'admin.application.deleted', String(application.id), { name: application.name });
    return { success: true };
  }

  @Get('/:applicationId/members')
  @Auth({ permission: ADMIN_PERMISSIONS.appsRead })
  @RespondFor(200, ApplicationMemberListResponse)
  async listApplicationMembers(@Params() params: ApplicationIdParams): Promise<ApplicationMemberListResponse> {
    const application = this.applicationService.getApplicationByIdOrThrow(params.applicationId);
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
  @Auth({ permission: ADMIN_PERMISSIONS.appsManage, elevated: true })
  @RespondFor(200, AdminActionResponse)
  async removeApplicationMember(@Params() params: ApplicationMemberParams): Promise<AdminActionResponse> {
    const actor = Context.getActor();
    const application = this.applicationService.getApplicationByIdOrThrow(params.applicationId);
    await this.memberService.removeMembership(application.id, params.userId);
    await this.record(actor, 'admin.application.member_removed', String(application.id), { userId: params.userId.toString() });
    return { success: true };
  }

  @Get('/:applicationId/organisations')
  @Auth({ permission: ADMIN_PERMISSIONS.appsRead })
  @RespondFor(200, ApplicationOrganisationListResponse)
  async listApplicationOrganisations(@Params() params: ApplicationIdParams): Promise<ApplicationOrganisationListResponse> {
    const rows = await this.organisationApplicationService.listApplicationOrganisations(params.applicationId);
    return {
      items: rows.map(row => ({
        organisationId: row.organisationId.toString(),
        slug: row.slug,
        name: row.name,
        source: row.source,
        assignedAt: row.assignedAt.toISOString(),
        assignedBy: row.assignedBy ?? undefined,
      })),
    };
  }

  @Post('/:applicationId/organisations')
  @Auth({ permission: ADMIN_PERMISSIONS.appsManage, elevated: true })
  @RespondFor(200, AdminActionResponse)
  async releaseApplication(@Params() params: ApplicationIdParams, @Body() body: ReleaseApplicationBody): Promise<AdminActionResponse> {
    await this.organisationApplicationService.release(this.auditActor(), params.applicationId, body.organisationId);
    return { success: true };
  }

  @Delete('/:applicationId/organisations/:organisationId')
  @Auth({ permission: ADMIN_PERMISSIONS.appsManage, elevated: true })
  @RespondFor(200, AdminActionResponse)
  async revokeApplicationRelease(@Params() params: ApplicationOrganisationParams): Promise<AdminActionResponse> {
    await this.organisationApplicationService.revoke(this.auditActor(), params.applicationId, params.organisationId);
    return { success: true };
  }

  private auditActor(): { actorId: string; ip?: string } {
    return { actorId: Context.getActor().session.userId.toString(), ip: Context.getClientInfo().ip };
  }
}
