import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { GenerationService } from '@modules/generation/generation.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_volume_epitome`;

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

describe.if(pgAvailable)('volume epitome on finalization', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  function buildService(): { service: GenerationService; structured: ReturnType<typeof mock>; finalization: ReturnType<typeof mock> } {
    const structured = mock(async () => ({ epitome: 'The ledger burned, Amara went into exile, and the forger stayed unnamed.' }));
    const finalization = mock(async () => ({ runId: 'run-1', outcome: 'completed', status: 'completed' }));
    const noop = {} as never;
    const service = new GenerationService(
      { getPostgresClient: () => db } as never,
      { runChapterFinalization: finalization } as never,
      { structured } as never,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
    );
    return { service, structured, finalization };
  }

  interface VolumeFixture {
    endChapter?: number;
    finalizedThrough?: number;
    summaries?: boolean;
    epitome?: string;
    volumeStatus?: 'draft' | 'approved';
  }

  async function seedVolume({ endChapter = 3, finalizedThrough = 3, summaries = true, epitome, volumeStatus = 'approved' }: VolumeFixture = {}): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `epitome-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    const projectId = project.id;

    await db.insert(schema.volumes).values({
      projectId,
      volumeKey: 'vol_1',
      ordinal: 1,
      status: volumeStatus,
      startChapter: 1,
      endChapter,
      title: 'The Ledger',
      objective: 'expose the forger',
      epitome,
    });
    await db.insert(schema.chapters).values(
      Array.from({ length: finalizedThrough }, (_, i) => ({
        projectId,
        number: i + 1,
        content: `ch${i + 1}`,
        summary: summaries ? `chapter ${i + 1} happened` : null,
        status: 'done' as const,
        locked: true,
      })),
    );
    await db
      .insert(schema.drafts)
      .values(Array.from({ length: finalizedThrough - 1 }, (_, i) => ({ projectId, chapter: i + 1, body: `d${i + 1}`, status: 'final' as const, reviewStatus: 'final' as const })));
    await db.insert(schema.drafts).values({ projectId, chapter: finalizedThrough, body: `d${finalizedThrough}`, status: 'draft', reviewStatus: 'approved' });
    return projectId;
  }

  function volumeOf(projectId: bigint) {
    return db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, 'vol_1')) });
  }

  it('should write an epitome distilled from the chapter summaries when the volume’s last chapter finalizes', async () => {
    const projectId = await seedVolume();
    const { service, structured } = buildService();

    await service.finalize(projectId, { chapter: 3 });

    expect(structured).toHaveBeenCalledTimes(1);
    const vars = structured.mock.calls[0]?.[1] as { chapterSummaries: string; startChapter: number; endChapter: number };
    expect(vars.chapterSummaries).toBe('Ch 1: chapter 1 happened\nCh 2: chapter 2 happened\nCh 3: chapter 3 happened');
    expect(vars).toMatchObject({ startChapter: 1, endChapter: 3 });
    expect((await volumeOf(projectId))?.epitome).toBe('The ledger burned, Amara went into exile, and the forger stayed unnamed.');
  });

  it('should not write an epitome when the finalized chapter is not the volume’s last', async () => {
    const projectId = await seedVolume({ endChapter: 5, finalizedThrough: 3 });
    const { service, structured } = buildService();

    await service.finalize(projectId, { chapter: 3 });

    expect(structured).not.toHaveBeenCalled();
    expect((await volumeOf(projectId))?.epitome).toBeNull();
  });

  it('should not write an epitome for a volume that is not approved', async () => {
    const projectId = await seedVolume({ volumeStatus: 'draft' });
    const { service, structured } = buildService();

    await service.finalize(projectId, { chapter: 3 });

    expect(structured).not.toHaveBeenCalled();
  });

  it('should leave an existing epitome untouched when the last chapter finalizes again', async () => {
    const projectId = await seedVolume({ epitome: 'hand-written epitome' });
    const { service, structured } = buildService();

    await service.finalize(projectId, { chapter: 3 });

    expect(structured).not.toHaveBeenCalled();
    expect((await volumeOf(projectId))?.epitome).toBe('hand-written epitome');
  });

  it('should skip the epitome without failing finalization when no chapter in range has a summary', async () => {
    const projectId = await seedVolume({ summaries: false });
    const { service, structured } = buildService();

    await expect(service.finalize(projectId, { chapter: 3 })).resolves.toMatchObject({ runId: 'run-1' });
    expect(structured).not.toHaveBeenCalled();
    expect((await volumeOf(projectId))?.epitome).toBeNull();
  });

  it('should finalize successfully even when the epitome model call throws', async () => {
    const projectId = await seedVolume();
    const { service, structured, finalization } = buildService();
    structured.mockImplementationOnce(() => Promise.reject(new Error('model exploded')));

    await expect(service.finalize(projectId, { chapter: 3 })).resolves.toMatchObject({ runId: 'run-1' });
    expect(finalization).toHaveBeenCalledTimes(1);
    expect((await volumeOf(projectId))?.epitome).toBeNull();
  });
});
