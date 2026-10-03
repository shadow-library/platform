import { describe, expect, it } from 'bun:test';

import { type ChapterCanonRefreshOutput } from '@modules/ai/schemas';
import { type RefreshRows, renderRefreshMaterial } from '@modules/audit/bible-audit-material';
import {
  buildCanonRefreshReport,
  type CanonRefreshReportInput,
  NEW_RECORD_WITHHELD,
  PLAN_PAGE_WITHHELD,
  SECRET_WITHHELD,
  UNREAD_WITHHELD,
} from '@modules/audit/bible-audit-report';
import { ChapterCanonRefreshService } from '@modules/audit/chapter-canon-refresh.service';
import { type FactLike } from '@modules/bible/fact/knowledge-view';
import { schema } from '@server/database';

const CHAPTER_FIVE = {
  number: 5,
  title: 'Ashes',
  summary: 'The fire takes the harbour.',
  content: 'By dawn the harbour of Saltgate was ash, and not one lantern was left standing on the quay.',
};
const GEOGRAPHY = { section: 'world' as const, slug: 'geography', body: 'The harbour of Saltgate keeps ten lanterns lit every night.', revision: 1 };
const VOLUME_PLAN = { section: 'story_state' as const, slug: 'volume-plan', body: 'Volume two rebuilds the harbour.', revision: 1 };
const MARA = { entityKey: 'mara', type: 'character' as const, name: 'Mara', status: 'harbour watch', motivation: null, notes: null, body: null };
const SECRET: FactLike = { factKey: 'lamp_heir', text: 'Mara is the lamp-keeper’s lost heir.', terms: ['lost heir'], source: 'manual' };
const SECRET_FACT = {
  factKey: 'lamp_heir',
  text: SECRET.text,
  writerNote: null,
  terms: ['lost heir'],
  allowedClues: null,
  revealChapter: 9,
  disclosedInChapter: null,
  source: 'manual' as const,
};
const ASH_QUOTE = { ref: 'chapter:5', quote: 'the harbour of Saltgate was ash' };
const ASHEN_GEOGRAPHY = { op: 'bible_document.upsert', section: 'world', slug: 'geography', body: 'The harbour of Saltgate burned in the fire; no lantern stands on the quay.' };
const BURNED: ChapterCanonRefreshOutput = {
  updates: [{ finding: 'Chapter 5 burned the harbour; the geography page still has its lanterns lit.', evidence: [ASH_QUOTE], changeSet: [ASHEN_GEOGRAPHY] }],
};

const SOURCES = new Map([
  ['doc:world/geography', GEOGRAPHY.body],
  ['entity:mara', 'name: Mara\ntype: character\nstatus: harbour watch'],
  ['chapter:5', `${CHAPTER_FIVE.title}\n\n${CHAPTER_FIVE.summary}\n\n${CHAPTER_FIVE.content}`],
]);

function build(refresh: ChapterCanonRefreshOutput, overrides: Partial<CanonRefreshReportInput> = {}) {
  return buildCanonRefreshReport({
    refresh,
    chapterRef: 'chapter:5',
    sources: SOURCES,
    partial: new Set(),
    existingRefs: new Set(['doc:world/geography', 'doc:story_state/volume-plan', 'entity:mara']),
    current: new Map(),
    secrets: [SECRET],
    ...overrides,
  });
}

function update(ops: Record<string, unknown>[], evidence = [ASH_QUOTE]): ChapterCanonRefreshOutput {
  return { updates: [{ finding: 'The chapter changed this.', evidence, changeSet: ops }] };
}

describe('buildCanonRefreshReport', () => {
  it('should stage an update the chapter’s own words ground as a revision of the page', () => {
    const { findings, changeSet } = build(BURNED);

    expect(findings).toMatchObject([{ id: 'f1', group: 'revise', ref: 'doc:world/geography', opIndexes: [0], withheld: null, evidence: [ASH_QUOTE] }]);
    expect(changeSet).toEqual([ASHEN_GEOGRAPHY as never]);
  });

  it('should drop an update the chapter’s words do not bear out', () => {
    const unfounded = update([ASHEN_GEOGRAPHY], [{ ref: 'chapter:5', quote: 'the harbour was rebuilt in marble' }]);

    expect(build(unfounded)).toEqual({ findings: [], changeSet: [] });
  });

  it('should stage nothing when the chapter left the Story Bible as it was', () => {
    expect(build({ updates: [] })).toEqual({ findings: [], changeSet: [] });
  });

  it('should never change a plan page', () => {
    const { findings, changeSet } = build(update([{ op: 'bible_document.upsert', section: 'story_state', slug: 'volume-plan', body: 'The harbour is gone.' }]));

    expect(findings).toMatchObject([{ opIndexes: [], withheld: PLAN_PAGE_WITHHELD }]);
    expect(changeSet).toEqual([]);
  });

  it('should leave new records to the finalize review but stage a new page', () => {
    const { findings } = build(
      update([
        { op: 'entity.upsert', entityKey: 'ash_wardens', type: 'faction', name: 'Ash Wardens' },
        { op: 'bible_document.upsert', section: 'world', slug: 'the-burning', body: 'The harbour of Saltgate was ash by dawn.' },
      ]),
    );

    expect(findings).toMatchObject([{ group: 'add', opIndexes: [0], withheld: NEW_RECORD_WITHHELD }]);
  });

  it('should not rewrite a page it read only in part, nor one it never read', () => {
    expect(build(BURNED, { partial: new Set(['doc:world/geography']) }).findings).toMatchObject([{ opIndexes: [], withheld: UNREAD_WITHHELD }]);
    expect(build(BURNED, { sources: new Map([['chapter:5', SOURCES.get('chapter:5') ?? '']]) }).findings).toMatchObject([{ opIndexes: [], withheld: UNREAD_WITHHELD }]);
  });

  it('should keep a secret’s truth off the card even when the chapter hints at it', () => {
    const { findings, changeSet } = build(update([{ op: 'entity.upsert', entityKey: 'mara', type: 'character', notes: 'Mara is the lamp-keeper’s lost heir.' }]));

    expect(findings).toMatchObject([{ opIndexes: [], withheld: SECRET_WITHHELD }]);
    expect(changeSet).toEqual([]);
  });
});

