/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('session').init();

describe('SessionService', () => {
  let service: SessionService;
  let userId: bigint;

  beforeEach(async () => {
    service = env.getService(SessionService);
    const user = await env.getService(UserService).createUserWithPassword({ email: 'session@example.com', password: 'Password@123' });
    userId = user.id;
  });

  it('should create a session and validate its secret', async () => {
    const { secret, session, cookies } = await service.create({ userId, aal: 'AAL2' });

    expect(session.status).toBe('ACTIVE');
    expect(session.aal).toBe('AAL2');

    const cookie = cookies.find(c => c.name === SESSION_COOKIE_NAME);
    expect(cookie?.options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });

    const validated = await service.validate(secret);
    expect(validated?.id).toBe(session.id);
    expect(validated?.aal).toBe('AAL2');
  });

  it('should reject an unknown or malformed secret', async () => {
    expect(await service.validate('not-a-real-secret')).toBeNull();
  });

  it('should register and reuse a device by fingerprint', async () => {
    await service.create({ userId, deviceFingerprint: 'device-abc', deviceName: 'Chrome on macOS' });
    await service.create({ userId, deviceFingerprint: 'device-abc' });

    const devices = await env.getPostgresClient().select().from(schema.devices).where(eq(schema.devices.userId, userId));
    expect(devices).toHaveLength(1);
  });

  it('should invalidate a session immediately on revoke', async () => {
    const { secret, session } = await service.create({ userId });
    await service.revoke(session.id);
    expect(await service.validate(secret)).toBeNull();
  });

  it('should terminate all sessions except the current one', async () => {
    const keep = await service.create({ userId });
    const drop = await service.create({ userId });

    await service.terminateAllForUser(userId, keep.session.id);

    expect(await service.validate(keep.secret)).not.toBeNull();
    expect(await service.validate(drop.secret)).toBeNull();
  });

  it('should reflect step-up elevation', async () => {
    const { secret, session } = await service.create({ userId });
    const before = await service.validate(secret);
    expect(before && service.isElevated(before)).toBe(false);

    await service.elevate(session.id);
    await env.getRedisClient().flushdb();

    const after = await service.validate(secret);
    expect(after && service.isElevated(after)).toBe(true);
  });

  it('should reject a session past its absolute expiry', async () => {
    const { secret, session } = await service.create({ userId });
    await env
      .getPostgresClient()
      .update(schema.userSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.userSessions.id, session.id));
    await env.getRedisClient().flushdb();

    expect(await service.validate(secret)).toBeNull();
    const [row] = await env.getPostgresClient().select().from(schema.userSessions).where(eq(schema.userSessions.id, session.id));
    expect(row?.status).toBe('EXPIRED');
  });

  it('should reject a session past its idle timeout', async () => {
    const { secret, session } = await service.create({ userId });
    const staleLastUsed = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await env.getPostgresClient().update(schema.userSessions).set({ lastUsedAt: staleLastUsed }).where(eq(schema.userSessions.id, session.id));
    await env.getRedisClient().flushdb();

    expect(await service.validate(secret)).toBeNull();
  });
});
