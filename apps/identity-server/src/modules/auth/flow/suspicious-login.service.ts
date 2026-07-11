/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { and, eq } from 'drizzle-orm';
import { Redis } from 'ioredis';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { UserEmailService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';
import { RateLimiterService } from '@server/modules/infrastructure/security';

import { DeviceContext } from './auth-flow.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * T-502/T-503: a successful login from an unseen device or IP alerts the account owner; failed
 * logins are correlated per source IP across accounts, and a burst past the threshold temp-blocks
 * the IP at Tier-1. GeoIP / impossible-travel signals need an external location database and are
 * deferred (docs/tasks.md). Thresholds are mutable for operational tuning and tests.
 */
const NEW_SIGNIN_TEMPLATE = 'security.new-signin';
const IP_FAILURE_WINDOW_SECONDS = 900;
const IP_BLOCK_TTL_SECONDS = 3600;

@Injectable()
export class SuspiciousLoginService {
  private readonly logger = Logger.getLogger(APP_NAME, SuspiciousLoginService.name);
  private readonly db: PrimaryDatabase;
  private readonly redis: Redis;

  /** Failed logins from one IP within the window before it is temp-blocked. */
  ipFailureThreshold = 30;

  constructor(
    databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly userEmailService: UserEmailService,
    private readonly rateLimiter: RateLimiterService,
  ) {
    this.db = databaseService.getPostgresClient();
    this.redis = databaseService.getRedisClient();
  }

  /**
   * Runs before the sign-in event and session are recorded, so "previously seen" reflects only
   * genuinely prior logins. First-ever logins never alert — everything is new then.
   */
  async assessLogin(userId: bigint, device: DeviceContext): Promise<void> {
    const priorSuccess = await this.db.query.userSignInEvents.findFirst({
      where: and(eq(schema.userSignInEvents.userId, userId), eq(schema.userSignInEvents.status, 'SUCCESS')),
    });
    if (!priorSuccess) return;

    const newDevice = device.fingerprint ? !(await this.isKnownDevice(userId, device.fingerprint)) : false;
    const newIp = device.ipAddress ? !(await this.isKnownIp(userId, device.ipAddress)) : false;
    if (!newDevice && !newIp) return;

    this.logger.warn('Login from unseen device or ip', { securityEvent: 'security.new_device_login', userId, newDevice, newIp });
    await this.auditService.record({
      action: 'security.new_device_login',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: userId.toString(),
      ipAddress: device.ipAddress,
      detail: { newDevice, newIp },
    });

    const email = await this.userEmailService.getPrimaryEmail(userId);
    if (!email) return;
    await this.notificationService.enqueue({
      templateKey: NEW_SIGNIN_TEMPLATE,
      recipients: { email },
      payload: { ipAddress: device.ipAddress ?? 'unknown', userAgent: device.userAgent ?? 'unknown', time: new Date().toISOString() },
    });
  }

  /** Correlates failed logins per source IP across accounts; a burst temp-blocks the IP (Tier-1). */
  async recordFailure(ip: string): Promise<void> {
    const key = `rl:ipfail:${ip}`;
    const results = await this.redis.multi().incr(key).call('EXPIRE', key, IP_FAILURE_WINDOW_SECONDS, 'NX').exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    if (count !== this.ipFailureThreshold) return;

    await this.rateLimiter.blockIp(ip, IP_BLOCK_TTL_SECONDS);
    await this.auditService.record({
      action: 'security.ip_blocked',
      outcome: 'SUCCESS',
      actorType: 'SYSTEM',
      actorId: null,
      ipAddress: ip,
      detail: { failures: count, windowSeconds: IP_FAILURE_WINDOW_SECONDS, blockTtlSeconds: IP_BLOCK_TTL_SECONDS },
    });
  }

  private async isKnownDevice(userId: bigint, fingerprint: string): Promise<boolean> {
    const fingerprintHash = createHash('sha256').update(fingerprint).digest('hex');
    const device = await this.db.query.devices.findFirst({ where: and(eq(schema.devices.userId, userId), eq(schema.devices.fingerprintHash, fingerprintHash)) });
    return Boolean(device);
  }

  private async isKnownIp(userId: bigint, ip: string): Promise<boolean> {
    const event = await this.db.query.userSignInEvents.findFirst({
      where: and(eq(schema.userSignInEvents.userId, userId), eq(schema.userSignInEvents.status, 'SUCCESS'), eq(schema.userSignInEvents.ipAddress, ip)),
    });
    return Boolean(event);
  }
}
