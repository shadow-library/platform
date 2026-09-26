import { describe, expect, it } from 'bun:test';

import { GenerationService } from '@modules/generation/generation.service';

import { queryRows } from '../sql-filter';

interface GateFixture {
  briefs?: { chapter: number; writeMode: 'standard' | 'external'; staleReason: string | null }[];
  drafted?: number[];
  finalized?: number[];
  draftStatus?: 'draft' | 'final';
  activeJob?: boolean;
  contradiction?: boolean;
}

const plan = (chapter: number) => ({ chapter, writeMode: 'standard' as const, staleReason: null });

function makeService(fixture: GateFixture = {}) {
  const briefs = fixture.briefs ?? [plan(1)];
  const enqueued: unknown[][] = [];
  const db = {
    query: {
      projects: { findFirst: async () => ({ id: 1n }) },
      briefs: { findFirst: async () => briefs[0], findMany: async () => briefs },
      drafts: {
        findFirst: async (query: { columns?: Record<string, boolean> }) => {
          if (query.columns && 'id' in query.columns) return fixture.drafted?.length ? { id: 1n } : undefined;
          if (query.columns && 'status' in query.columns) return fixture.draftStatus ? { status: fixture.draftStatus } : undefined;
          return fixture.contradiction ? { chapter: 7 } : undefined;
        },
        findMany: async () => (fixture.drafted ?? []).map(chapter => ({ chapter })),
      },
      jobs: { findFirst: async () => (fixture.activeJob ? { id: 'job-0', status: 'in_progress', target: '1' } : undefined) },
      chapters: { findMany: async () => (fixture.finalized ?? []).map(number => ({ number })) },
    },
  };
  const jobService = { enqueue: async (...args: unknown[]) => (enqueued.push(args), 'job-1') };
  const jobExecutor = { dispatch: async () => undefined };
  const noop = {} as never;
  const service = new GenerationService(
    { getPostgresClient: () => db } as never,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    jobService as never,
    jobExecutor as never,
    noop,
    noop,
    noop,
    noop,
  );
  return { service, enqueued };
}

describe('GenerationService.generate', () => {
  it('should draft the next planned chapter in a project with no volumes at all', async () => {
    const { service, enqueued } = makeService();

    const result = await service.generate(1n, {});

    expect(result).toMatchObject({ jobId: 'job-1', kind: 'generate', target: '1' });
    expect(enqueued).toEqual([[1n, 'generate', '1', expect.objectContaining({ chapters: [1] })]]);
  });

  it('should refuse a stale plan', async () => {
    const { service, enqueued } = makeService({ briefs: [{ chapter: 1, writeMode: 'standard', staleReason: 'volume_changed' }] });

    await expect(service.generate(1n, {})).rejects.toMatchObject({ code: 'BRF_002' });
    expect(enqueued).toEqual([]);
  });

  it('should refuse while a contradiction elsewhere is unresolved', async () => {
    const { service } = makeService({ contradiction: true });

    await expect(service.generate(1n, {})).rejects.toMatchObject({ code: 'DRF_003' });
  });

  it('should refuse a project with no plan for any chapter', async () => {
    const { service } = makeService({ briefs: [] });

    await expect(service.generate(1n, {})).rejects.toMatchObject({ code: 'BRF_001' });
  });

  it('should refuse to skip ahead to a planned chapter over unwritten ones', async () => {
    const { service, enqueued } = makeService({ briefs: [plan(1), plan(12)], drafted: [1], finalized: [1] });

    await expect(service.generate(1n, {})).rejects.toMatchObject({
      code: 'DRF_011',
      message: 'Chapter 12 cannot be generated before chapter 2 is drafted — chapters are generated in order',
    });
    expect(enqueued).toEqual([]);
  });

  it('should refuse to write past a hole further back than the chapter before', async () => {
    const { service } = makeService({ briefs: [plan(11)], drafted: [1, 2, 3, 10], finalized: [1, 2, 3] });

    await expect(service.generate(1n, {})).rejects.toMatchObject({ code: 'DRF_011', message: expect.stringContaining('before chapter 4') });
  });

  it('should say where a batch stopped short at an unwritten chapter', async () => {
    const { service, enqueued } = makeService({ briefs: [plan(1), plan(2), plan(5)] });

    const result = await service.generate(1n, { limit: 5 });

    expect(result).toMatchObject({ target: '1,2', stoppedAtUnwrittenChapter: 3 });
    expect(enqueued).toHaveLength(1);
  });

  it('should continue an imported novel whose finalized chapters have no plans', async () => {
    const { service, enqueued } = makeService({ briefs: [plan(4)], finalized: [1, 2, 3] });

    await service.generate(1n, {});

    expect(enqueued).toEqual([[1n, 'generate', '4', expect.objectContaining({ chapters: [4] })]]);
  });
});

