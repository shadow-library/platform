import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { ChapterAmendService } from '@modules/generation/chapter-amend.service';
import { schema } from '@server/database';

import { makeGenerationService, render } from './generation-fixtures';

interface StoredChapter {
  number: number;
  title: string | null;
  content: string | null;
  note: string | null;
  summary: string | null;
  wordCount: number | null;
  contentRating: Record<string, string> | null;
  status: 'done' | 'pending';
  isolated: boolean;
  generator: 'standard' | 'unrestricted' | 'human';
  locked: boolean;
}

interface StoredDraft {
  id: bigint;
  chapter: number;
  title: string | null;
  body: string;
  words: number | null;
  revision: number;
  status: 'draft' | 'final';
  isolated: boolean;
  generator: 'standard' | 'unrestricted' | 'human';
  contentRating: Record<string, string> | null;
  summary: string | null;
  state: Record<string, unknown> | null;
  judge: 'consistent' | 'contradiction' | 'evaluation_failed' | null;
  judgeNote: string | null;
}

interface StoredRevision {
  draftId: bigint;
  revision: number;
  source: string;
  body: string;
  isolated?: boolean;
}

interface Write {
  table: unknown;
  values: Record<string, unknown>;
  where?: SQL;
}

interface AmendFakeOptions {
  chapter?: Partial<StoredChapter>;
  draft?: Partial<StoredDraft> | null;
  revisions?: StoredRevision[];
  refuseDraftWrite?: boolean;
}

const FINAL_PROSE = 'The lighthouse keeper logs a ship that never arrives.';
const AMENDED_PROSE = 'The lighthouse keeper logs two ships, and only one of them arrives.';

function amendFake(options: AmendFakeOptions = {}) {
  const chapter: StoredChapter = {
    number: 4,
    title: 'Low Water',
    content: FINAL_PROSE,
    note: null,
    summary: 'A ship is expected.',
    wordCount: 9,
    contentRating: null,
    status: 'done',
    isolated: false,
    generator: 'standard',
    locked: true,
    ...options.chapter,
  };
  const draft: StoredDraft | null =
    options.draft === null
      ? null
      : {
          id: 11n,
          chapter: 4,
          title: 'Low Water',
          body: FINAL_PROSE,
          words: 9,
          revision: 3,
          status: 'final',
          isolated: false,
          generator: 'standard',
          contentRating: null,
          summary: 'A ship is expected.',
          state: { tide: 'low' },
          judge: 'consistent',
          judgeNote: 'Clean and on brief.',
          ...options.draft,
        };
  const revisions: StoredRevision[] = [...(options.revisions ?? [])];
  const writes: Write[] = [];
  const draftLookups: SQL[] = [];

  const db = {
    query: {
      projects: { findFirst: async () => ({ id: 1n, contentMode: 'standard' }) },
      briefs: { findFirst: async () => undefined },
      chapters: { findFirst: async () => ({ ...chapter }) },
      chapterPublications: { findFirst: async () => undefined },
      drafts: {
        findFirst: async (query?: { where?: SQL; columns?: object }) => {
          if (query?.columns && query.where) draftLookups.push(query.where);
          if (!draft) return undefined;
          if (query?.columns && draft.status !== 'final') return undefined;
          return { ...draft };
        },
      },
      draftRevisions: {
        findFirst: async () => {
          const highest = Math.max(0, ...revisions.map(revision => revision.revision));
          return highest > 0 ? { revision: highest } : undefined;
        },
      },
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: SQL) => {
          writes.push({ table, values, where });
          return {
            returning: async () => {
              if (table === schema.chapters) {
                Object.assign(chapter, values);
                return [{ ...chapter }];
              }
              if (table !== schema.drafts || !draft || options.refuseDraftWrite) return [];
              Object.assign(draft, values);
              return [{ id: draft.id, title: draft.title, isolated: draft.isolated }];
            },
          };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        writes.push({ table, values });
        const revision = values as unknown as StoredRevision;
        const taken = table === schema.draftRevisions && revisions.some(row => row.draftId === revision.draftId && row.revision === revision.revision);
        if (!taken && table === schema.draftRevisions) revisions.push(revision);
        const insert = async () => {
          if (taken) throw new Error('duplicate key value violates unique constraint "draft_revisions_draft_id_revision_unique"');
        };
        return { then: (resolve: () => void, reject: (error: unknown) => void) => insert().then(resolve, reject), onConflictDoNothing: async () => undefined };
      },
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const snapshot = { chapter: { ...chapter }, draft: draft && { ...draft }, revisions: revisions.length };
      try {
        return await run(db);
      } catch (error) {
        Object.assign(chapter, snapshot.chapter);
        if (draft && snapshot.draft) Object.assign(draft, snapshot.draft);
        revisions.length = snapshot.revisions;
        throw error;
      }
    },
  };

  const indexing = { addProse: async () => undefined, deleteProse: async () => undefined };
  const service = new ChapterAmendService({ getPostgresClient: () => db } as never, indexing as never);
  const writesTo = (table: unknown) => writes.filter(write => write.table === table);
  return { db, service, chapter, draft, revisions, writesTo, draftLookups };
}

