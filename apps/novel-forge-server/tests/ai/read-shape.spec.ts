import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { finalizePack } from '@modules/ai/context/pack-finalize';
import { indexEntityLore } from '@modules/ai/graphs/chapter-finalization.graph';
import { createChapterGenerationNodes } from '@modules/ai/graphs/chapter-generation.graph';
import { flagRevalidation } from '@modules/ai/graphs/novel-validation.graph';
import { type EmbeddingService } from '@modules/ai/retrieval/embedding.service';
import { IndexingService } from '@modules/ai/retrieval/indexing.service';
import { RetrievalService } from '@modules/ai/retrieval/retrieval.service';
import { getChapterSummariesTool } from '@modules/ai/tools/tools/get-chapter-summaries.tool';
import { hashReviewedBody } from '@modules/review/review-findings';
import { schema } from '@server/database';

import { recordingDb } from '../recording-db';
import { readsOf, relationalRecorder, selectedColumns } from './relational-recorder';
import { writerAssembler, writerDb, writerTables } from './writer-disclosure-fixtures';

const PROSE = 'The tide came in slowly. '.repeat(40);

function chapter(number: number): Record<string, unknown> {
  return { id: BigInt(number), number, title: `Chapter ${number}`, summary: `What happened in ${number}.`, content: PROSE, status: 'done', isolated: false, volumeKey: null };
}

function assemblerOver(rows: Record<string, unknown[]>, extra: Record<string, unknown> = {}, retrieval?: RetrievalService) {
  const { query, reads } = relationalRecorder(rows);
  const db = { query, $count: async () => 0, insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }) }), ...extra };
  const catalog = new CatalogService({ getPostgresClient: () => db } as never);
  return { assembler: new ContextAssembler({ getPostgresClient: () => db } as never, catalog, retrieval), reads };
}

