/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Query, Req, RespondFor, ServerError } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import { AdminAccessService, AdminActor } from './admin-access.service';
import { AdminActionResponse, LockUserBody, UserAuditEventsResponse, UserDetailResponse, UserIdParams, UserSearchQuery, UserSearchResponse } from './admin-user.dto';
import { AdminActionContext, AdminUserService } from './admin-user.service';
import { ADMIN_PERMISSIONS } from './admin.constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/admin/users')
export class AdminUserController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly adminUserService: AdminUserService,
  ) {}

  private parseUserId(params: UserIdParams): bigint {
    if (!/^\d+$/.test(params.userId)) throw new ServerError(AppErrorCode.USR_001);
    return BigInt(params.userId);
  }

  private contextOf(actor: AdminActor): AdminActionContext {
    return { actorId: actor.session.userId.toString(), organisationId: actor.organisationId };
  }

  @Get()
  @RespondFor(200, UserSearchResponse)
  async search(@Query() query: UserSearchQuery, @Req() request: FastifyRequest): Promise<UserSearchResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.usersRead);
    const result = await this.adminUserService.search({ email: query.email, status: query.status, offset: query.offset, limit: query.limit, sortOrder: query.sortOrder });
    return {
      offset: query.offset,
      limit: query.limit,
      total: result.total,
      items: result.items.map(item => ({
        id: item.id.toString(),
        username: item.username ?? undefined,
        status: item.status,
        lockMode: item.lockMode,
        primaryEmail: item.primaryEmail ?? undefined,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  @Get('/:userId')
  @RespondFor(200, UserDetailResponse)
  async detail(@Params() params: UserIdParams, @Req() request: FastifyRequest): Promise<UserDetailResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.usersRead);
    const detail = await this.adminUserService.getDetail(this.parseUserId(params));
    return {
      id: detail.user.id.toString(),
      username: detail.user.username ?? undefined,
      status: detail.user.status,
      lockMode: detail.user.lockMode,
      lockedUntil: detail.user.lockedUntil?.toISOString(),
      passwordResetRequired: detail.user.passwordResetRequired,
      emails: detail.emails.map(email => ({ value: email.emailId, isPrimary: email.isPrimary, verifiedAt: email.verifiedAt?.toISOString() })),
      phones: detail.phones.map(phone => ({ value: phone.phoneNumber, isPrimary: phone.isPrimary, verifiedAt: phone.verifiedAt?.toISOString() })),
      mfa: detail.mfa,
      activeSessionCount: detail.activeSessionCount,
      createdAt: detail.user.createdAt.toISOString(),
    };
  }

  @Post('/:userId/lock')
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async lock(@Params() params: UserIdParams, @Body() body: LockUserBody, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.usersManage);
    const until = body.until ? new Date(body.until) : null;
    if (until && Number.isNaN(until.getTime())) throw new ServerError(AppErrorCode.ADM_003);
    await this.adminUserService.lock(this.parseUserId(params), body.mode, until, this.contextOf(actor));
    return { success: true };
  }

  @Post('/:userId/unlock')
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async unlock(@Params() params: UserIdParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.usersManage);
    await this.adminUserService.unlock(this.parseUserId(params), this.contextOf(actor));
    return { success: true };
  }

  @Post('/:userId/force-password-reset')
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async forcePasswordReset(@Params() params: UserIdParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.usersManage);
    await this.adminUserService.forcePasswordReset(this.parseUserId(params), this.contextOf(actor));
    return { success: true };
  }

  @Post('/:userId/sessions/terminate')
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async terminateSessions(@Params() params: UserIdParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.usersManage);
    await this.adminUserService.terminateSessions(this.parseUserId(params), this.contextOf(actor));
    return { success: true };
  }

  @Post('/:userId/deactivate')
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async deactivate(@Params() params: UserIdParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.usersManage);
    await this.adminUserService.setStatus(this.parseUserId(params), 'DISABLED', this.contextOf(actor));
    return { success: true };
  }

  @Post('/:userId/reactivate')
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async reactivate(@Params() params: UserIdParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.usersManage);
    await this.adminUserService.setStatus(this.parseUserId(params), 'ACTIVE', this.contextOf(actor));
    return { success: true };
  }

  @Delete('/:userId')
  @RespondFor(200, AdminActionResponse)
  async softDelete(@Params() params: UserIdParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.usersManage);
    await this.adminUserService.softDelete(this.parseUserId(params), this.contextOf(actor));
    return { success: true };
  }

  @Get('/:userId/audit')
  @RespondFor(200, UserAuditEventsResponse)
  async auditTrail(@Params() params: UserIdParams, @Req() request: FastifyRequest): Promise<UserAuditEventsResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.auditRead);
    const events = await this.adminUserService.listAuditEvents(this.parseUserId(params));
    return {
      events: events.map(event => ({
        id: event.id,
        action: event.action,
        outcome: event.outcome,
        occurredAt: event.occurredAt.toISOString(),
        actorId: event.actorId ?? undefined,
        targetType: event.targetType ?? undefined,
        ipAddress: event.ipAddress ?? undefined,
      })),
    };
  }
}
