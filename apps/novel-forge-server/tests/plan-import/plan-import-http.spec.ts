import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';

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

const testEnv = new TestEnvironment('plan_import_http');

function sentBundle(): Record<string, unknown> {
  return {
    format: 'novel-forge-plan',
    version: 2,
    draftLabel: 'second pass',
    entities: [{ entityKey: 'tamsin', type: 'character', name: 'Tamsin', mood: 'wary' }],
    volumes: [{ volumeKey: 'v1', ordinal: 1, title: 'Low Tide', objective: 'o', conflict: 'c', payoff: 'p', targetChapterCount: 1 }],
    briefs: [
      {
        chapter: 1,
        volumeKey: 'v1',
        title: 'The Causeway',
        objective: 'Tamsin crosses before the tide turns.',
        events: ['She finds the marker stones moved.'],
        endingContract: { hookType: 'cliffhanger', emotionalBeat: 'unease', openQuestion: 'who moved the stones?', handoffState: 'mid-crossing' },
        pov: 'tamsin',
        chapterPurpose: 'Makes the tide a clock.',
        readerValue: ['power_or_stakes_change'],
        repetitionRisks: ['another shoreline arrival'],
        guidance: 'Short sentences; the sea is always audible.',
        tension: 'high',
      },
    ],
  };
}

describe.if(pgAvailable)('POST /api/v1/projects/:projectId/plan/import', () => {
  testEnv.init();

  it('should store the new brief fields and warn about the fields the request schema stripped', async () => {
    const created = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'tide novel', kind: 'new_novel' });
    expect(created.statusCode).toBe(201);
    const projectId = created.json().id as string;

    const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/plan/import`).body({ bundle: sentBundle() });
    expect(response.statusCode).toBe(200);
    expect(response.json().warnings).toEqual([
      "field 'bundle.draftLabel' is not part of the plan bundle format and was ignored",
      "field 'bundle.entities[].mood' is not part of the plan bundle format and was ignored",
      "field 'bundle.briefs[].tension' is not part of the plan bundle format and was ignored",
    ]);

    const brief = await testEnv.getPostgresClient().query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, BigInt(projectId)), eq(schema.briefs.chapter, 1)) });
    expect(brief).toMatchObject({
      pov: 'tamsin',
      chapterPurpose: 'Makes the tide a clock.',
      readerValue: ['power_or_stakes_change'],
      repetitionRisks: ['another shoreline arrival'],
      guidance: 'Short sentences; the sea is always audible.',
    });
  });
});
