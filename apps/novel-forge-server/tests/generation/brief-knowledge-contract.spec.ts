import { describe, expect, it } from 'bun:test';
import Ajv from 'ajv';

import { ClassSchema } from '@shadow-library/class-schema';

import { BriefResponse } from '@modules/generation/generation.dto';

import { makeGenerationService } from './generation-fixtures';

function briefDb(knowledgeContract: unknown) {
  return { query: { briefs: { findFirst: async () => ({ id: 3n, projectId: 1n, chapter: 2, body: 'Amara copies the withdrawals.', knowledgeContract }) } } };
}

// The serializer Ajv-validates a nullable $ref (it becomes anyOf) before writing it, so the response schema must accept every contract the store can hold.
const RESPONSE_SCHEMA = ClassSchema.generate(BriefResponse);
const acceptsContract = new Ajv({ strict: false }).compile({
  $id: 'brief-knowledge-contract',
  definitions: RESPONSE_SCHEMA.definitions,
  ...(RESPONSE_SCHEMA.properties?.['knowledgeContract'] as object),
});

describe('BriefResponse', () => {
  it('should declare the knowledge contract so a plan reads it back', () => {
    expect(Object.keys(RESPONSE_SCHEMA.properties ?? {})).toContain('knowledgeContract');
  });

  it('should accept a stored contract whose learn keys are free-form', () => {
    expect(acceptsContract({ pov: ['amara-veil'], learns: [{ entityKey: 'amara-veil', factKey: 'Rook holds the slip' }] })).toBe(true);
  });

  it('should accept a contract with no learns and an unfiltered null', () => {
    expect(acceptsContract({ pov: ['amara_veil'], learns: [] })).toBe(true);
    expect(acceptsContract(null)).toBe(true);
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
