import { describe, expect, it } from 'bun:test';

import { GenerationService } from '@modules/generation/generation.service';

const VALID = {
  appeared: ['mira'],
  newEntities: [],
  threads: [],
  mysteries: [],
  timeline: [],
  relationships: [],
  power: [],
  characterStates: [],
  knowledgeChanges: [],
  chapterSummary: 'Mira reaches the harbour.',
};

function makeService(stored: Record<string, unknown> = VALID): { service: GenerationService; saved: Record<string, unknown>[] } {
  const saved: Record<string, unknown>[] = [];
  const row = { id: BigInt(1), projectId: BigInt(1), chapter: 3, status: 'pending', proposal: stored };
  const db = {
    query: { continuityProposals: { findFirst: async () => row } },
    update: () => ({
      set: (values: Record<string, unknown>) => (saved.push(values), { where: () => ({ returning: async () => [{ ...row, ...values }] }) }),
    }),
  };
  const databaseService = { getPostgresClient: () => db } as never;
  const noop = {} as never;
  const service = new GenerationService(databaseService, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
  return { service, saved };
}

describe('GenerationService.updateContinuityProposal', () => {
  it('should reject a body that is not a continuity output and write nothing', async () => {
    const { service, saved } = makeService();

    await expect(service.updateContinuityProposal(BigInt(1), 3, { proposal: { appeared: 'not-a-list' } })).rejects.toMatchObject({ code: 'CNT_003' });
    expect(saved).toEqual([]);
  });

  it('should persist a valid proposal as given', async () => {
    const { service, saved } = makeService();
    const edited = { ...VALID, chapterSummary: 'Mira reaches the harbour at dusk.' };

    await service.updateContinuityProposal(BigInt(1), 3, { proposal: edited });

    expect(saved[0]?.['proposal']).toEqual(edited);
  });

  it('should keep sourceIsolated on an isolated proposal that round-trips', async () => {
    const { service, saved } = makeService({ ...VALID, sourceIsolated: true });

    await service.updateContinuityProposal(BigInt(1), 3, { proposal: { ...VALID, sourceIsolated: true } });

    expect(saved[0]?.['proposal']).toEqual({ ...VALID, sourceIsolated: true });
  });

  it('should not let a body set sourceIsolated on a standard proposal', async () => {
    const { service, saved } = makeService();

    await service.updateContinuityProposal(BigInt(1), 3, { proposal: { ...VALID, sourceIsolated: true } });

    expect(saved[0]?.['proposal']).toEqual(VALID);
  });

  it('should not let a body clear sourceIsolated from an isolated proposal', async () => {
    const { service, saved } = makeService({ ...VALID, sourceIsolated: true });

    await service.updateContinuityProposal(BigInt(1), 3, { proposal: VALID });

    expect(saved[0]?.['proposal']).toEqual({ ...VALID, sourceIsolated: true });
  });
});
