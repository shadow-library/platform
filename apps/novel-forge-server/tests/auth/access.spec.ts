import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';

import { ADMIN_PERMISSION, PROJECTS_READ_PERMISSION } from '@server/constants';
import { TestEnvironment } from '@tests/test-environment';
import { AUTH_AUDIENCE, issueTestBotKey, TEST_ORG, TEST_USER, testIdP } from '@tests/test-idp';

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge');
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

testIdP.grantPermission({ kind: 'user', sub: TEST_USER.userId }, TEST_ORG, ADMIN_PERMISSION);

const NON_ADMIN_SUB = '9102';
const nonAdminToken = await testIdP.issueToken({ sub: NON_ADMIN_SUB, audience: AUTH_AUDIENCE, org: TEST_ORG });
const orglessToken = await testIdP.issueToken({ sub: TEST_USER.userId, audience: AUTH_AUDIENCE });
const botKey = issueTestBotKey('301', [PROJECTS_READ_PERMISSION, ADMIN_PERMISSION]);

const testEnv = new TestEnvironment('access_test');

describe.if(pgAvailable)('GET /api/v1/access', () => {
  testEnv.init();

  const as = (token: string) =>
    testEnv
      .getRouter({ authenticated: false })
      .mockRequest()
      .headers({ authorization: `Bearer ${token}` });

  it('should report admin for a caller granted the admin permission', async () => {
    const response = await testEnv.getRouter().mockRequest().get('/api/v1/access');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ admin: true });
  });

  it('should report no admin for a caller without the grant', async () => {
    const response = await as(nonAdminToken).get('/api/v1/access');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ admin: false });
  });

  it('should report no admin for a credential that names no organisation', async () => {
    const response = await as(orglessToken).get('/api/v1/access');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ admin: false });
  });

  it('should refuse a bot even when it holds the admin permission', async () => {
    const response = await as(botKey).get('/api/v1/access');
    expect(response.statusCode).toBe(403);
  });

  it('should refuse an anonymous caller', async () => {
    const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/v1/access');
    expect(response.statusCode).toBe(401);
  });
});
