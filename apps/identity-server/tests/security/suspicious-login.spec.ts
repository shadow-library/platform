/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { desc, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { SuspiciousLoginService } from '@server/modules/auth/flow';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { RateLimiterService } from '@server/modules/infrastructure/security';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('suspicious_login').init();
const EMAIL = 'watcher@example.com';
const PASSWORD = 'Password@123';

const login = async (deviceId: string, ip: string, password = PASSWORD) => {
  const init = await env.getRouter().mockRequest({ method: 'POST', url: '/api/v1/auth/login/init', remoteAddress: ip, payload: { identifier: EMAIL, deviceId } });
  const { flowId } = init.json() as { flowId: string };
  return env.getRouter().mockRequest({ method: 'POST', url: '/api/v1/auth/challenge/verify', remoteAddress: ip, payload: { flowId, password } });
};

const alertsFor = async (email: string): Promise<number> => {
  const rows = await env.getPostgresClient().select().from(schema.notificationOutbox);
  return rows.filter(entry => entry.templateKey === 'security.new-signin' && entry.recipients.email === email).length;
};

const latestAudit = async (action: string) => {
  const rows = await env.getPostgresClient().select().from(schema.auditEvents).where(eq(schema.auditEvents.action, action)).orderBy(desc(schema.auditEvents.occurredAt));
  return rows[0];
};

describe('Suspicious login detection', () => {
  beforeEach(async () => {
    await env.getService(UserService).createUserWithPassword({ email: EMAIL, password: PASSWORD, status: 'ACTIVE', emailVerified: true });
    const keys = await env.getRedisClient().keys('rl:*');
    if (keys.length > 0) await env.getRedisClient().del(...keys);
  });

  it('should stay quiet on the first login and on repeat device/ip logins', async () => {
    expect((await login('device-a', '10.5.0.1')).statusCode).toBe(200);
    expect(await alertsFor(EMAIL)).toBe(0);

    expect((await login('device-a', '10.5.0.1')).statusCode).toBe(200);
    expect(await alertsFor(EMAIL)).toBe(0);
  });

  it('should alert and audit when a known account signs in from a new device and ip', async () => {
    await login('device-a', '10.5.0.1');
    expect((await login('device-b', '10.5.0.2')).statusCode).toBe(200);

    expect(await alertsFor(EMAIL)).toBe(1);
    const audit = await latestAudit('security.new_device_login');
    expect(audit).toBeDefined();
    expect(audit?.detail).toMatchObject({ newDevice: true, newIp: true });
  });

  it('should alert on a new ip even when the device is known', async () => {
    await login('device-a', '10.5.0.1');
    await login('device-a', '10.5.0.9');
    const audit = await latestAudit('security.new_device_login');
    expect(audit?.detail).toMatchObject({ newDevice: false, newIp: true });
  });

  it('should temp-block an ip after correlated failures across accounts', async () => {
    const service = env.getService(SuspiciousLoginService);
    service.ipFailureThreshold = 3;
    const attackerIp = '10.5.6.6';

    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await login(`probe-${attempt}`, attackerIp, 'Wrong@Password1');
      expect(response.statusCode).toBe(401);
    }

    expect(await env.getService(RateLimiterService).getIpBlockTtl(attackerIp)).toBeGreaterThan(0);
    const audit = await latestAudit('security.ip_blocked');
    expect(audit).toBeDefined();
    expect(audit?.ipAddress).toBe(attackerIp);

    /** With rate limiting active, the blocked IP is refused at the door. */
    const limiter = env.getService(RateLimiterService);
    limiter.enabled = true;
    const refused = await env.getRouter().mockRequest({ method: 'POST', url: '/api/v1/auth/login/init', remoteAddress: attackerIp, payload: { identifier: EMAIL } });
    expect(refused.statusCode).toBe(429);
    limiter.enabled = false;
    service.ipFailureThreshold = 30;
  });
});
