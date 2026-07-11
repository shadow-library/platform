/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { OrganisationService } from '@server/modules/identity/organisation';
import { CreateUser, UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('organisation').init();

const rejection = <T>(promise: Promise<T>): Promise<any> =>
  promise.then(
    () => ({}),
    error => error,
  );
const buildUser = (email: string): CreateUser => ({ email, password: 'Password@123', firstName: 'Test', lastName: 'User', status: 'ACTIVE' });
const orgId = (value: bigint | null): bigint => {
  if (value === null) throw new Error('expected a personal organisation id');
  return value;
};

describe('Tenancy', () => {
  let orgs: OrganisationService;
  let users: UserService;

  beforeEach(() => {
    orgs = env.getService(OrganisationService);
    users = env.getService(UserService);
  });

  it('should create a personal workspace with an owner membership for every user', async () => {
    const user = await users.createUserWithPassword(buildUser('owner@example.com'));
    const organisationId = orgId(user.personalOrganisationId);

    const organisation = await orgs.getById(organisationId);
    expect(organisation?.type).toBe('PERSONAL');

    const membership = await orgs.getMembership(user.id, organisationId);
    expect(membership?.role).toBe('OWNER');
    expect(membership?.isDefault).toBe(true);
  });

  it('should list members only to a caller that belongs to the organisation (isolation harness)', async () => {
    const alice = await users.createUserWithPassword(buildUser('alice@example.com'));
    const bob = await users.createUserWithPassword(buildUser('bob@example.com'));
    const aliceOrg = orgId(alice.personalOrganisationId);
    const bobOrg = orgId(bob.personalOrganisationId);
    expect(aliceOrg).not.toBe(bobOrg);

    const own = await orgs.listMembers(alice.id, aliceOrg);
    expect(own.map(member => member.userId)).toEqual([alice.id]);

    const crossTenant = await rejection(orgs.listMembers(alice.id, bobOrg));
    expect(crossTenant.getCode?.()).toBe('ORG_001');
  });

  it('should deny membership assertions across tenants', async () => {
    const alice = await users.createUserWithPassword(buildUser('a2@example.com'));
    const bob = await users.createUserWithPassword(buildUser('b2@example.com'));

    await expect(orgs.assertMember(alice.id, orgId(alice.personalOrganisationId))).resolves.toBeDefined();
    const denied = await rejection(orgs.assertMember(alice.id, orgId(bob.personalOrganisationId)));
    expect(denied.getCode?.()).toBe('ORG_001');
  });

  it('should roll back the personal workspace when user creation fails', async () => {
    await users.createUserWithPassword(buildUser('dup@example.com'));
    const before = await env.getPostgresClient().select().from(schema.organisations);

    await rejection(users.createUserWithPassword(buildUser('dup@example.com')));

    const after = await env.getPostgresClient().select().from(schema.organisations);
    expect(after.length).toBe(before.length);
  });
});
