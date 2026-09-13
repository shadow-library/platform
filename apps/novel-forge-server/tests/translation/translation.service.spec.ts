import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { TranslationService } from '@modules/translation';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { noPluginPolicy } from '@tests/fixtures/plugin-policy';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_translation_service`;

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

const seedOutput = {
  styleNotes: 'Past tense, third person limited. Honorifics dropped; family name first for cultivators.',
  terms: [
    { sourceTerm: '叶凡', variants: ['凡哥'], target: 'Ye Fan', category: 'character' as const, treatment: 'transliterate' as const, meaning: 'the protagonist' },
    { sourceTerm: '青云宗', target: 'Azure Cloud Sect', category: 'organization' as const, treatment: 'translate' as const, meaning: 'the protagonist’s sect' },
  ],
};

describe.if(pgAvailable)('TranslationService', () => {
  let db: PrimaryDatabase;
  let projectId: bigint;
  let service: TranslationService;
  const structured = mock(async () => seedOutput as unknown);

  const contextAssembler = { forTranslateSeed: async () => ({ id: null, rendered: 'SEED-PACK' }) } as never;
  const modelRouter = { structured } as never;
  const workflowRunService = {
    runChain: async (_p: bigint, _g: string, _t: string, _i: unknown, fn: (runId: string) => Promise<unknown>) => ({ runId: 'run-1', result: await fn('run-1') }),
    linkContextPack: async () => undefined,
  } as never;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    service = new TranslationService(databaseService, contextAssembler, modelRouter, workflowRunService, noPluginPolicy());

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `translation-svc-${Date.now()}`, kind: 'translation', originalLanguage: 'zh' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
    await db.insert(schema.chapters).values([
      { projectId, number: 1, originalTitle: '第一章', originalContent: '叶凡站在青云宗的山门前。', status: 'done', generator: 'human' },
      { projectId, number: 2, originalTitle: '第二章', originalContent: '青云宗的剑气纵横。', status: 'done', generator: 'human' },
    ]);
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  describe('getOrCreate', () => {
    it('should create the translation row on first touch and reuse it after', async () => {
      const first = await service.getOrCreate(projectId);
      expect(first).toMatchObject({ phase: 'pending', styleNotes: null });
      const second = await service.getOrCreate(projectId);
      expect(second.id).toBe(first.id);
    });

    it('should reject non-translation projects with TRN_003', async () => {
      const [novel] = await db
        .insert(schema.projects)
        .values({ name: `translation-novel-${Date.now()}`, kind: 'new_novel' })
        .returning();
      if (!novel) throw new Error('failed to seed project');
      expect(service.getOrCreate(novel.id)).rejects.toThrow(/only available for translation projects/);
    });

    it('should reject unknown projects with PRJ_001', async () => {
      expect(service.getOrCreate(999_999n)).rejects.toThrow(/Project not found/);
    });
  });

  describe('seedGlossary', () => {
    it('should write the style notes, land every term as a seeded suggestion, and never seed twice', async () => {
      const result = await service.seedGlossary(projectId, 'job-1');
      expect(result).toEqual({ seeded: true, suggestions: 2 });
      expect(structured).toHaveBeenCalledTimes(1);

      const [, input] = structured.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect(input).toMatchObject({ contextPack: 'SEED-PACK', language: 'zh' });
      expect(input['sampleChapters']).toContain('叶凡站在青云宗的山门前。');

      const translation = await db.query.translations.findFirst({ where: eq(schema.translations.projectId, projectId) });
      expect(translation?.styleNotes).toBe(seedOutput.styleNotes);

      const terms = await db.query.translationGlossary.findMany({ where: eq(schema.translationGlossary.projectId, projectId) });
      expect(terms).toHaveLength(2);
      expect(terms.every(term => term.status === 'suggested' && term.origin === 'seed' && term.createdChapter === 0)).toBe(true);
      expect(terms.find(term => term.sourceTerm === '叶凡')).toMatchObject({ target: 'Ye Fan', treatment: 'transliterate', variants: ['凡哥'], revision: 1 });

      const again = await service.seedGlossary(projectId, 'job-2');
      expect(again).toEqual({ seeded: false, suggestions: 0 });
      expect(structured).toHaveBeenCalledTimes(1);
    });
  });

  describe('glossary staleness', () => {
    it('should mark only the chapters that rendered the edited term', async () => {
      const [term] = await db
        .insert(schema.translationGlossary)
        .values({ projectId, sourceTerm: '剑气', target: 'sword qi', category: 'ability', treatment: 'translate', status: 'suggested', origin: 'discovered' })
        .returning();
      if (!term) throw new Error('failed to seed glossary term');

      await db.insert(schema.chapterTranslations).values([
        { projectId, chapter: 1, body: 'He drew on sword qi.', status: 'translated', appliedTerms: { [term.id.toString()]: 1 } },
        { projectId, chapter: 2, body: 'A quiet morning.', status: 'translated', appliedTerms: {} },
      ]);

      const updated = await service.updateTerm(projectId, term.id, { target: 'blade aura' });
      expect(updated).toMatchObject({ target: 'blade aura', revision: 2 });

      const rows = await db.query.chapterTranslations.findMany({ where: eq(schema.chapterTranslations.projectId, projectId) });
      expect(rows.find(row => row.chapter === 1)?.glossaryStale).toBe(true);
      expect(rows.find(row => row.chapter === 2)?.glossaryStale).toBe(false);

      const detail = await service.getChapter(projectId, 1);
      expect(detail.appliedTerms).toEqual([{ id: term.id, sourceTerm: '剑气', target: 'blade aura', status: 'suggested', revision: 2, appliedRevision: 1, stale: true }]);

      await db.delete(schema.chapterTranslations).where(eq(schema.chapterTranslations.projectId, projectId));
      await db.delete(schema.translationGlossary).where(eq(schema.translationGlossary.id, term.id));
    });
  });
});