describe('pack reads leave out the prose they never render', () => {
  it('should build the catalog from chapter metadata without reading any chapter text', async () => {
    const { query, reads } = relationalRecorder({ chapters: [chapter(1), chapter(2)] });

    const catalog = await new CatalogService({ getPostgresClient: () => ({ query }) } as never).render(1n);

    expect(catalog).toContain('2 — Chapter 2');
    expect(selectedColumns(readsOf(reads, 'chapters')[0] ?? { table: '', sql: '', params: [] })).toEqual(['number', 'title', 'summary', 'status', 'isolated']);
  });

  it('should read a validation window and an outline’s recent chapters without their text', async () => {
    const { assembler, reads } = assemblerOver({ chapters: [chapter(1), chapter(2)] });

    const window = await assembler.forValidationWindow(1n, 1, 2);
    await assembler.forOutline(1n, 3, { budgetTokens: 100_000 });

    const summaryReads = readsOf(reads, 'chapters').filter(read => read.sql.includes('"number" between') || read.sql.includes('"number" <'));
    expect(window.rendered).toContain('Ch 2: What happened in 2.');
    expect(summaryReads.map(selectedColumns)).toEqual([
      ['number', 'summary', 'isolated'],
      ['number', 'summary', 'isolated'],
    ]);
  });

  it('should read only the draft body a current finalize review is checked against, and no body when no review is ready', async () => {
    const draft = (number: number, revision: number) => ({
      chapter: number,
      title: null,
      reviewStatus: 'approved',
      status: 'draft',
      revision,
      body: `the prose of chapter ${number}`,
      summary: null,
      isolated: false,
      staleReason: null,
    });
    const drafts = [draft(1, 1), draft(2, 1), draft(3, 2), draft(4, 1)];
    const review = { chapter: 3, draftRevision: 2, sourceHash: hashReviewedBody('the prose of chapter 3'), items: [{ decision: null }] };

    const reviewed = assemblerOver({ drafts, finalizeReviews: [review] });
    const pack = await reviewed.assembler.forNovelChat(1n, new Date(0), { promptTokens: 4_000, requestTokens: 0 });
    const idle = assemblerOver({ drafts, finalizeReviews: [] });
    await idle.assembler.forNovelChat(1n, new Date(0), { promptTokens: 4_000, requestTokens: 0 });

    const bodyReads = (reads: typeof reviewed.reads) => readsOf(reads, 'drafts').filter(read => selectedColumns(read).includes('body') && read.sql.includes('"chapter" in'));
    const everyDraft = (reads: typeof reviewed.reads) => readsOf(reads, 'drafts').filter(read => !read.sql.includes('"chapter" ='));
    expect(pack.sections.find(section => section.key === 'pipeline_status')?.rendered).toContain("chapter 3's finalize review, 1 answer open");
    expect(bodyReads(reviewed.reads)).toHaveLength(1);
    expect(bodyReads(reviewed.reads)[0]?.params).toEqual([1n, 3]);
    expect(bodyReads(idle.reads)).toHaveLength(0);
    for (const read of everyDraft(idle.reads)) expect(selectedColumns(read)).not.toContain('body');
  });

  it('should tell the hub what changed since the session began without reading page, plan or volume bodies', async () => {
    const { assembler, reads } = assemblerOver({
      bibleDocuments: [{ section: 'world', slug: 'river', revision: 3, frontmatter: null, body: 'The river runs east.' }],
      volumes: [{ volumeKey: 'v1', ordinal: 1, revision: 2, title: 'One', objective: 'Cross it.', body: 'A long volume plan.', state: 'active' }],
    });

    const pack = await assembler.forNovelChat(1n, new Date(0), { promptTokens: 4_000, requestTokens: 0 });

    expect(pack.sections.find(section => section.key === 'changed_since')?.rendered).toContain('doc:world/river is now at revision 3');
    const changed = reads.filter(read => read.sql.includes('"updated_at" >'));
    expect(changed.map(read => read.table).sort()).toEqual(['bibleDocuments', 'briefs', 'volumes']);
    for (const read of changed) expect(selectedColumns(read)).not.toContain('body');
  });

  it('should embed an outline’s retrieval query once for both indexes', async () => {
    const embedded: string[] = [];
    const embeddingService = {
      task: 'novel-forge.embedding',
      embed: async (_projectId: bigint, text: string) => {
        embedded.push(text);
        return [0.1, 0.2];
      },
    } as unknown as EmbeddingService;
    const executed: SQL[] = [];
    const retrievalDb = {
      execute: async (query: SQL) => {
        executed.push(query);
        return new PgDialect().sqlToQuery(query).sql.includes('lore_chunks') ? [{ kind: 'character', refKey: 'mira', text: 'Mira keeps the lamp.', score: 0.9 }] : [];
      },
    };
    const retrieval = new RetrievalService({ getPostgresClient: () => retrievalDb } as never, embeddingService);
    const { assembler } = assemblerOver({ volumes: [{ volumeKey: 'v1', ordinal: 1, objective: 'Keep the lamp lit.', state: 'active' }], briefs: [] }, {}, retrieval);

    const pack = await assembler.forOutline(1n, 3, { budgetTokens: 100_000, volumeKey: 'v1' });

    expect(embedded).toEqual(['Keep the lamp lit.']);
    expect(executed).toHaveLength(2);
    expect(pack.sections.find(section => section.key === 'lore_retrieved')?.rendered).toContain('Mira keeps the lamp.');
  });

  it('should resolve a cited chapter and draw a chapter illustration from its summary without reading its text', async () => {
    const { assembler, reads } = assemblerOver({ chapters: [chapter(2)] });

    const refs = await assembler.resolveRefs(1n, ['chapter:2']);
    const art = await assembler.forIllustration(1n, 'chapter', '2');

    expect(refs.resolved[0]?.rendered).toContain('Ch 2: What happened in 2.');
    expect(art.rendered).toContain('What happened in 2.');
    expect(readsOf(reads, 'chapters').map(selectedColumns)).toEqual([
      ['number', 'title', 'summary', 'status', 'isolated'],
      ['title', 'summary', 'isolated'],
    ]);
  });

  it('should read only the id of a pack already stored under the same hash', async () => {
    const { query, reads } = relationalRecorder({ contextPacks: [{ id: 41n }] });
    const db = { query, insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }) }) };

    const pack = await finalizePack(db as never, 1n, 'chat_hub', null, [], [], 1_000);

    expect(pack.id).toBe(41n);
    expect(readsOf(reads, 'contextPacks').map(selectedColumns)).toEqual([['id']]);
  });
});

