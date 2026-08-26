import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';

import { TestEnvironment } from '@tests/test-environment';

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

const testEnv = new TestEnvironment('context_preview_api');

describe.if(pgAvailable)('GET /api/v1/projects/:projectId/context/preview', () => {
  testEnv.init();

  async function createProject(): Promise<string> {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/projects')
      .body({ name: `context-preview-${Math.random()}`, kind: 'new_novel' });
    return response.json().id as string;
  }

  it('should reject an unknown scopeType with a validation failure', async () => {
    const projectId = await createProject();
    const response = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/context/preview?purpose=chat&scopeType=nonsense`);
    expect(response.statusCode).toBe(422);
  });

  it('should report IDE_005 for the ideation scope, which the studio owns exclusively', async () => {
    const projectId = await createProject();
    const response = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/context/preview?purpose=chat&scopeType=ideation`);
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('IDE_005');
  });
});
