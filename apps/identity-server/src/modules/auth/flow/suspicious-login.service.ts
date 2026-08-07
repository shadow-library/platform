import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { UserEmailService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';
import { RateLimiterService } from '@server/modules/infrastructure/security';

import { DeviceContext } from './auth-flow.service';

const NEW_SIGNIN_TEMPLATE = 'security.new-signin';
const IP_FAILURE_WINDOW_SECONDS = 900;
const IP_BLOCK_TTL_SECONDS = 3600;

@Injectable()
export class SuspiciousLoginService {
  private readonly logger = Logger.getLogger(APP_NAME, SuspiciousLoginService.name);
  private readonly db: PrimaryDatabase;
  private readonly redis: Redis;

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