describe('the chapter summaries lookup', () => {
  it('should read the summaries of up to twenty-one chapters without their text', async () => {
    const { db, queries } = recordingDb(() => [chapter(3), chapter(2)].map(({ number, summary, isolated }) => ({ number, summary, isolated })));

    const result = String(await getChapterSummariesTool.handler({ from: 2, to: 3 }, { db, projectId: 1n } as never));

    expect(result).toBe('Ch 2: What happened in 2.\nCh 3: What happened in 3.');
    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).toStartWith('select "number", "summary", "isolated" from "chapters"');
  });
});

describe('the chapter-generation run reads its context pack once', () => {
  it('should serve the draft, the patch and the rewrite from one pack read', async () => {
    const db = writerDb(writerTables('unlocked'));
    let packReads = 0;
    const query = new Proxy(db.query, {
      get: (target, table: string) => {
        const finder = target[table];
        if (table !== 'contextPacks' || !finder) return finder;
        return { ...finder, findFirst: async (config?: { where?: SQL }) => (packReads++, finder.findFirst(config)) };
      },
    });
    const counted = { ...db, query };
    const policy = { writerClass: 'standard', raised: false, contextSections: [] };
    const body = 'The tide came in slowly. '.repeat(900);
    const nodes = createChapterGenerationNodes({
      db: counted as never,
      contextAssembler: writerAssembler(db),
      modelRouter: {
        structured: async (prompt: { key: string }) => (prompt.key === 'fix' ? { action: 'rewrite', body } : { title: 'Low Water', body, summary: 'Done.', state: {} }),
      } as never,
      telemetry: {} as never,
      toolRegistry: {} as never,
      indexingService: {} as never,
      pluginPolicy: { scoped: async () => ({ for: () => policy, forPack: () => policy }) } as never,
      writerSnapshots: { onMessages: () => () => {} } as never,
    });
    const run = { projectId: '7', chapter: 5, runId: 'run-1', guidance: '', findings: [], knowledgeWriterFindings: [] };

    const { contextPackId } = await nodes.assembleContext(run as never);
    await nodes.draftChapter({ ...run, contextPackId } as never);
    await nodes.repairPatch({ ...run, contextPackId, prose: 'The tide came in.' } as never);
    await nodes.repairRewrite({ ...run, contextPackId } as never);

    expect(contextPackId).not.toBeNull();
    expect(packReads).toBe(1);
  });
});

