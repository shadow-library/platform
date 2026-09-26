import { describe, expect, it } from 'bun:test';

import { PRODUCTION_DEFAULTS, UNRESTRICTED_DEFAULTS } from '@modules/ai/defaults';
import { SummaryConflictError } from '@server/classes';
import { schema } from '@server/database';

import { type DraftRow, draftRow, fakeGenerationDb, makeGenerationService } from './generation-fixtures';

const SUMMARY = 'The keeper counted the ships twice and told no one.';

function withSummary(overrides: Partial<DraftRow> = {}, summary: string | null = null) {
  return { ...draftRow(overrides), summary };
}

function summarizingRouter(summary = SUMMARY) {
  const calls: unknown[] = [];
  return {
    calls,
    modelRouter: {
      structured: async (_module: unknown, input: unknown) => {
        calls.push(input);
        return { summary, state: { lastBeat: 'counted' } };
      },
      resolveModel: (role: string, project?: { contentMode?: string }) =>
        project?.contentMode === 'unrestricted' ? UNRESTRICTED_DEFAULTS[role as 'continuity'] : PRODUCTION_DEFAULTS[role as 'continuity'],
    },
    pluginPolicy: {
      resolve: async (_projectId: bigint, _call: unknown, baseline?: { contentMode?: string | null }) => ({
        writerClass: baseline?.contentMode === 'unrestricted' ? 'permissive' : 'standard',
        raised: false,
      }),
    },
  };
}

function withActiveGenerateJob(draft: DraftRow) {
  return {
    query: {
      drafts: { findFirst: async () => draft },
      projects: { findFirst: async () => ({ id: 1n, contentMode: 'standard' }) },
      briefs: { findFirst: async () => undefined },
      jobs: { findMany: async () => [{ target: String(draft.chapter) }] },
    },
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run({}),
  };
}

