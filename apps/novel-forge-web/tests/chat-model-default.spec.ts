import { describe, expect, it } from 'bun:test';

import { resolveDefault } from '../src/components/nf/ChatModel';
import { type AiTierModel, type ContentMode, type CostTier } from '../src/lib/apis/api-types.gen';
import { turnChoiceDefaults } from '../src/lib/chat-model';

const COST_TIERS: readonly CostTier[] = ['economy', 'balanced', 'performant'];
const CONTENT_MODES: readonly ContentMode[] = ['standard', 'unrestricted'];

const modelFor = (costTier: CostTier, contentMode: ContentMode, group: string): string => `${contentMode}/${costTier}-${group}`;

const TIERS: AiTierModel[] = COST_TIERS.flatMap(costTier =>
  CONTENT_MODES.flatMap(contentMode =>
    ['chat', 'planning'].map(group => {
      const model = modelFor(costTier, contentMode, group);
      return { costTier, contentMode, group, provider: 'openrouter', model, label: model };
    }),
  ),
);

const PROJECT = { contentMode: 'standard', costTier: 'balanced' } as const;

describe('resolveDefault', () => {
  it.each([...COST_TIERS])('should inherit the %s platform model when the chat pins that tier over a Balanced project', costTier => {
    const { choice } = turnChoiceDefaults({ contentMode: null, costTier } as never, PROJECT);

    expect(resolveDefault('project', { tiers: TIERS, choice })).toEqual({
      provider: 'openrouter',
      model: modelFor(costTier, 'standard', 'chat'),
      group: 'chat',
    });
  });

  it('should fall back to the project’s tier and model type when the chat pins neither', () => {
    const { choice } = turnChoiceDefaults(undefined, { contentMode: 'standard', costTier: 'economy' });

    expect(resolveDefault('volume', { tiers: TIERS, choice })?.model).toBe(modelFor('economy', 'standard', 'planning'));
  });

  it('should use the unrestricted map when the chat is unrestricted', () => {
    const { choice } = turnChoiceDefaults({ contentMode: 'unrestricted', costTier: 'performant' } as never, PROJECT);

    expect(resolveDefault('project', { tiers: TIERS, choice })?.model).toBe(modelFor('performant', 'unrestricted', 'chat'));
  });
});