describe('batched indexing and revalidation writes', () => {
  function indexingOver(entities: Record<string, unknown>[]) {
    const { query, reads } = relationalRecorder({ entities });
    const batches: string[][] = [];
    const upserts: Record<string, unknown>[][] = [];
    const db = {
      query,
      insert: () => ({ values: (rows: Record<string, unknown>[]) => ({ onConflictDoUpdate: async () => void upserts.push(rows) }) }),
    };
    const embeddingService = {
      task: 'novel-forge.embedding',
      embedBatch: async (_projectId: bigint, texts: string[]) => {
        batches.push(texts);
        return texts.map(text => (text.includes('Unembeddable') ? null : [0.1, 0.2]));
      },
    } as unknown as EmbeddingService;
    return { db, indexing: new IndexingService({ getPostgresClient: () => db } as never, embeddingService), reads, batches, upserts };
  }

  it('should index every entity a chapter touched with one read, one embedding call and one upsert', async () => {
    const entities = [
      { entityKey: 'mira', name: 'Mira', notes: 'Keeper.', body: null },
      { entityKey: 'oren', name: 'Oren', notes: null, body: 'Unembeddable ferryman.' },
      { entityKey: 'lamp', name: 'The Lamp', notes: null, body: null },
    ];
    const { db, indexing, reads, batches, upserts } = indexingOver(entities);

    await indexEntityLore(db as never, indexing, 1n, ['mira', 'oren', 'mira', 'lamp']);

    expect(reads).toHaveLength(1);
    expect(batches).toEqual([['Mira\nKeeper.', 'Oren\nUnembeddable ferryman.', 'The Lamp']]);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.map(row => [row['refKey'], row['embeddingTask']])).toEqual([
      ['mira', 'novel-forge.embedding'],
      ['oren', null],
      ['lamp', 'novel-forge.embedding'],
    ]);
  });

  it('should read no chapter text when every chapter is already indexed, and only the pending chapter’s text otherwise', async () => {
    const backfill = async (indexed: number[]) => {
      const { query, reads } = relationalRecorder({ chapters: [chapter(1), chapter(2), chapter(3)] });
      const db = {
        query,
        execute: async () => indexed.map(number => ({ chapter: number, cnt: 1, unembedded: 0 })),
        delete: () => ({ where: async () => undefined }),
        insert: () => ({ values: async () => undefined }),
      };
      const embeddingService = { task: 'novel-forge.embedding', embedBatch: async (_projectId: bigint, texts: string[]) => texts.map(() => [0.1]) } as unknown as EmbeddingService;
      const result = await new IndexingService({ getPostgresClient: () => db } as never, embeddingService).backfill(1n);
      return { result, textReads: readsOf(reads, 'chapters').filter(read => selectedColumns(read).includes('content')) };
    };

    const done = await backfill([1, 2, 3]);
    const pending = await backfill([1, 3]);

    expect(done.textReads).toHaveLength(0);
    expect(pending.result).toEqual({ indexed: 1, skipped: 0 });
    expect(pending.textReads).toHaveLength(1);
    expect(pending.textReads[0]?.params.at(-1)).toBe(2);
  });

  it('should flag and clear the covered chapters in two updates however many there are', async () => {
    const { query } = relationalRecorder({ chapters: Array.from({ length: 40 }, (_, index) => ({ number: index + 1 })) });
    const updates: { set: Record<string, unknown>; where: SQL }[] = [];
    const db = { query, update: () => ({ set: (set: Record<string, unknown>) => ({ where: async (where: SQL) => void updates.push({ set, where }) }) }) };

    await flagRevalidation(db as never, 1n, new Set(Array.from({ length: 30 }, (_, index) => index + 1)), new Set([4, 9]));

    expect(updates).toHaveLength(2);
    const chaptersOf = (index: number) => new PgDialect().sqlToQuery(updates[index]?.where as SQL).params.slice(1);
    expect(updates.map(update => update.set['needsRevalidation'])).toEqual([true, false]);
    expect(chaptersOf(0)).toEqual([4, 9]);
    expect(chaptersOf(1)).toHaveLength(28);
    expect(chaptersOf(1)).not.toContain(31);
  });
});

describe('the finalize indexing batch keeps the schema’s upsert key', () => {
  it('should upsert lore on its project, kind and ref key', async () => {
    let target: unknown[] = [];
    const db = { insert: () => ({ values: () => ({ onConflictDoUpdate: async (config: { target: unknown[] }) => void (target = config.target) }) }) };
    const embeddingService = { task: 'novel-forge.embedding', embedBatch: async (_projectId: bigint, texts: string[]) => texts.map(() => null) } as unknown as EmbeddingService;

    await new IndexingService({ getPostgresClient: () => db } as never, embeddingService).addLoreBatch(1n, 'character', [
      { refKey: 'mira', text: 'Mira', sourceUpdatedAt: new Date(0) },
    ]);

    expect(target).toEqual([schema.loreChunks.projectId, schema.loreChunks.kind, schema.loreChunks.refKey]);
  });
});
