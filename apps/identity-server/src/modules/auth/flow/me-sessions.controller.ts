/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { Delete, Get, HttpController, Params, Req, RespondFor, ServerError } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { SessionAuthService, SessionService } from '@server/modules/auth/session';
import { BackChannelLogoutService, RefreshTokenService } from '@server/modules/auth/token';
import { AuditService } from '@server/modules/infrastructure/audit';

/**
 * Defining types
 */

@Schema()
export class SessionIdParams {
  @Field({ pattern: '^\\d+$' })
  sessionId: string;
}

@Schema()
export class MeSessionItem {
  @Field()
  id: string;

  @Field(() => String, { enum: ['AAL1', 'AAL2'] })
  aal: 'AAL1' | 'AAL2';

  @Field()
  createdAt: string;

  @Field()
  lastUsedAt: string;

  @Field(() => String, { optional: true })
  ipAddress?: string;

  @Field(() => String, { optional: true })
  ipCountry?: string;

  @Field(() => String, { optional: true })
  userAgent?: string;

  @Field(() => String, { optional: true })
  deviceName?: string;

  /** Marks the session making this request. */
  @Field(() => Boolean)
  isCurrent: boolean;
}

@Schema()
export class MeSessionsResponse {
  @Field(() => [MeSessionItem])
  sessions: MeSessionItem[];
}

@Schema()
export class SessionsRevokedResponse {
  @Field(() => Number)
  revoked: number;
}

/**
 * Declaring the constants
 *
 * Self-service session management (api-contract §4.4): users see every device holding a live
 * session and can cut any of them loose. Revocations require a fresh second-factor proof so a
 * hijacked idle session cannot silently evict the owner.
 */

@HttpController('/api/v1/me/sessions')
export class MeSessionsController {
  constructor(
    private readonly sessionAuthService: SessionAuthService,
    private readonly sessionService: SessionService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly backChannelLogoutService: BackChannelLogoutService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RespondFor(200, MeSessionsResponse)
  async list(@Req() request: FastifyRequest): Promise<MeSessionsResponse> {
    const current = await this.sessionAuthService.authenticate(request);
    const rows = await this.sessionService.listActiveDetailed(current.userId);
    return {
      sessions: rows.map(({ session, deviceName }) => ({
        id: session.id.toString(),
        aal: session.aal,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        ipAddress: session.ipAddress ?? undefined,
        ipCountry: session.ipCountry ?? undefined,
        userAgent: session.userAgent ?? undefined,
        deviceName: deviceName ?? undefined,
        isCurrent: session.id === current.id,
      })),
    };
  }

  @Delete('/:sessionId')
  @RespondFor(200, SessionsRevokedResponse)
  async revokeOne(@Params() params: SessionIdParams, @Req() request: FastifyRequest): Promise<SessionsRevokedResponse> {
    const current = await this.sessionAuthService.authenticateElevated(request);
    const sessionId = BigInt(params.sessionId);
    const target = await this.sessionService.getById(sessionId);
    /** Absence and other-owner cases answer identically: no probing other users' session ids. */
    if (!target || target.userId !== current.userId || target.status !== 'ACTIVE') throw new ServerError(AppErrorCode.USR_001);

    await this.sessionService.revoke(sessionId, 'REVOKED');
    await this.refreshTokenService.revokeForSession(sessionId);
    await this.backChannelLogoutService.enqueueForSession(sessionId, current.userId);
    await this.auditService.record({
      action: 'session.revoked_by_user',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: current.userId.toString(),
      targetType: 'user_session',
      targetId: params.sessionId,
      ipAddress: request.ip,
    });
    return { revoked: 1 };
  }

  @Delete()
  @RespondFor(200, SessionsRevokedResponse)
  async revokeOthers(@Req() request: FastifyRequest): Promise<SessionsRevokedResponse> {
    const current = await this.sessionAuthService.authenticateElevated(request);
    const active = await this.sessionService.listActiveForUser(current.userId);
    const others = active.filter(session => session.id !== current.id);

    await this.sessionService.terminateAllForUser(current.userId, current.id);
    for (const session of others) {
      await this.refreshTokenService.revokeForSession(session.id);
      await this.backChannelLogoutService.enqueueForSession(session.id, current.userId);
    }
    await this.auditService.record({
      action: 'session.revoked_all_by_user',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: current.userId.toString(),
      ipAddress: request.ip,
      detail: { revoked: others.length },
    });
    return { revoked: others.length };
  }
}
