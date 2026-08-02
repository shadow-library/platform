/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationAccessService, ApplicationMemberService, ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

interface LauncherItem {
  id: number;
  name: string;
  isActive: boolean;
  lastUsedAt?: string;
  firstUsedAt?: string;
}

/**
 * Declaring the constants
 */
const env = new TestEnvironment('launcher').init();

describe('My applications launcher', () => {
  let db: PrimaryDatabase;
  let userId: bigint;
  let secret: string;
  let seq = 0;

  const uniq = (prefix: string): string => `${prefix}-${Date.now()}-${seq++}`;

  const createApp = async (visibility: 'PUBLIC' | 'RESTRICTED' | 'INTERNAL'): Promise<number> => {
    const name = uniq('app');
    return (await env.getService(ApplicationService).createApplication({ name, subDomain: name, visibility })).id;
  };

  const launcher = async (): Promise<LauncherItem[]> => {
    const csrf = csrfPair();
    const response = await env
      .getRouter()
      .mockRequest()
      .get('/api/v1/me/applications')
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });
    expect(response.statusCode).toBe(200);
    return (response.json() as { applications: LauncherItem[] }).applications;
  };

  beforeEach(async () => {
    db = env.getPostgresClient();
    await env.getRedisClient().flushdb();
    const user = await env
      .getService(UserService)
      .createUserWithPassword({ email: uniq('user') + '@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    userId = user.id;
    secret = (await env.getService(SessionService).create({ userId, aal: 'AAL1' })).secret;
  });

  it('should list an accessible-but-never-used PUBLIC app without usage timestamps', async () => {
    const publicApp = await createApp('PUBLIC');
    const items = await launcher();
    const entry = items.find(item => item.id === publicApp);
    expect(entry).toBeDefined();
    expect(entry?.lastUsedAt).toBeUndefined();
    expect(entry?.firstUsedAt).toBeUndefined();
  });

  it('should carry usage timestamps once the app has been opened', async () => {
    const publicApp = await createApp('PUBLIC');
    await env.getService(ApplicationMemberService).ensureMembership(publicApp, userId);
    const entry = (await launcher()).find(item => item.id === publicApp);
    expect(entry?.lastUsedAt).toBeString();
    expect(entry?.firstUsedAt).toBeString();
  });

  it('should never surface a RESTRICTED app the personal workspace cannot reach', async () => {
    const restricted = await createApp('RESTRICTED');
    const items = await launcher();
    expect(items.some(item => item.id === restricted)).toBe(false);
  });

  it('should never surface the identity application itself', async () => {
    const identity = env.getService(ApplicationService).getApplicationOrThrow(APP_NAME);
    const items = await launcher();
    expect(items.some(item => item.id === identity.id)).toBe(false);
    expect(items.some(item => item.name === APP_NAME)).toBe(false);
  });

  /** Guards the exclusion against being pushed down into the access resolver, which also gates sign-in. */
  it('should still resolve the identity application as accessible even though the launcher hides it', async () => {
    const identity = env.getService(ApplicationService).getApplicationOrThrow(APP_NAME);
    const grants = await env.getService(ApplicationAccessService).resolveAccessibleApplicationIds(userId);
    expect(grants.has(identity.id)).toBe(true);
    await expect(env.getService(ApplicationAccessService).assertUserAccess(userId, identity.id)).resolves.toBeUndefined();
  });

  it('should keep listing other applications once identity is filtered out', async () => {
    const publicApp = await createApp('PUBLIC');
    const items = await launcher();
    expect(items.some(item => item.id === publicApp)).toBe(true);
  });

  it('should drop an app the user used but can no longer reach', async () => {
    const access = env.getService(ApplicationAccessService);
    const [team] = await db
      .insert(schema.organisations)
      .values({ name: uniq('Team'), slug: uniq('slug'), type: 'TEAM', status: 'ACTIVE' })
      .returning({ id: schema.organisations.id });
    await db.insert(schema.organisationMembers).values({ organisationId: team!.id, userId, role: 'MEMBER' });
    const restricted = await createApp('RESTRICTED');
    await db.insert(schema.organisationApplications).values({ organisationId: team!.id, applicationId: restricted, source: 'PLATFORM_RELEASE' });
    await access.invalidateOrganisation(team!.id.toString());
    await env.getService(ApplicationMemberService).ensureMembership(restricted, userId);

    expect((await launcher()).some(item => item.id === restricted)).toBe(true);

    /** Revoking the release makes a used app unreachable everywhere; the launcher must stop advertising it (D-A4). */
    await db
      .delete(schema.organisationApplications)
      .where(and(eq(schema.organisationApplications.organisationId, team!.id), eq(schema.organisationApplications.applicationId, restricted)));
    await access.invalidateOrganisation(team!.id.toString());
    expect((await launcher()).some(item => item.id === restricted)).toBe(false);
  });
});