describe('renderRefreshMaterial', () => {
  const rows: RefreshRows = {
    documents: [GEOGRAPHY, VOLUME_PLAN],
    entities: [MARA],
    facts: [SECRET_FACT],
    chapter: CHAPTER_FIVE,
    reviewItems: [
      { claim: 'Mara: now commands the harbour watch', decision: 'kept' },
      { claim: 'Kael appears in this chapter', decision: 'skipped' },
    ],
  };

  it('should read the chapter, the author’s review answers and the pages the writer reads, leaving plan pages out', () => {
    const material = renderRefreshMaterial(rows);

    expect(material.bible).toContain('[doc:world/geography]');
    expect(material.bible).not.toContain('volume-plan');
    expect(material.bible).toContain('SECRET — the reader has not been told.');
    expect(material.chapter).toContain(`[chapter:5]\nAshes\n\nThe fire takes the harbour.\n\n${CHAPTER_FIVE.content}`);
    expect(material.chapter).toContain('## Updates the author kept from its review\n\n- Mara: now commands the harbour watch');
    expect(material.chapter).toContain('## Updates the author declined\n\n- Kael appears in this chapter');
    expect([...material.sources.keys()]).toEqual(['doc:world/geography', 'entity:mara', 'fact:lamp_heir', 'chapter:5']);
  });

  it('should claim only what it read, scoped to the one chapter', () => {
    const { checked } = renderRefreshMaterial(rows);

    expect(checked.passes).toEqual({ chapter: 'ran' });
    expect(checked.chapters).toEqual({ from: 5, to: 5, count: 1 });
    expect(checked.copy).toBe('Checked against chapter 5: 1 page, 1 character, 1 fact.');
  });

  it('should mark a page it read only in part', () => {
    const long = { ...GEOGRAPHY, body: `${'The quay is long. '.repeat(600)}The end.` };

    const material = renderRefreshMaterial({ ...rows, documents: [long] });

    expect(material.partial).toEqual(new Set(['doc:world/geography']));
    expect(material.checked.copy).toContain('1 page was too long and only partly read.');
  });
});

interface HarnessOptions {
  output?: ChapterCanonRefreshOutput | Error;
  chapter?: Record<string, unknown> | null;
  existingReport?: { id: bigint; proposalId: bigint | null };
}

function refreshHarness(options: HarnessOptions = {}) {
  const reports: Record<string, unknown>[] = [];
  const staged: Record<string, unknown>[] = [];
  const progress: Record<string, unknown>[] = [];
  const prompts: Record<string, unknown>[] = [];
  let handler: ((job: object) => Promise<void>) | undefined;
  const chapterRow = options.chapter === undefined ? { ...CHAPTER_FIVE, isolated: false } : options.chapter;

  const db = {
    query: {
      projects: { findFirst: async () => ({ id: 1n, contentMode: 'standard' }) },
      validationReports: { findFirst: async () => options.existingReport ?? (reports[0] as never) },
      chapters: { findFirst: async () => chapterRow ?? undefined },
      bibleDocuments: { findMany: async () => [GEOGRAPHY, VOLUME_PLAN] },
      entities: { findMany: async () => [MARA] },
      canonFacts: { findMany: async () => [SECRET_FACT] },
      finalizeReviews: { findFirst: async () => ({ id: 3n }) },
      finalizeReviewItems: { findMany: async () => [{ claim: 'Mara: now commands the harbour watch', decision: 'kept' }] },
    },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (table !== schema.validationReports) return [];
          const report = { id: 21n, ...values };
          reports.push(report);
          return [{ id: report.id }];
        },
      }),
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  const service = new ChapterCanonRefreshService(
    { getPostgresClient: () => db } as never,
    { runChain: async (_p: bigint, _g: string, _t: string, _i: unknown, fn: (runId: string) => Promise<unknown>) => ({ runId: 'run-1', result: await fn('run-1') }) } as never,
    {
      bindRunSignal: () => new AbortController().signal,
      structured: async (_prompt: unknown, input: Record<string, unknown>) => {
        prompts.push(input);
        if (options.output instanceof Error) throw options.output;
        return options.output ?? BURNED;
      },
    } as never,
    { resolve: async () => ({ writerClass: 'standard' }) } as never,
    { create: async (_projectId: bigint, input: Record<string, unknown>) => (staged.push(input), { id: 40n, status: 'pending' }) } as never,
    { progress: async (_jobId: string, value: Record<string, unknown>) => void progress.push(value) } as never,
    { register: (_kind: string, registered: (job: object) => Promise<void>) => void (handler = registered) } as never,
  );
  service.onModuleInit();
  const runJob = (payload: unknown) => handler?.({ id: 'job-1', projectId: 1n, kind: 'canon_refresh', target: 'chapter-5', payload, attempts: 0 }) ?? Promise.resolve();
  return { service, reports, staged, progress, prompts, runJob };
}

