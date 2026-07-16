/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { AppError, ValidationError } from '@shadow-library/common';
import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { CreateUser, UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('user-service').init();

const buildUser = (overrides: Partial<CreateUser> = {}): CreateUser => ({
  email: 'user@example.com',
  emailVerified: true,
  phoneVerified: true,
  password: 'Password@123',
  firstName: 'Test',
  lastName: 'User',
  ...overrides,
});

const rejection = <T>(promise: Promise<T>): Promise<any> =>
  promise.then(
    () => {
      throw new Error('expected the promise to reject');
    },
    error => error,
  );

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    service = env.getService(UserService);
  });

  describe('createUserWithPassword', () => {
    it('should create a user with profile, email and password identity', async () => {
      const user = await service.createUserWithPassword(buildUser({ email: 'alice@example.com', phoneNumber: '+14155550001' }));
      expect(user.id).toBeDefined();
      expect(user.emails).toHaveLength(1);
      expect(user.emails[0]?.emailId).toBe('alice@example.com');
      expect(user.emails[0]?.isPrimary).toBe(true);
      expect(user.phones).toHaveLength(1);
      expect(user.authIdentities[0]?.provider).toBe('PASSWORD');
      expect(user.profile?.firstName).toBe('Test');
    });

    it('should lowercase the email before storing', async () => {
      const user = await service.createUserWithPassword(buildUser({ email: 'MixedCase@Example.com' }));
      expect(user.emails[0]?.emailId).toBe('mixedcase@example.com');
    });

    it.each([
      ['email', buildUser({ email: 'not-an-email' })],
      ['password', buildUser({ password: 'weak' })],
      ['phoneNumber', buildUser({ phoneNumber: 'not-a-phone' })],
      ['username', buildUser({ username: 'no' })],
    ])('should reject an invalid %s', async (field, data) => {
      const error = await rejection(service.createUserWithPassword(data));
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.getErrors()[0]?.field).toBe(field);
    });

    it('should reject an under-age date of birth', async () => {
      const dateOfBirth = new Date();
      dateOfBirth.setFullYear(dateOfBirth.getFullYear() - 10);
      const error = await rejection(service.createUserWithPassword(buildUser({ dateOfBirth })));
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.getErrors()[0]?.field).toBe('dateOfBirth');
    });

    it('should reject a duplicate email with a conflict error', async () => {
      await service.createUserWithPassword(buildUser({ email: 'dup@example.com' }));
      const error = await rejection(service.createUserWithPassword(buildUser({ email: 'dup@example.com' })));
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('USR_003');
    });
  });

  describe('getUser', () => {
    it('should resolve the correct user by email, not the first row (regression: T-001)', async () => {
      const alice = await service.createUserWithPassword(buildUser({ email: 'alice@example.com' }));
      const bob = await service.createUserWithPassword(buildUser({ email: 'bob@example.com' }));

      const found = await service.getUser('bob@example.com');
      expect(found?.id).toBe(bob.id);
      expect(found?.id).not.toBe(alice.id);
    });

    it('should resolve the correct user by phone number', async () => {
      await service.createUserWithPassword(buildUser({ email: 'alice@example.com', phoneNumber: '+14155550001' }));
      const bob = await service.createUserWithPassword(buildUser({ email: 'bob@example.com', phoneNumber: '+14155550002' }));

      const found = await service.getUser('+14155550002');
      expect(found?.id).toBe(bob.id);
    });

    it('should resolve by username and by id', async () => {
      const user = await service.createUserWithPassword(buildUser({ email: 'named@example.com', username: 'named.user' }));
      expect((await service.getUser('named.user'))?.id).toBe(user.id);
      expect((await service.getUser(user.id))?.id).toBe(user.id);
    });

    it('should return null for an unknown identifier', async () => {
      await service.createUserWithPassword(buildUser({ email: 'only@example.com' }));
      expect(await service.getUser('ghost@example.com')).toBeNull();
    });
  });

  describe('updateUserStatus', () => {
    it('should update exactly one user by email, not the whole table (regression: T-002)', async () => {
      await service.createUserWithPassword(buildUser({ email: 'alice@example.com' }));
      const bob = await service.createUserWithPassword(buildUser({ email: 'bob@example.com' }));
      await service.createUserWithPassword(buildUser({ email: 'carol@example.com' }));

      await service.updateUserStatus('bob@example.com', 'BLOCKED');

      const blocked = await env.getPostgresClient().select().from(schema.users).where(eq(schema.users.status, 'BLOCKED'));
      expect(blocked).toHaveLength(1);
      expect(blocked[0]?.id).toBe(bob.id);
    });

    it('should throw a not-found error for an unknown identifier', async () => {
      const error = await rejection(service.updateUserStatus('ghost@example.com', 'BLOCKED'));
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('USR_001');
    });
  });
});
