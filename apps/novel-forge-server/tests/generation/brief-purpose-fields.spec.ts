import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { GenerationService } from '@modules/generation/generation.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_brief_purpose_fields`;

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(baseConnectionString);
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

const ENDING_CONTRACT = { hookType: 'cliffhanger', emotionalBeat: 'dread', openQuestion: 'who?', handoffState: 'cornered', mustNotResolve: [] };

function brief(chapter: number, overrides: Partial<{ chapterPurpose: string; readerValue: string[]; repetitionRisks: string[] }> = {}) {
  return {
    chapter,
    volumeKey: 'v1',
    title: `Chapter ${chapter}`,
    objective: 'advance the plot',
    events: ['something happens'],
    requiredContext: [],
    endingContract: ENDING_CONTRACT,
    chapterPurpose: 'Establishes the stakes for the heist.',
    readerValue: ['new_information'],
    ...overrides,
  };
}

describe.if(pgAvailable)('brief chapterPurpose/readerValue/repetitionRisks (harness-final-recommendation.md D16)', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function createApprovedVolume(endChapter = 3): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `brief-purpose-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.volumes).values({ projectId: project.id, volumeKey: 'v1', ordinal: 1, status: 'approved', startChapter: 1, endChapter });
    return project.id;
  }

  function buildService(structuredOutput: unknown): GenerationService {
    const databaseService = { getPostgresClient: () => db } as never;
    const modelRouter = { structured: mock(async () => structuredOutput) } as never;
    const contextAssembler = { catalog: async () => 'CATALOG', resolveRefs: async (_projectId: bigint, refs: string[]) => ({ resolved: [], unresolved: refs }) } as never;
    const noop = {} as never;
    return new GenerationService(databaseService, noop, modelRouter, contextAssembler, noop, noop, noop, noop, noop, noop, noop, noop);
  }

  it('persists chapterPurpose, readerValue, and repetitionRisks from outline()', async () => {
    const projectId = await createApprovedVolume(1);
    const service = buildService([brief(1, { repetitionRisks: ['another tavern negotiation'] })]);

    await service.outline(projectId, { start: 1, count: 1 });

    const [persisted] = await db.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId) });
    expect(persisted?.chapterPurpose).toBe('Establishes the stakes for the heist.');
    expect(persisted?.readerValue).toEqual(['new_information']);
    expect(persisted?.repetitionRisks).toEqual(['another tavern negotiation']);
  });

  it('persists null repetitionRisks when the outliner omits it', async () => {
    const projectId = await createApprovedVolume(1);
    const service = buildService([brief(1)]);

    await service.outline(projectId, { start: 1, count: 1 });

    const [persisted] = await db.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId) });
    expect(persisted?.repetitionRisks).toBeNull();
  });

  it('changing readerValue alone changes the brief content hash (staleness contract)', async () => {
    const { briefContentHash } = await import('@server/common');
    const a = briefContentHash({ chapter: 1, body: 'b', readerValue: ['new_information'] });
    const b = briefContentHash({ chapter: 1, body: 'b', readerValue: ['emotional_turn'] });
    expect(a).not.toBe(b);
  });
});
