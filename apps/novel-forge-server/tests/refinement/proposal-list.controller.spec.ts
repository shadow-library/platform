import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';

import { schema } from '@server/database';
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

const testEnv = new TestEnvironment('proposal_list_api');

describe.if(pgAvailable)('GET /api/v1/projects/:projectId/proposals', () => {
  testEnv.init();

  it('should list only the proposals with an operation aimed at the requested chapter', async () => {
    const router = testEnv.getRouter();
    const projectId = (
      await router
        .mockRequest()
        .post('/api/v1/projects')
        .body({ name: `proposal-list-${Math.random()}`, kind: 'new_novel' })
    ).json().id as string;
    const db = testEnv.getPostgresClient();
    await db.insert(schema.refinementProposals).values([
      { projectId: BigInt(projectId), scopeType: 'project', kind: 'hub', changeSet: [{ op: 'brief.update', chapter: 4, body: 'Purpose: arrive.' }], baseline: {} },
      { projectId: BigInt(projectId), scopeType: 'project', kind: 'hub', changeSet: [{ op: 'brief.update', chapter: 14, body: 'Purpose: leave.' }], baseline: {} },
      { projectId: BigInt(projectId), scopeType: 'project', kind: 'hub', changeSet: [{ op: 'premise.update', premise: 'A tide city.' }], baseline: {} },
    ]);

    const response = await router.mockRequest().get(`/api/v1/projects/${projectId}/proposals?status=pending&chapter=4`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 1, items: [{ changeSet: [{ op: 'brief.update', chapter: 4 }], warnings: [] }] });
  });
});
