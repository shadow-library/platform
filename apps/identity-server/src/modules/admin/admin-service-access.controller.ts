/**
 * Importing npm packages
 */

import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { Auth, Context } from '@server/modules/access';
import { ServiceAccessService } from '@server/modules/authz';
import { AuditService } from '@server/modules/infrastructure/audit';
import { ServiceRouteAccess } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { AdminActor } from './admin-access.service';
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
  @Auth({ permission: ADMIN_PERMISSIONS.clientsRead })
  @RespondFor(200, ServiceAccessListResponse)
  async listServiceAccessRules(@Query() query: ServiceAccessListQuery): Promise<ServiceAccessListResponse> {
    const rules = await this.serviceAccessService.listForApplication(query.applicationId);
    return { items: rules.map(rule => this.toItem(rule)) };
  }

  @Post()
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @RespondFor(201, ServiceAccessRuleItem)
  async createServiceAccessRule(@Body() body: CreateServiceAccessBody): Promise<ServiceAccessRuleItem> {
    const actor = Context.getActor();
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
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async deleteServiceAccessRule(@Params() params: ServiceAccessRuleParams): Promise<AdminActionResponse> {
    const actor = Context.getActor();
    const deleted = await this.serviceAccessService.delete(params.ruleId);
    if (!deleted) throw AppErrorCode.ADM_003.create();
    await this.record(actor, 'admin.service-access.deleted', params.ruleId);
    return { success: true };
  }
}