describe('GenerationService.regenerateChapter', () => {
  it('should draft the named chapter in a project with no volumes at all', async () => {
    const { service, enqueued } = makeService();

    const result = await service.regenerateChapter(1n, 1);

    expect(result).toMatchObject({ jobId: 'job-1', target: '1' });
    expect(enqueued).toHaveLength(1);
  });

  it('should refuse a final chapter', async () => {
    const { service, enqueued } = makeService({ draftStatus: 'final' });

    await expect(service.regenerateChapter(1n, 1)).rejects.toMatchObject({ code: 'CHP_008' });
    expect(enqueued).toEqual([]);
  });

  it('should refuse a chapter with no plan', async () => {
    const { service } = makeService({ briefs: [] });

    await expect(service.regenerateChapter(1n, 1)).rejects.toMatchObject({ code: 'BRF_001' });
  });

  it('should refuse a finalized chapter even when it has no draft', async () => {
    const { service, enqueued } = makeService({ briefs: [plan(2)], finalized: [1, 2] });

    await expect(service.regenerateChapter(1n, 2)).rejects.toMatchObject({ code: 'CHP_008' });
    expect(enqueued).toEqual([]);
  });

  it('should refuse a chapter written over an unwritten one', async () => {
    const { service } = makeService({ briefs: [plan(5)], finalized: [1, 2, 3] });

    await expect(service.regenerateChapter(1n, 5)).rejects.toMatchObject({ code: 'DRF_011' });
  });
});

describe('GenerationService.generateChapter', () => {
  it('should refuse a chapter that already has a draft, leaving its replacement to the author', async () => {
    const { service, enqueued } = makeService({ drafted: [1] });

    await expect(service.generateChapter(1n, 1)).rejects.toMatchObject({ code: 'DRF_015' });
    expect(enqueued).toEqual([]);
  });

  it('should draft a planned chapter that has no draft yet', async () => {
    const { service, enqueued } = makeService();

    await service.generateChapter(1n, 1);

    expect(enqueued).toHaveLength(1);
  });
});

describe('GenerationService.updateBrief', () => {
  function briefDb(existing: Record<string, unknown> | undefined, planned: Record<string, unknown>[]) {
    const inserted: Record<string, unknown>[] = [];
    const rows = planned.map(row => ({ projectId: 1n, ...row }));
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ for: async () => (existing ? [existing] : []) }) }) }),
      query: { briefs: { findFirst: async (query: Parameters<typeof queryRows>[1]) => queryRows(rows, query)[0] } },
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          inserted.push(values);
          return { onConflictDoUpdate: () => ({ returning: async () => [{ ...existing, ...values }] }) };
        },
      }),
    };
    const db = { transaction: async (run: (handle: unknown) => Promise<unknown>) => run(tx) };
    const noop = {} as never;
    const service = new GenerationService({ getPostgresClient: () => db } as never, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
    return { service, inserted };
  }

  it('should put a new hand-written plan in the volume of the nearest earlier plan', async () => {
    const planned = [
      { chapter: 2, volumeKey: 'volume_1' },
      { chapter: 4, volumeKey: 'volume_2' },
    ];
    const { service, inserted } = briefDb(undefined, planned);

    await service.updateBrief(1n, 3, { body: 'Ada hides the slip.' });

    expect(inserted[0]).toMatchObject({ chapter: 3, volumeKey: 'volume_1' });
  });

  it('should leave the volume of an existing plan alone', async () => {
    const { service, inserted } = briefDb({ id: 1n, chapter: 3, volumeKey: null, revision: 2 }, [{ chapter: 2, volumeKey: 'volume_1' }]);

    await service.updateBrief(1n, 3, { body: 'Ada hides the slip.' });

    expect(inserted[0]).toMatchObject({ chapter: 3, volumeKey: null });
  });
});
