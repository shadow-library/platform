import { describe, expect, it } from 'bun:test';

import { runWithCostTier } from '@modules/ai/cost-tier-scope';
import { ModelRouterService, type ProjectConfig } from '@modules/ai/model-router.service';
import { chatSelection } from '@modules/refinement/chat-selection';

import { FakeSynapse } from '../ai/synapse-fakes';

function router(): ModelRouterService {
  return new ModelRouterService({} as never, { getPostgresClient: () => ({}) } as never, new FakeSynapse().client);
}

describe('chatSelection', () => {
  const project: ProjectConfig = { contentMode: 'standard', costTier: 'performant' };

  it.each([
    ['the turn', { contentMode: 'unrestricted', costTier: 'economy' }, { contentMode: 'unrestricted', costTier: 'economy' }],
    ['the project', {}, { contentMode: 'standard', costTier: 'performant' }],
    ['each field on its own', { costTier: 'economy' }, { contentMode: 'standard', costTier: 'economy' }],
  ] as const)('should take the selection from %s first', (_name, turn, expected) => {
    expect(chatSelection(turn, project)).toEqual(expected);
  });

  it('should fall back to standard at Balanced without a project row', () => {
    expect(chatSelection({}, undefined)).toEqual({ contentMode: 'standard', costTier: 'balanced' });
  });

  it('should follow an unrestricted project unless the turn asks for standard', () => {
    const unrestricted: ProjectConfig = { contentMode: 'unrestricted', costTier: 'balanced' };

    expect(chatSelection({}, unrestricted)).toEqual({ contentMode: 'unrestricted', costTier: 'balanced' });
    expect(chatSelection({ contentMode: 'standard' }, unrestricted)).toEqual({ contentMode: 'standard', costTier: 'balanced' });
  });

  it('should not let a turn override leak into the next turn', () => {
    chatSelection({ contentMode: 'unrestricted', costTier: 'performant' }, project);

    expect(chatSelection({}, project)).toEqual({ contentMode: 'standard', costTier: 'performant' });
  });
});

describe('the tier a chat turn hands its actions', () => {
  it('should write chapters in the novel’s own mode under that tier', () => {
    const unrestrictedTurn = chatSelection({ contentMode: 'unrestricted', costTier: 'economy' }, { contentMode: 'standard', costTier: 'balanced' });
    const novel: ProjectConfig = { contentMode: 'standard', costTier: 'balanced' };

    const writer = runWithCostTier(unrestrictedTurn.costTier, () => router().routeModel('generation', novel));

    expect(writer).toEqual({ task: 'novel-forge.writing', costTier: 'economy', contentMode: 'standard' });
  });
});
