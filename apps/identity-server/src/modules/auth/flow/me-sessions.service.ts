/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { SessionService, type ValidatedSession } from '@server/modules/auth/session';
import { BackChannelLogoutService, RefreshTokenService } from '@server/modules/auth/token';
import { AuditService } from '@server/modules/infrastructure/audit';

/**
 * Defining types
 */

interface SessionCaller {
  session: ValidatedSession;
  ip: string;
}

export interface MeSessionListItem {
  id: bigint;
  aal: 'AAL1' | 'AAL2';
  createdAt: Date;
  lastUsedAt: Date;
  ipAddress?: string;
  ipCountry?: string;
  userAgent?: string;
  deviceName?: string;
  isCurrent: boolean;
}

/**
 * Declaring the constants
 *
 * Self-service session management (api-contract §4.4): users see every device holding a live session
 * and can cut any of them loose. Revoking a session tears down its refresh-token families and fans
 * out a back-channel logout to every relying party that holds a session for it.
 */

@Injectable()
export class MeSessionsService {
  constructor(
    private readonly sessionService: SessionService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly backChannelLogoutService: BackChannelLogoutService,
    private readonly auditService: AuditService,
  ) {}

  async listMySessions(current: ValidatedSession): Promise<MeSessionListItem[]> {
    const rows = await this.sessionService.listActiveDetailed(current.userId);
    return rows.map(({ session, deviceName }) => ({
      id: session.id,
      aal: session.aal,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      ipAddress: session.ipAddress ?? undefined,
      ipCountry: session.ipCountry ?? undefined,
      userAgent: session.userAgent ?? undefined,
      deviceName: deviceName ?? undefined,
      isCurrent: session.id === current.id,
    }));
  }

  async revokeMySession(caller: SessionCaller, sessionId: bigint): Promise<{ revoked: number }> {
    const target = await this.sessionService.getById(sessionId);
    /** Absence and other-owner cases answer identically: no probing other users' session ids. */
    if (!target || target.userId !== caller.session.userId || target.status !== 'ACTIVE') throw AppErrorCode.USR_001.create();

    await this.sessionService.revoke(sessionId, 'REVOKED');
    await this.refreshTokenService.revokeForSession(sessionId);
    await this.backChannelLogoutService.enqueueForSession(sessionId, caller.session.userId);
    await this.auditService.record({
      action: 'session.revoked_by_user',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: caller.session.userId.toString(),
      targetType: 'user_session',
      targetId: sessionId.toString(),
      ipAddress: caller.ip,
    });
    return { revoked: 1 };
  }

  async revokeMyOtherSessions(caller: SessionCaller): Promise<{ revoked: number }> {
    const active = await this.sessionService.listActiveForUser(caller.session.userId);
    const others = active.filter(session => session.id !== caller.session.id);

    await this.sessionService.terminateAllForUser(caller.session.userId, caller.session.id);
    for (const session of others) {
      await this.refreshTokenService.revokeForSession(session.id);
      await this.backChannelLogoutService.enqueueForSession(session.id, caller.session.userId);
    }
    await this.auditService.record({
      action: 'session.revoked_all_by_user',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: caller.session.userId.toString(),
      ipAddress: caller.ip,
      detail: { revoked: others.length },
    });
    return { revoked: others.length };
  }
}
