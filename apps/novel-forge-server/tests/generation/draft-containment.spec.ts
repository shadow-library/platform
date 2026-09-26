import { describe, expect, it } from 'bun:test';

import { PRODUCTION_DEFAULTS, type ResolvedModel, UNRESTRICTED_DEFAULTS } from '@modules/ai/defaults';
import { AppErrorCode } from '@server/classes';
import { schema } from '@server/database';

import { type DraftRow, draftRow, fakeGenerationDb, makeGenerationService } from './generation-fixtures';

const REVISED = { title: 'The Tide Clerk', body: 'The keeper counts the ships twice and writes neither number down.', summary: 'The keeper hides the count.' };
const ISOLATED = { isolated: true, generator: 'human' } as const;

interface RoutedCall {
  role: string;
  project?: { contentMode?: string };
  policy?: { writerClass: string };
}

interface SetupOptions {
  draft: DraftRow;
  raised?: boolean;
  unrestrictedModel?: ResolvedModel;
  /** The writer's required material is over its limits, so an enforcing pack request fails. */
  overCaps?: boolean;
}

function setup({ draft, raised = false, unrestrictedModel, overCaps = false }: SetupOptions) {
  const fake = fakeGenerationDb({ draftReads: [draft], draftWriteResult: [{ ...draft, revision: draft.revision + 1 }] });
  const policyBaselines: (string | null | undefined)[] = [];
  const modelCalls: RoutedCall[] = [];
  const resolveModel = (role: string, project?: { contentMode?: string }) =>
    project?.contentMode === 'unrestricted' ? (unrestrictedModel ?? UNRESTRICTED_DEFAULTS[role as 'revision']) : PRODUCTION_DEFAULTS[role as 'revision'];

  const service = makeGenerationService(fake.db, {
    modelRouter: {
      resolveModel,
      structured: async (module: { role?: string; key: string }, _input: unknown, _ctx: unknown, project?: RoutedCall['project'], policy?: RoutedCall['policy']) => {
        modelCalls.push({ role: module.role ?? module.key, project, policy });
        return REVISED;
      },
    },
    contextAssembler: {
      forChapter: async (_projectId: bigint, _chapter: number, opts?: { enforceWriterReservations?: boolean }) => {
        if (overCaps && opts?.enforceWriterReservations) throw AppErrorCode.CTX_002.create({ detail: 'the chapter plan is over its limit' });
        return { rendered: '' };
      },
    },
    pluginPolicy: {
      resolve: async (_projectId: bigint, _call: unknown, baseline?: { contentMode?: string | null }) => {
        policyBaselines.push(baseline?.contentMode);
        const permissive = baseline?.contentMode === 'unrestricted';
        return { writerClass: permissive || raised ? 'permissive' : 'standard', raised: raised && !permissive };
      },
    },
  });

  return {
    service,
    modelCalls,
    policyBaselines,
    proseUpdate: () => fake.writesTo(schema.drafts, 'update').find(write => write.values && 'body' in write.values),
    writes: () => fake.writes,
  };
}

describe('GenerationService.reviseDraft containment', () => {
  it('should revise an isolated draft on the unrestricted route and keep it isolated with its provenance', async () => {
    const run = setup({ draft: draftRow(ISOLATED) });

    await run.service.reviseDraft(1n, 4, { note: 'Tighten the ending.' });

    expect(run.policyBaselines).toEqual(['unrestricted']);
    expect(run.modelCalls).toEqual([{ role: 'revision', project: expect.objectContaining({ contentMode: 'unrestricted' }), policy: { writerClass: 'permissive', raised: false } }]);
    const values = run.proseUpdate()?.values;
    expect(values?.isolated).toBe(true);
    expect(values).not.toHaveProperty('generator');
  });

  it('should refuse an isolated draft whose unrestricted route resolves off the allowlist without calling the model or writing', async () => {
    const run = setup({ draft: draftRow(ISOLATED), unrestrictedModel: PRODUCTION_DEFAULTS.revision });

    await expect(run.service.reviseDraft(1n, 4, { note: 'Tighten the ending.' })).rejects.toMatchObject({ code: 'AI_003' });
    expect(run.modelCalls).toEqual([]);
    expect(run.writes()).toEqual([]);
  });

  it('should revise a standard draft on the project route without isolating it', async () => {
    const run = setup({ draft: draftRow() });

    await run.service.reviseDraft(1n, 4, { note: 'Tighten the ending.' });

    expect(run.policyBaselines).toEqual(['standard']);
    expect(run.modelCalls).toEqual([{ role: 'revision', project: expect.objectContaining({ contentMode: 'standard' }), policy: { writerClass: 'standard', raised: false } }]);
    expect(run.proseUpdate()?.values).not.toHaveProperty('isolated');
    expect(run.proseUpdate()?.values).not.toHaveProperty('generator');
  });

  it('should isolate a standard draft whose revision a plugin raised', async () => {
    const run = setup({ draft: draftRow(), raised: true });

    await run.service.reviseDraft(1n, 4, { note: 'Tighten the ending.' });

    expect(run.proseUpdate()?.values).toMatchObject({ generator: 'unrestricted', isolated: true });
  });
});

describe('GenerationService — required writer material over its limits', () => {
  it('should refuse a revision, which writes from the pack, with the readable failure', async () => {
    const run = setup({ draft: draftRow(), overCaps: true });

    await expect(run.service.reviseDraft(1n, 4, { note: 'Tighten the ending.' })).rejects.toMatchObject({ code: 'CTX_002' });
    expect(run.modelCalls).toEqual([]);
  });
});
