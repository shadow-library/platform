import { describe, expect, it } from 'bun:test';

import { LEGACY_SLUG_ALIAS } from '@shadow-library/synapse';

import { REGISTRY_LLM_SLUGS, REGISTRY_NON_LLM_SLUGS, SEED_ALIAS_KEYS } from './fixtures/novel-forge-registry';

describe('LEGACY_SLUG_ALIAS', () => {
  it('should map every registry LLM slug to a seeded alias key', () => {
    for (const slug of REGISTRY_LLM_SLUGS) expect(SEED_ALIAS_KEYS).toContain(LEGACY_SLUG_ALIAS[slug] as string);
  });

  it('should map nothing beyond the registry LLM slugs', () => {
    expect(Object.keys(LEGACY_SLUG_ALIAS).sort()).toEqual([...REGISTRY_LLM_SLUGS].sort());
    for (const slug of REGISTRY_NON_LLM_SLUGS) expect(LEGACY_SLUG_ALIAS[slug]).toBeUndefined();
  });

  it('should move an older version to its family alias', () => {
    expect(LEGACY_SLUG_ALIAS['anthropic/claude-opus-5']).toBe('opus');
    expect(LEGACY_SLUG_ALIAS['anthropic/claude-opus-5.5']).toBe('opus');
    expect(LEGACY_SLUG_ALIAS['x-ai/grok-4.3']).toBe('grok');
    expect(LEGACY_SLUG_ALIAS['moonshotai/kimi-k2.6']).toBe('kimi');
    expect(LEGACY_SLUG_ALIAS['z-ai/glm-5.2']).toBe('glm');
  });

  it('should not read inherited object keys as mapped slugs', () => {
    for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) expect(LEGACY_SLUG_ALIAS[key]).toBeUndefined();
  });
});