describe('ChapterCanonRefreshService', () => {
  it('should stage the pages the chapter left out of date as one pending audit card and store its report against the chapter', async () => {
    const { runJob, reports, staged, progress } = refreshHarness();

    await runJob({ chapter: 5 });

    expect(staged).toMatchObject([
      { kind: 'bible_audit', scopeType: 'novel', changeSet: [ASHEN_GEOGRAPHY], allowedOps: ['bible_document.upsert', 'entity.upsert'], runId: 'run-1' },
    ]);
    expect(reports).toMatchObject([{ scope: 'bible', chapter: 5, issues: 1, proposalId: 40n, runId: 'run-1', checked: { passes: { chapter: 'ran' } } }]);
    expect(reports[0]?.['summary']).toBe('Chapter 5: 1 finding: 1 to revise. Checked against chapter 5: 1 page, 1 character, 1 fact.');
    expect(progress.at(-1)).toEqual({ done: 1, total: 1, current: '5', phase: 'staged', proposalId: '40' });
  });

  it('should read only the finalized chapter it was queued for', async () => {
    const { runJob, prompts } = refreshHarness();

    await runJob({ chapter: 5 });

    expect(prompts[0]?.['chapterProse']).toContain('[chapter:5]');
    expect(prompts[0]?.['chapterProse']).toContain('- Mara: now commands the harbour watch');
    expect(prompts[0]?.['material']).not.toContain('volume-plan');
  });

  it('should stage nothing and store no report when the chapter changed nothing on the pages', async () => {
    const { runJob, reports, staged, progress } = refreshHarness({ output: { updates: [] } });

    await runJob({ chapter: 5 });

    expect([reports, staged]).toEqual([[], []]);
    expect(progress.at(-1)).toEqual({ done: 1, total: 1, current: '5', phase: 'unchanged' });
  });

  it('should answer a second run from the report the first stored, without asking the model again', async () => {
    const { runJob, prompts, staged, progress } = refreshHarness({ existingReport: { id: 9n, proposalId: 31n } });

    await runJob({ chapter: 5 });

    expect([prompts, staged]).toEqual([[], []]);
    expect(progress).toEqual([{ done: 1, total: 1, current: '5', phase: 'already_refreshed', proposalId: '31' }]);
  });

  it('should not stage the same chapter twice when the job runs again', async () => {
    const { service, staged } = refreshHarness();

    await service.refresh(1n, 5, 'job-1');
    await expect(service.refresh(1n, 5, 'job-1')).resolves.toMatchObject({ outcome: 'already_refreshed', proposalId: 40n });

    expect(staged).toHaveLength(1);
  });

  it('should never read an isolated chapter, nor one that is not final', async () => {
    const isolated = refreshHarness({ chapter: { ...CHAPTER_FIVE, isolated: true } });
    const unwritten = refreshHarness({ chapter: null });

    await expect(isolated.service.refresh(1n, 5)).resolves.toEqual({ outcome: 'isolated' });
    await expect(unwritten.service.refresh(1n, 5)).resolves.toEqual({ outcome: 'not_final' });
    expect([isolated.prompts, unwritten.prompts]).toEqual([[], []]);
  });

  it('should fail only its own job when the model fails, storing nothing', async () => {
    const { runJob, reports, staged } = refreshHarness({ output: new Error('model unavailable') });

    await expect(runJob({ chapter: 5 })).rejects.toThrow('model unavailable');
    expect([reports, staged]).toEqual([[], []]);
  });

  it('should refuse a job that names no chapter', async () => {
    const { runJob } = refreshHarness();

    await expect(runJob({})).rejects.toThrow('names no chapter');
  });
});
