import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';

import { ADMIN_PERMISSION } from '@server/constants';
import { schema } from '@server/database';
import { TestEnvironment } from '@tests/test-environment';
import { AUTH_AUDIENCE, TEST_ORG, TEST_USER, testIdP } from '@tests/test-idp';

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

/** The admin scope is granted to the default test principal for this file only — a fresh module instance per spec file keeps it from leaking into other suites. */
testIdP.grantPermission({ kind: 'user', sub: TEST_USER.userId }, TEST_ORG, ADMIN_PERMISSION);

/** Owns its own projects and never receives the admin grant, so a 403 here is unambiguously the permission gate rather than the ownership 404. */
const NON_ADMIN_SUB = '9101';
const nonAdminToken = await testIdP.issueToken({ sub: NON_ADMIN_SUB, audience: AUTH_AUDIENCE, org: TEST_ORG });

const testEnv = new TestEnvironment('run_admin_gate');

describe.if(pgAvailable)('Run inspection admin gate (N1)', () => {
  testEnv.init();

  async function seedRun(ownerId: string): Promise<{ projectId: bigint; runId: string; callId: bigint }> {
    const db = testEnv.getPostgresClient();
    const [project] = await db
      .insert(schema.projects)
      .values({ ownerKind: 'user', ownerId: BigInt(ownerId), name: `run-admin-gate-${Math.random()}`, kind: 'new_novel', premise: 'a story' })
      .returning();
    if (!project) throw new Error('failed to seed project');

    const [pack] = await db
      .insert(schema.contextPacks)
      .values({ projectId: project.id, purpose: 'chat_hub', hash: `admin-gate-${Math.random()}`, budgetTokens: 1000, usedTokens: 500, sections: [], rendered: 'RENDERED' })
      .returning();
    if (!pack) throw new Error('failed to seed pack');

    const [run] = await db
      .insert(schema.workflowRuns)
      .values({ projectId: project.id, graph: 'chat-turn', target: 'session:x', status: 'completed', input: { content: 'x' } as never, contextPackId: pack.id })
      .returning();
    if (!run) throw new Error('failed to seed run');

    const [call] = await db
      .insert(schema.modelCalls)
      .values({
        projectId: project.id,
        runId: run.id,
        node: 'chat-turn',
        role: 'chat',
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        promptKey: 'chat-refine',
        promptVersion: '2.0.0',
        status: 'ok',
        inputTokens: 10,
        outputTokens: 10,
        latencyMs: 100,
        attempt: 0,
        rawOutput: '{"reply":"secret"}',
      })
      .returning();
    if (!call) throw new Error('failed to seed model call');

    return { projectId: project.id, runId: run.id, callId: call.id };
  }

  const asNonAdmin = () =>
    testEnv
      .getRouter({ authenticated: false })
      .mockRequest()
      .headers({ authorization: `Bearer ${nonAdminToken}` });

  it('should refuse a non-admin author reading a run detail on their own project', async () => {
    const { projectId, runId } = await seedRun(NON_ADMIN_SUB);
    const response = await asNonAdmin().get(`/api/v1/projects/${projectId}/runs/${runId}`);
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('IAM_002');
  });

  it('should refuse a non-admin author reading a run call', async () => {
    const { projectId, runId, callId } = await seedRun(NON_ADMIN_SUB);
    const response = await asNonAdmin().get(`/api/v1/projects/${projectId}/runs/${runId}/calls/${callId}`);
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('IAM_002');
  });

  it('should refuse a non-admin author reading a run context', async () => {
    const { projectId, runId } = await seedRun(NON_ADMIN_SUB);
    const response = await asNonAdmin().get(`/api/v1/projects/${projectId}/runs/${runId}/context`);
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('IAM_002');
  });

  it('should admit an admin to a run detail', async () => {
    const { projectId, runId } = await seedRun(TEST_USER.userId);
    const response = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/runs/${runId}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: runId });
  });

  it('should admit an admin to a run call and a run context', async () => {
    const { projectId, runId, callId } = await seedRun(TEST_USER.userId);

    const call = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/runs/${runId}/calls/${callId}`);
    expect(call.statusCode).toBe(200);

    const context = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/runs/${runId}/context`);
    expect(context.statusCode).toBe(200);
  });

  it('should leave the author-facing run list ungated by the admin permission', async () => {
    const { projectId } = await seedRun(NON_ADMIN_SUB);
    const response = await asNonAdmin().get(`/api/v1/projects/${projectId}/runs`);
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toBeArray();
  });
});
