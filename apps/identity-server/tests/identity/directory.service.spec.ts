import { beforeEach, describe, expect, it } from 'bun:test';

import { DirectoryService } from '@server/modules/identity/directory';
import { type CreateUser, UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';

import { TestEnvironment } from '../test-environment';

const env = new TestEnvironment('directory').init();

const CALLER = 'novel-forge';
const OTHER_CALLER = 'web-novel';

const buildUser = (email: string, overrides: Partial<CreateUser> = {}): CreateUser => ({
  email,
  password: 'Password@123',
  firstName: 'Ada',
  lastName: 'Lovelace',
  displayName: 'Ada',
  status: 'ACTIVE',
  emailVerified: true,
  ...overrides,
});

describe('DirectoryService', () => {
  let directory: DirectoryService;
  let users: UserService;

  beforeEach(() => {
    directory = env.getService(DirectoryService);
    users = env.getService(UserService);
  });

  const grantConsent = (userId: bigint, clientId: string, revokedAt: Date | null = null) =>
    env
      .getPostgresClient()
      .insert(schema.consents)
      .values({ userId, clientId, scopeNames: ['openid'], source: 'FIRST_PARTY_POLICY', revokedAt });

  describe('lookupByUserId', () => {
    it('should return a name to a caller the user has consented to', async () => {
      const user = await users.createUserWithPassword(buildUser('consented@example.com'));
      await grantConsent(user.id, CALLER);

      const [resolved] = await directory.lookupByUserId([user.id.toString()], CALLER);
      expect(resolved).toEqual({ userId: user.id.toString(), displayName: 'Ada', firstName: 'Ada', lastName: 'Lovelace' });
    });

    it('should omit an existing user the caller has no relationship with — absent, never an error', async () => {
      const stranger = await users.createUserWithPassword(buildUser('stranger@example.com'));

      await expect(directory.lookupByUserId([stranger.id.toString()], CALLER)).resolves.toEqual([]);
    });

    it('should scope names per caller so one app cannot harvest another app users', async () => {
      const user = await users.createUserWithPassword(buildUser('owned-by-other@example.com', { firstName: 'Grace', lastName: 'Hopper' }));
      await grantConsent(user.id, OTHER_CALLER);

      expect(await directory.lookupByUserId([user.id.toString()], CALLER)).toEqual([]);
      const [seenByOwner] = await directory.lookupByUserId([user.id.toString()], OTHER_CALLER);
      expect(seenByOwner).toMatchObject({ userId: user.id.toString(), firstName: 'Grace', lastName: 'Hopper' });
    });

    it('should omit a user whose consent to the caller was revoked', async () => {
      const user = await users.createUserWithPassword(buildUser('revoked@example.com'));
      await grantConsent(user.id, CALLER, new Date());

      await expect(directory.lookupByUserId([user.id.toString()], CALLER)).resolves.toEqual([]);
    });
  });

  describe('resolveByEmail', () => {
    it('should resolve an exact verified email to {userId, email} with no relationship and no name', async () => {
      const invitee = await users.createUserWithPassword(buildUser('invitee@example.com'));

      await expect(directory.resolveByEmail(['invitee@example.com'], CALLER)).resolves.toEqual([{ userId: invitee.id.toString(), email: 'invitee@example.com' }]);
    });

    it('should leave an email-invited user without consent absent from lookupByUserId so the app falls back to the email', async () => {
      const invitee = await users.createUserWithPassword(buildUser('pending@example.com'));

      const [byEmail] = await directory.resolveByEmail(['pending@example.com'], CALLER);
      expect(byEmail?.userId).toBe(invitee.id.toString());
      await expect(directory.lookupByUserId([invitee.id.toString()], CALLER)).resolves.toEqual([]);
    });
  });
});
