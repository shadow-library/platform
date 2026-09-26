import { describe, expect, it } from 'bun:test';

import { runWithCostTier } from '@modules/ai/cost-tier-scope';
import { COST_TIER_DEFAULTS, type ResolvedModel } from '@modules/ai/defaults';
import { ModelRouterService, type ProjectConfig } from '@modules/ai/model-router.service';
import { chatRoutedProject, chatSelection } from '@modules/refinement/chat-selection';

const opus: ResolvedModel = { provider: 'openrouter', model: 'anthropic/claude-opus-5' };
const kimi: ResolvedModel = { provider: 'openrouter', model: 'moonshotai/kimi-k3' };
const bare = { contentMode: null, costTier: null, modelProvider: null, modelId: null };

function router(): ModelRouterService {
  return new ModelRouterService(
    {} as never,
    { getPostgresClient: () => ({}) } as never,
    { enforce: async () => undefined } as never,
    { defaultsFor: async () => undefined } as never,
  );
}

describe('chatSelection', () => {
  const project: ProjectConfig = { contentMode: 'standard', costTier: 'performant' };

  it.each([
    ['the turn', { contentMode: 'unrestricted', costTier: 'economy' }, { contentMode: 'standard', costTier: 'balanced' }, { contentMode: 'unrestricted', costTier: 'economy' }],
    ['the chat', {}, { contentMode: 'unrestricted', costTier: 'balanced' }, { contentMode: 'unrestricted', costTier: 'balanced' }],
    ['the project', {}, {}, { contentMode: 'standard', costTier: 'performant' }],
    ['each field on its own', { costTier: 'economy' }, { contentMode: 'unrestricted' }, { contentMode: 'unrestricted', costTier: 'economy' }],
  ] as const)('should take the selection from %s first', (_name, turn, session, expected) => {
    expect(chatSelection(turn, { ...bare, ...session }, project)).toEqual(expected);
  });

  it('should fall back to standard at Balanced without a project row', () => {
    expect(chatSelection({}, bare, undefined)).toEqual({ contentMode: 'standard', costTier: 'balanced' });
  });

  it('should not let a turn override leak into the next turn', () => {
    const session = { ...bare, costTier: 'balanced' as const };

    chatSelection({ contentMode: 'unrestricted', costTier: 'performant' }, session, project);

    expect(session).toEqual({ ...bare, costTier: 'balanced' });
    expect(chatSelection({}, session, project)).toEqual({ contentMode: 'standard', costTier: 'balanced' });
  });
});

describe('chatRoutedProject', () => {
  const project: ProjectConfig = { contentMode: 'standard', costTier: 'balanced', config: { models: { plan: kimi, generation: opus } } };

  it('should write the chat pin over the project chat pick and keep every other pick', () => {
    const routed = chatRoutedProject(project, { ...bare, modelProvider: opus.provider, modelId: opus.model }, { contentMode: 'standard', costTier: 'economy' });

    expect(routed).toEqual({ contentMode: 'standard', costTier: 'economy', config: { models: { plan: kimi, generation: opus, chat: opus } } });
    expect(router().resolveModel('chat', routed)).toEqual(opus);
  });

  it('should drop a pin off the unrestricted allowlist in unrestricted mode and fall to the tier map, never to standard', () => {
    const session = { ...bare, modelProvider: opus.provider, modelId: opus.model };

    const routed = chatRoutedProject({ contentMode: 'standard' }, session, { contentMode: 'unrestricted', costTier: 'economy' });

    expect(routed.config).toBeUndefined();
    expect(router().resolveModel('chat', routed)).toEqual(COST_TIER_DEFAULTS.economy.unrestricted.chat);
  });

  it('should keep an allowlisted pin in unrestricted mode', () => {
    const routed = chatRoutedProject(undefined, { ...bare, modelProvider: kimi.provider, modelId: kimi.model }, { contentMode: 'unrestricted', costTier: 'economy' });

    expect(router().resolveModel('chat', routed)).toEqual(kimi);
  });

  it('should route a standard turn on an unrestricted novel onto the standard tier map', () => {
    const routed = chatRoutedProject({ contentMode: 'unrestricted', costTier: 'balanced' }, bare, { contentMode: 'standard', costTier: 'economy' });

    expect(router().resolveModel('chat', routed)).toEqual(COST_TIER_DEFAULTS.economy.standard.chat);
  });

  it('should write chapters in the novel’s own mode under the tier a chat turn hands its actions', () => {
    const unrestrictedTurn = chatSelection({ contentMode: 'unrestricted', costTier: 'economy' }, bare, { contentMode: 'standard', costTier: 'balanced' });
    const novel: ProjectConfig = { contentMode: 'standard', costTier: 'balanced' };

    const writer = runWithCostTier(unrestrictedTurn.costTier, () => router().routeModel('generation', novel));

    expect(writer).toMatchObject({ resolved: COST_TIER_DEFAULTS.economy.standard.writing, costTier: 'economy', contentMode: 'standard' });
  });
});