describe('ChapterAmendService', () => {
  it('should carry the amended prose, words and title into the final draft under a new amended revision', async () => {
    const fake = amendFake();

    await fake.service.amend(1n, 4, { content: AMENDED_PROSE, title: 'Two Ships' });

    expect(fake.chapter).toMatchObject({ content: AMENDED_PROSE, title: 'Two Ships', wordCount: 12, locked: true });
    expect(fake.draft).toMatchObject({ body: AMENDED_PROSE, title: 'Two Ships', words: 12, revision: 4, status: 'final' });
    expect(fake.revisions).toMatchObject([
      { draftId: 11n, revision: 3, source: 'generated', body: FINAL_PROSE, summary: 'A ship is expected.', state: { tide: 'low' } },
      { draftId: 11n, revision: 4, source: 'amended', body: AMENDED_PROSE },
    ]);
  });

  it('should record both revisions of an isolated final draft as isolated', async () => {
    const fake = amendFake({ draft: { isolated: true } });

    await fake.service.amend(1n, 4, { content: AMENDED_PROSE });

    expect(fake.revisions.map(({ revision, isolated }) => ({ revision, isolated }))).toEqual([
      { revision: 3, isolated: true },
      { revision: 4, isolated: true },
    ]);
  });

  it('should snapshot a human final draft as imported and keep a history row already filed at its revision', async () => {
    const fake = amendFake({ draft: { generator: 'human' }, revisions: [{ draftId: 11n, revision: 3, source: 'hand_edited', body: FINAL_PROSE }] });

    await fake.service.amend(1n, 4, { content: AMENDED_PROSE });

    expect(fake.revisions.map(({ revision, source }) => ({ revision, source }))).toEqual([
      { revision: 3, source: 'hand_edited' },
      { revision: 4, source: 'amended' },
    ]);

    const human = amendFake({ draft: { generator: 'human' } });
    await human.service.amend(1n, 4, { content: AMENDED_PROSE });
    expect(human.revisions[0]).toMatchObject({ revision: 3, source: 'imported', body: FINAL_PROSE });
  });

  it('should clear the judge verdict, which described the prose the amend replaced', async () => {
    const fake = amendFake();

    await fake.service.amend(1n, 4, { content: AMENDED_PROSE });

    expect(fake.draft).toMatchObject({ judge: null, judgeNote: null });
  });

  it('should write only a final draft, bound to the revision it read', async () => {
    const fake = amendFake();

    await fake.service.amend(1n, 4, { content: AMENDED_PROSE });

    expect(render(fake.draftLookups[0]).sql).toContain('"drafts"."status" = $');
    const [write] = fake.writesTo(schema.drafts);
    const predicate = render(write!.where);
    expect(predicate.sql).toContain('"drafts"."status" = $');
    expect(predicate.sql).toContain('"drafts"."revision" = $');
    expect(predicate.params).toEqual([11n, 'final', 3]);
  });

  it('should keep the draft and its history in step across a second amend', async () => {
    const fake = amendFake();

    await fake.service.amend(1n, 4, { content: AMENDED_PROSE });
    await fake.service.amend(1n, 4, { content: 'The keeper stops counting.' });

    expect(fake.draft).toMatchObject({ body: 'The keeper stops counting.', words: 4, revision: 5 });
    expect(fake.chapter.content).toBe('The keeper stops counting.');
    expect(fake.revisions.map(revision => revision.revision)).toEqual([3, 4, 5]);
  });

  it('should number past history an earlier amend filed above the draft counter', async () => {
    const fake = amendFake({ revisions: [{ draftId: 11n, revision: 6, source: 'amended', body: 'An older amendment.' }] });

    await fake.service.amend(1n, 4, { content: AMENDED_PROSE });

    expect(fake.draft?.revision).toBe(7);
    expect(fake.revisions.at(-1)).toMatchObject({ revision: 7, body: AMENDED_PROSE });
  });

  it('should keep an isolated chapter and its draft contained', async () => {
    const fake = amendFake({ chapter: { isolated: true, generator: 'unrestricted' }, draft: { isolated: true, generator: 'unrestricted' } });

    const result = await fake.service.amend(1n, 4, { content: AMENDED_PROSE });

    expect(result.indexed).toBe(false);
    expect(fake.draft).toMatchObject({ body: AMENDED_PROSE, isolated: true, generator: 'unrestricted' });
    expect(fake.chapter).toMatchObject({ isolated: true, generator: 'unrestricted' });
    for (const write of [...fake.writesTo(schema.drafts), ...fake.writesTo(schema.chapters)]) {
      expect(write.values).not.toContainKey('isolated');
      expect(write.values).not.toContainKey('generator');
    }
  });

  it('should leave the draft title and rating alone when the amend omits them, and mirror them when it sets them', async () => {
    const kept = amendFake({ draft: { contentRating: { violence: 'mild' } }, chapter: { contentRating: { violence: 'mild' } } });
    await kept.service.amend(1n, 4, { content: AMENDED_PROSE });
    expect(kept.writesTo(schema.drafts)[0]!.values).not.toContainKey('title');
    expect(kept.writesTo(schema.drafts)[0]!.values).not.toContainKey('contentRating');
    expect(kept.draft).toMatchObject({ title: 'Low Water', contentRating: { violence: 'mild' } });

    const cleared = amendFake({ draft: { contentRating: { violence: 'mild' } }, chapter: { contentRating: { violence: 'mild' } } });
    await cleared.service.amend(1n, 4, { content: AMENDED_PROSE, contentRating: {} });
    expect(cleared.draft?.contentRating).toBeNull();
    expect(cleared.chapter.contentRating).toBeNull();
  });

  it('should roll the whole amend back when the final draft moved underneath it', async () => {
    const fake = amendFake({ refuseDraftWrite: true });

    await expect(fake.service.amend(1n, 4, { content: AMENDED_PROSE })).rejects.toMatchObject({ code: 'DRF_013' });

    expect(fake.chapter.content).toBe(FINAL_PROSE);
    expect(fake.draft).toMatchObject({ body: FINAL_PROSE, revision: 3, judge: 'consistent' });
    expect(fake.revisions).toEqual([]);
  });

  it('should amend the chapter alone when it has no final draft', async () => {
    for (const draft of [null, { status: 'draft' as const }]) {
      const fake = amendFake({ draft });

      await fake.service.amend(1n, 4, { content: AMENDED_PROSE });

      expect(fake.chapter.content).toBe(AMENDED_PROSE);
      expect(fake.writesTo(schema.drafts)).toEqual([]);
      expect(fake.writesTo(schema.draftRevisions)).toEqual([]);
    }
  });

  it('should refuse a chapter that is not finalized', async () => {
    const fake = amendFake({ chapter: { status: 'pending' } });

    await expect(fake.service.amend(1n, 4, { content: AMENDED_PROSE })).rejects.toMatchObject({ code: 'CHP_006' });
    expect(fake.writesTo(schema.drafts)).toEqual([]);
  });

  it('should extract canon from the amended prose afterwards', async () => {
    const fake = amendFake();
    const prompts: { chapterProse?: string }[] = [];
    const modelRouter = {
      structured: async (_module: unknown, vars: { chapterProse?: string }) => {
        prompts.push(vars);
        return { summary: 'Two ships', changeSet: [{ op: 'entity.upsert', entityKey: 'keeper' }] };
      },
      resolveFor: async () => ({ model: 'fake-extractor' }),
    };
    const generation = makeGenerationService(fake.db, {
      modelRouter,
      contextAssembler: { forChapter: async () => ({ rendered: '' }) },
      pluginPolicy: { resolve: async () => ({}) },
      proposalService: { create: async () => ({ id: 1n }) },
    });

    await fake.service.amend(1n, 4, { content: AMENDED_PROSE });
    await generation.extractChapterToBible(1n, 4);

    expect(prompts.map(vars => vars.chapterProse)).toEqual([AMENDED_PROSE]);
  });
});