describe('GenerationService.summarizeChapter', () => {
  it('should summarize a hand-written draft and save the summary without bumping its revision', async () => {
    const draft = withSummary({ generator: 'human', body: 'The keeper counts the ships.', revision: 2, saveSeq: 3 });
    const fake = fakeGenerationDb({ draftReads: [draft, draft] });
    const { modelRouter, pluginPolicy } = summarizingRouter();
    const service = makeGenerationService(fake.db, { modelRouter, pluginPolicy });

    const result = await service.summarizeChapter(1n, 4);

    expect(result).toEqual({ summary: SUMMARY, saveSeq: 4, state: { lastBeat: 'counted' } });
    const [write] = fake.writesTo(schema.drafts, 'update');
    expect(write?.values).toMatchObject({ summary: SUMMARY, saveSeq: 4 });
    expect(write?.values).not.toHaveProperty('revision');
    expect(write?.values).not.toHaveProperty('reviewStatus');
    expect(fake.writesTo(schema.chapters)).toEqual([]);
  });

  it('should also update the chapter row when the draft is already final', async () => {
    const draft = withSummary({ status: 'final', generator: 'human', body: 'The keeper counts the ships.' }, 'stale');
    const fake = fakeGenerationDb({ draftReads: [draft, draft] });
    const { modelRouter, pluginPolicy } = summarizingRouter();
    const service = makeGenerationService(fake.db, { modelRouter, pluginPolicy });

    await service.summarizeChapter(1n, 4);

    const [chapterWrite] = fake.writesTo(schema.chapters, 'update');
    expect(chapterWrite?.values).toMatchObject({ summary: SUMMARY });
  });

  it('should return the summary and continuation state unsaved for an isolated draft', async () => {
    const draft = draftRow({ isolated: true, body: 'ISOLATED_MARKER prose.' });
    const fake = fakeGenerationDb({ draftReads: [draft] });
    const { modelRouter, pluginPolicy } = summarizingRouter();
    const service = makeGenerationService(fake.db, { modelRouter, pluginPolicy });

    const result = await service.summarizeChapter(1n, 4);

    expect(result).toEqual({ summary: SUMMARY, state: { lastBeat: 'counted' } });
    expect(fake.writesTo(schema.drafts, 'update')).toEqual([]);
    expect(fake.writesTo(schema.chapters)).toEqual([]);
  });

  it('should refuse to summarize a draft with no prose yet', async () => {
    const draft = draftRow({ body: '' });
    const fake = fakeGenerationDb({ draftReads: [draft] });
    const { modelRouter, pluginPolicy } = summarizingRouter();
    const service = makeGenerationService(fake.db, { modelRouter, pluginPolicy });

    await expect(service.summarizeChapter(1n, 4)).rejects.toMatchObject({ code: 'CHP_007' });
  });

  it('should refuse to summarize a draft that is still being generated', async () => {
    const draft = { ...draftRow(), reviewStatus: 'generating' };
    const fake = fakeGenerationDb({ draftReads: [draft] });
    const { modelRouter, pluginPolicy } = summarizingRouter();
    const service = makeGenerationService(fake.db, { modelRouter, pluginPolicy });

    await expect(service.summarizeChapter(1n, 4)).rejects.toMatchObject({ code: 'DRF_019' });
  });

  it('should refuse to summarize while a generate job targets the chapter', async () => {
    const draft = draftRow();
    const { modelRouter, pluginPolicy } = summarizingRouter();
    const service = makeGenerationService(withActiveGenerateJob(draft), { modelRouter, pluginPolicy });

    await expect(service.summarizeChapter(1n, 4)).rejects.toMatchObject({ code: 'DRF_019' });
  });

  it('should refuse to save, carrying the computed summary, when the prose moved since it was read', async () => {
    const original = draftRow({ body: 'Original prose.' });
    const moved = draftRow({ body: 'Someone rewrote this in the meantime.' });
    const fake = fakeGenerationDb({ draftReads: [original, moved] });
    const { modelRouter, pluginPolicy } = summarizingRouter();
    const service = makeGenerationService(fake.db, { modelRouter, pluginPolicy });

    const error = await service.summarizeChapter(1n, 4).then(
      () => undefined,
      (rejection: unknown) => rejection,
    );

    expect(error).toBeInstanceOf(SummaryConflictError);
    expect((error as SummaryConflictError).toResponse()).toMatchObject({ code: 'DRF_013', attemptedSummary: SUMMARY });
    expect(fake.writesTo(schema.drafts, 'update')).toEqual([]);
  });

  it('should not refuse a save merely because the revision or saveSeq drifted between the two reads, as long as the body is unchanged', async () => {
    const read = draftRow({ id: 11n, revision: 2, saveSeq: 3, body: 'The keeper counts the ships.' });
    const current = draftRow({ id: 11n, revision: 9, saveSeq: 40, body: 'The keeper counts the ships.' });
    const fake = fakeGenerationDb({ draftReads: [read, current] });
    const { modelRouter, pluginPolicy } = summarizingRouter();
    const service = makeGenerationService(fake.db, { modelRouter, pluginPolicy });

    const result = await service.summarizeChapter(1n, 4);

    expect(result).toMatchObject({ summary: SUMMARY, saveSeq: 41 });
  });

  it('should answer a deadlock during the save with the distinct retryable conflict', async () => {
    const draft = draftRow();
    const { modelRouter, pluginPolicy } = summarizingRouter();
    const db = {
      query: {
        drafts: { findFirst: async () => draft },
        projects: { findFirst: async () => ({ id: 1n, contentMode: 'standard' }) },
        briefs: { findFirst: async () => undefined },
        jobs: { findMany: async () => [] },
      },
      transaction: async () => Promise.reject({ code: '40P01' }),
    };
    const service = makeGenerationService(db, { modelRouter, pluginPolicy });

    await expect(service.summarizeChapter(1n, 4)).rejects.toMatchObject({ code: 'DRF_021' });
  });
});

describe('GenerationService.updateSummary', () => {
  it("should save the author's own summary without a body guard", async () => {
    const draft = withSummary({ generator: 'human', body: 'The keeper counts the ships.', saveSeq: 3 });
    const fake = fakeGenerationDb({ draftReads: [draft] });
    const service = makeGenerationService(fake.db);

    const saved = await service.updateSummary(1n, 4, { summary: 'The author wrote this by hand.' });

    expect(saved).toMatchObject({ summary: 'The author wrote this by hand.', saveSeq: 4 });
    const [write] = fake.writesTo(schema.drafts, 'update');
    expect(write?.values).toMatchObject({ summary: 'The author wrote this by hand.' });
  });

  it('should save the summary on a final chapter, updating the committed chapter row too', async () => {
    const draft = withSummary({ status: 'final', body: 'The keeper counts the ships.' }, 'stale');
    const fake = fakeGenerationDb({ draftReads: [draft] });
    const service = makeGenerationService(fake.db);

    await service.updateSummary(1n, 4, { summary: 'A better summary after the fact.' });

    const [chapterWrite] = fake.writesTo(schema.chapters, 'update');
    expect(chapterWrite?.values).toMatchObject({ summary: 'A better summary after the fact.' });
  });

  it('should refuse a base that no longer matches the draft', async () => {
    const current = draftRow({ id: 11n, revision: 2, saveSeq: 5 });
    const fake = fakeGenerationDb({ draftReads: [current] });
    const service = makeGenerationService(fake.db);

    await expect(service.updateSummary(1n, 4, { summary: 'x', baseDraftId: 11n, baseRevision: 2, baseSaveSeq: 3 })).rejects.toMatchObject({ code: 'DRF_013' });
    expect(fake.writesTo(schema.drafts, 'update')).toEqual([]);
  });
});
