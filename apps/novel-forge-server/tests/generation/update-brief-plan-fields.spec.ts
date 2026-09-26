import { describe, expect, it } from 'bun:test';

import { type UpdateBriefBody } from '@modules/generation/generation.dto';
import { GenerationService } from '@modules/generation/generation.service';

type Row = Record<string, unknown>;

const existing: Row = {
  id: 1n,
  projectId: 7n,
  chapter: 4,
  body: 'The keeper climbs the stair.',
  volumeKey: 'volume_1',
  revision: 2,
  direction: 'The keeper refuses the bargain.',
  contentMode: 'unrestricted',
  scenes: [{ summary: 'The tide rises.', pov: 'mira' }],
  claimedMilestones: ['mira_rank_2'],
  isEnding: true,
};

function makeService(): { service: GenerationService; written: { values?: Row; set?: Row } } {
  const written: { values?: Row; set?: Row } = {};
  const milestones = ['mira_rank_2', 'mira_rank_3', 'tide_turns'].map((milestoneKey, index) => ({ id: BigInt(index + 1), milestoneKey, state: 'open', plannedChapter: null }));
  const tx = {
    query: {
      briefs: { findMany: async () => [{ ...existing, ...written.set }] },
      milestones: { findMany: async () => milestones },
      volumes: { findMany: async () => [] },
      canonFacts: { findMany: async () => [] },
      projects: { findFirst: async () => ({ storyCurrentChapter: 0 }) },
      chapters: { findFirst: async () => undefined },
    },
    update: () => ({ set: () => ({ where: () => Object.assign(Promise.resolve(), { returning: async () => [] }) }) }),
    select: () => ({ from: () => ({ where: () => ({ for: async () => [existing] }) }) }),
    insert: () => ({
      values: (values: Row) => {
        written.values = values;
        return {
          onConflictDoUpdate: ({ set }: { set: Row }) => {
            written.set = set;
            return { returning: async () => [{ ...existing, ...set }] };
          },
        };
      },
    }),
  };
  const db = { transaction: async (run: (handle: unknown) => Promise<unknown>) => run(tx) };
  const noop = {} as never;
  const service = new GenerationService({ getPostgresClient: () => db } as never, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
  return { service, written };
}

describe('GenerationService.updateBrief — chapter plan fields', () => {
  it('should leave every plan field the body omits untouched', async () => {
    const { service, written } = makeService();

    await service.updateBrief(7n, 4, { body: 'The keeper climbs the stair again.' });

    for (const field of ['direction', 'contentMode', 'scenes', 'claimedMilestones', 'isEnding']) expect(written.set).not.toHaveProperty(field);
  });

  it('should write the plan fields it is sent, trimmed and de-duplicated', async () => {
    const { service, written } = makeService();
    const body: UpdateBriefBody = {
      body: existing['body'] as string,
      direction: '  The keeper accepts. ',
      contentMode: 'standard',
      scenes: [{ summary: ' The lamp gutters. ' }, { summary: 'Dawn.', pov: 'mira' }],
      claimedMilestones: ['mira_rank_3', ' mira_rank_3', 'tide_turns'],
      isEnding: false,
    };

    await service.updateBrief(7n, 4, body);

    expect(written.set).toMatchObject({
      direction: 'The keeper accepts.',
      contentMode: 'standard',
      scenes: [
        { summary: 'The lamp gutters.', pov: null },
        { summary: 'Dawn.', pov: 'mira' },
      ],
      claimedMilestones: ['mira_rank_3', 'tide_turns'],
      isEnding: false,
    });
  });

  it('should clear the plan fields it is sent as null, and a blank direction', async () => {
    const { service, written } = makeService();

    await service.updateBrief(7n, 4, { body: existing['body'] as string, direction: '  ', contentMode: null, scenes: null, claimedMilestones: null });

    expect(written.set).toMatchObject({ direction: null, contentMode: null, scenes: null, claimedMilestones: null });
  });

  it('should keep the planner’s scene details and write the scenes into the writer’s brief', async () => {
    const { service, written } = makeService();
    const scene = { summary: 'The lamp gutters', pov: 'mira', goal: 'Keep it lit', beats: ['She cups the flame.'], estimatedWords: 800 };

    await service.updateBrief(7n, 4, { body: 'The keeper climbs the stair.\nScene 1. An old scene line.', scenes: [scene] });

    expect(written.set).toMatchObject({
      scenes: [scene],
      body: 'The keeper climbs the stair.\nScene 1 (~800 words). The lamp gutters. Goal: Keep it lit. Beats: She cups the flame. POV: mira.',
    });
  });

  it('should refuse a scene whose summary is blank', async () => {
    const { service, written } = makeService();

    await expect(service.updateBrief(7n, 4, { body: existing['body'] as string, scenes: [{ summary: '   ' }] })).rejects.toMatchObject({ code: 'BRF_004' });
    expect(written.set).toBeUndefined();
  });
});
