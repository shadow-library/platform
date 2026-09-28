import { describe, expect, it } from 'bun:test';

import { ClassSchema } from '@shadow-library/class-schema';

import { BriefResponse } from '@modules/generation/generation.dto';

import { makeGenerationService } from './generation-fixtures';

function briefDb(knowledgeContract: unknown) {
  return { query: { briefs: { findFirst: async () => ({ id: 3n, projectId: 1n, chapter: 2, body: 'Amara copies the withdrawals.', knowledgeContract }) } } };
}

describe('BriefResponse', () => {
  it('should declare the knowledge contract so a plan reads it back', () => {
    expect(Object.keys(ClassSchema.generate(BriefResponse).properties ?? {})).toContain('knowledgeContract');
  });
});

describe('GenerationService.getBrief', () => {
  it('should echo the stored knowledge contract in its narrowed shape', async () => {
    const stored = { pov: ['amara_veil'], learns: [{ entityKey: 'amara_veil', factKey: 'rook_holds_the_slip' }, { entityKey: 'amara_veil' }], extra: true };

    const brief = await makeGenerationService(briefDb(stored)).getBrief(1n, 2);

    expect(brief.knowledgeContract).toEqual({ pov: ['amara_veil'], learns: [{ entityKey: 'amara_veil', factKey: 'rook_holds_the_slip' }] });
  });

  it('should answer null for a stored contract that names no point-of-view entity', async () => {
    const brief = await makeGenerationService(briefDb({ pov: [], learns: [] })).getBrief(1n, 2);

    expect(brief.knowledgeContract).toBeNull();
  });
});
