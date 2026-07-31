/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { ConsentService, OAuthClientService } from '@server/modules/auth/oauth';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { ApplicationMemberService, ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('application-membership').init();

describe('Application membership provisioning', () => {
  let platformAppId: number;

  const uniqueEmail = (prefix: string): string => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

  const newUser = (prefix: string) =>
    env.getService(UserService).createUserWithPassword({ email: uniqueEmail(prefix), password: 'Password@123', status: 'ACTIVE', emailVerified: true });

  const registerClient = async (): Promise<string> => {
    const client = await env
      .getService(OAuthClientService)
      .register({ applicationId: platformAppId, name: 'Test SPA', kind: 'SPA_PUBLIC', grantTypes: ['authorization_code'], redirectUris: ['https://app.example.com/cb'] });
    return client.clientId;
  };

  beforeEach(() => {
    platformAppId = env.getService(ApplicationService).getApplicationOrThrow(APP_NAME).id;
  });

  it('provisions a membership on the first consent grant', async () => {
    const user = await newUser('member');
    const clientId = await registerClient();
    const members = env.getService(ApplicationMemberService);

    expect(await members.getMembership(platformAppId, user.id)).toBeNull();
    await env.getService(ConsentService).record(user.id, clientId, ['openid'], 'USER');

    expect(await members.getMembership(platformAppId, user.id)).not.toBeNull();
    expect((await members.listApplicationsForUser(user.id)).map(app => app.id)).toContain(platformAppId);
  });

  it('is idempotent — a repeat grant refreshes rather than duplicates', async () => {
    const user = await newUser('idem');
    const members = env.getService(ApplicationMemberService);

    await members.ensureMembership(platformAppId, user.id);
    const first = await members.getMembership(platformAppId, user.id);
    await members.ensureMembership(platformAppId, user.id);
    const second = await members.getMembership(platformAppId, user.id);

    expect((await members.listApplicationsForUser(user.id)).filter(app => app.id === platformAppId)).toHaveLength(1);
    expect(second?.firstUsedAt.getTime()).toBe(first?.firstUsedAt.getTime());
    expect(second?.lastUsedAt.getTime()).toBeGreaterThanOrEqual(first?.lastUsedAt.getTime() ?? 0);
  });

  it("lists the user's applications through the self-service endpoint", async () => {
    const user = await newUser('me');
    await env.getService(ApplicationMemberService).ensureMembership(platformAppId, user.id);
    const { secret } = await env.getService(SessionService).create({ userId: user.id, aal: 'AAL1' });

    const csrf = csrfPair();
    const response = await env
      .getRouter()
      .mockRequest()
      .get('/api/v1/me/applications')
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });

    expect(response.statusCode).toBe(200);
    const apps = (response.json() as { applications: { id: number; name: string }[] }).applications;
    expect(apps.map(app => app.name)).toContain(APP_NAME);
  });

  it('requires authentication for the self-service endpoint', async () => {
    const response = await env.getRouter().mockRequest().get('/api/v1/me/applications');
    expect(response.statusCode).toBe(401);
  });
});
