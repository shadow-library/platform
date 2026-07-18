/**
 * Importing npm packages
 */

import { type FastifyRequest } from 'fastify';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Query, Req, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { ServiceAccessService } from '@server/modules/authz';
import { AuditService } from '@server/modules/infrastructure/audit';
import { ServiceRouteAccess } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { AdminAccessService, AdminActor } from './admin-access.service';
import { CreateServiceAccessBody, ServiceAccessListQuery, ServiceAccessListResponse, ServiceAccessRuleItem, ServiceAccessRuleParams } from './admin-service-access.dto';
import { AdminActionResponse } from './admin-user.dto';
import { ADMIN_PERMISSIONS } from './admin.constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Which service may call which routes of which application lives here, in identity, instead of in
 * per-route decorators (D-17). Consuming services pull their own application's rules at startup
 * through the SDK; granting a new caller is an admin operation, not a redeploy.
 */

@HttpController('/api/v1/admin/service-access')
export class AdminServiceAccessController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly serviceAccessService: ServiceAccessService,
    private readonly applicationService: ApplicationService,
    private readonly auditService: AuditService,
  ) {}

  private async record(actor: AdminActor, action: string, ruleId: string, detail?: Record<string, unknown>): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.session.userId.toString(),
      targetType: 'service_route_access',
      targetId: ruleId,
      detail: detail ?? null,
    });
  }

  private toItem(rule: ServiceRouteAccess): ServiceAccessRuleItem {
    return {
      id: rule.id,
      applicationId: rule.applicationId,
      callerClientId: rule.callerClientId,
      method: rule.method,
      pathPattern: rule.pathPattern,
      createdAt: rule.createdAt.toISOString(),
    };
  }

  @Get()
  @RespondFor(200, ServiceAccessListResponse)
  async list(@Query() query: ServiceAccessListQuery, @Req() request: FastifyRequest): Promise<ServiceAccessListResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.clientsRead);
    const rules = await this.serviceAccessService.listForApplication(query.applicationId);
    return { items: rules.map(rule => this.toItem(rule)) };
  }

  @Post()
  @RespondFor(201, ServiceAccessRuleItem)
  async create(@Body() body: CreateServiceAccessBody, @Req() request: FastifyRequest): Promise<ServiceAccessRuleItem> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.clientsManage);
    this.applicationService.getApplicationByIdOrThrow(body.applicationId);

    const rule = await this.serviceAccessService.create({
      applicationId: body.applicationId,
      callerClientId: body.callerClientId,
      method: body.method,
      pathPattern: body.pathPattern,
      createdBy: actor.session.userId.toString(),
    });
    await this.record(actor, 'admin.service-access.created', rule.id, {
      applicationId: body.applicationId,
      callerClientId: body.callerClientId,
      method: rule.method,
      pathPattern: rule.pathPattern,
    });
    return this.toItem(rule);
  }

  @Delete('/:ruleId')
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async remove(@Params() params: ServiceAccessRuleParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.clientsManage);
    const deleted = await this.serviceAccessService.delete(params.ruleId);
    if (!deleted) throw AppErrorCode.ADM_003.create();
    await this.record(actor, 'admin.service-access.deleted', params.ruleId);
    return { success: true };
  }
}
