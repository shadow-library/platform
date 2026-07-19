/**
 * Importing npm packages
 */

import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { Auth, Context } from '@server/modules/access';

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
@Auth({ permission: ADMIN_PERMISSIONS.usersRead })
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  private actionContext(): AdminActionContext {
    const actor = Context.getActor();
    return { actorId: actor.session.userId.toString(), organisationId: actor.organisationId };
  }

  @Get()
  @RespondFor(200, UserSearchResponse)
  async searchUsers(@Query() query: UserSearchQuery): Promise<UserSearchResponse> {
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
  async getUserDetail(@Params() params: UserIdParams): Promise<UserDetailResponse> {
    const detail = await this.adminUserService.getDetail(params.userId);
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
  @Auth({ permission: ADMIN_PERMISSIONS.usersManage, elevated: true })
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async lockUser(@Params() params: UserIdParams, @Body() body: LockUserBody): Promise<AdminActionResponse> {
    const until = body.until ? new Date(body.until) : null;
    if (until && Number.isNaN(until.getTime())) throw AppErrorCode.ADM_003.create();
    await this.adminUserService.lock(params.userId, body.mode, until, this.actionContext());
    return { success: true };
  }

  @Post('/:userId/unlock')
  @Auth({ permission: ADMIN_PERMISSIONS.usersManage, elevated: true })
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async unlockUser(@Params() params: UserIdParams): Promise<AdminActionResponse> {
    await this.adminUserService.unlock(params.userId, this.actionContext());
    return { success: true };
  }

  @Post('/:userId/force-password-reset')
  @Auth({ permission: ADMIN_PERMISSIONS.usersManage, elevated: true })
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async forceUserPasswordReset(@Params() params: UserIdParams): Promise<AdminActionResponse> {
    await this.adminUserService.forcePasswordReset(params.userId, this.actionContext());
    return { success: true };
  }

  @Post('/:userId/sessions/terminate')
  @Auth({ permission: ADMIN_PERMISSIONS.usersManage, elevated: true })
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async terminateUserSessions(@Params() params: UserIdParams): Promise<AdminActionResponse> {
    await this.adminUserService.terminateSessions(params.userId, this.actionContext());
    return { success: true };
  }

  @Post('/:userId/deactivate')
  @Auth({ permission: ADMIN_PERMISSIONS.usersManage, elevated: true })
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async deactivateUser(@Params() params: UserIdParams): Promise<AdminActionResponse> {
    await this.adminUserService.setStatus(params.userId, 'DISABLED', this.actionContext());
    return { success: true };
  }

  @Post('/:userId/reactivate')
  @Auth({ permission: ADMIN_PERMISSIONS.usersManage, elevated: true })
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async reactivateUser(@Params() params: UserIdParams): Promise<AdminActionResponse> {
    await this.adminUserService.setStatus(params.userId, 'ACTIVE', this.actionContext());
    return { success: true };
  }

  @Delete('/:userId')
  @Auth({ permission: ADMIN_PERMISSIONS.usersManage, elevated: true })
  @RespondFor(200, AdminActionResponse)
  async deleteUser(@Params() params: UserIdParams): Promise<AdminActionResponse> {
    await this.adminUserService.softDelete(params.userId, this.actionContext());
    return { success: true };
  }

  @Get('/:userId/audit')
  @Auth({ permission: ADMIN_PERMISSIONS.auditRead })
  @RespondFor(200, UserAuditEventsResponse)
  async getUserAuditTrail(@Params() params: UserIdParams): Promise<UserAuditEventsResponse> {
    const events = await this.adminUserService.listAuditEvents(params.userId);
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
