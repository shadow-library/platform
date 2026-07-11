/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { PASSWORD_PARAMS_VERSION, PasswordPolicyService, PasswordService } from '@server/modules/identity/credentials';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('password').init();

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = env.getService(PasswordService);
  });

  it('should hash with the pinned argon2id parameters and version', async () => {
    const { hash, version } = await service.hash('Password@123');
    expect(hash).toStartWith('$argon2id$');
    expect(version).toBe(PASSWORD_PARAMS_VERSION);
  });

  it('should verify a correct password and reject a wrong one', async () => {
    const stored = await service.hash('Password@123');
    expect((await service.verify('Password@123', stored)).valid).toBe(true);
    expect((await service.verify('WrongPassword@1', stored)).valid).toBe(false);
  });

  it('should flag a stale parameter version for rehash', async () => {
    const { hash } = await service.hash('Password@123');
    const result = await service.verify('Password@123', { hash, version: PASSWORD_PARAMS_VERSION - 1 });
    expect(result).toEqual({ valid: true, needsRehash: true });
  });

  it('should detect reuse against recorded history and keep only the recent entries', async () => {
    const user = await env.getService(UserService).createUserWithPassword({ email: 'history@example.com', password: 'Password@123' });

    expect(await service.isReused(user.id, 'Password@123')).toBe(true);
    expect(await service.isReused(user.id, 'Different@456')).toBe(false);

    for (let index = 0; index < 6; index++) {
      const { hash } = await service.hash(`Rotated@${index}00`);
      await service.recordHistory(user.id, hash);
    }

    const entries = await env.getPostgresClient().select().from(schema.passwordHistory).where(eq(schema.passwordHistory.userId, user.id));
    expect(entries).toHaveLength(5);
    expect(await service.isReused(user.id, 'Password@123')).toBe(false);
    expect(await service.isReused(user.id, 'Rotated@500')).toBe(true);
  });
});

describe('PasswordPolicyService', () => {
  let policy: PasswordPolicyService;

  beforeEach(() => {
    policy = env.getService(PasswordPolicyService);
  });

  it('should accept a strong password and reject weak ones', () => {
    expect(() => policy.assertStrong('Password@123')).not.toThrow();
    expect(() => policy.assertStrong('weak')).toThrow();
    expect(() => policy.assertStrong('a'.repeat(200))).toThrow();
  });

  it('should treat passwords as unbreached when the check is disabled', async () => {
    expect(await policy.isBreached('password')).toBe(false);
  });
});
