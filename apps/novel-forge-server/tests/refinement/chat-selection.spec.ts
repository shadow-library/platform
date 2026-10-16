import { describe, expect, it } from 'bun:test';

import { setConfig } from '@shadow-library/common/testing';

import { type Refinement } from '@server/database';

import { runWithCostTier } from '@modules/ai/cost-tier-scope';
import { COST_TIER_DEFAULTS, type ResolvedModel } from '@modules/ai/defaults';
import { ModelRouterService, type ProjectConfig } from '@modules/ai/model-router.service';
import { synapseAlias } from '@modules/ai/synapse-request';
import { aliasRoutedProject, chatRoutedProject, chatSelection, presentChatSession } from '@modules/refinement/chat-selection';

const opus: ResolvedModel = { provider: 'openrouter', model: 'anthropic/claude-opus-5' };
const kimi: ResolvedModel = { provider: 'openrouter', model: 'moonshotai/kimi-k3' };
const bare = { contentMode: null, costTier: null, modelProvider: null, modelId: null };

function router(): ModelRouterService {
  return new ModelRouterService({} as never, { getPostgresClient: () => ({}) } as never, { enforce: async () => undefined } as never);
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
  const project: ProjectConfig = { contentMode: 'standard', costTier: 'balanced' };

  it('should route the chat on its pin and every other role on the tier map', () => {
    const routed = chatRoutedProject(project, { ...bare, modelProvider: opus.provider, modelId: opus.model }, { contentMode: 'standard', costTier: 'economy' });

    expect(routed).toEqual({ contentMode: 'standard', costTier: 'economy', chatModel: opus, chatPinned: true });
    expect(router().resolveModel('chat', routed)).toEqual(opus);
    expect(router().resolveModel('plan', routed)).toEqual(COST_TIER_DEFAULTS.economy.standard.planning);
  });

  it('should drop a pin off the unrestricted allowlist in unrestricted mode and fall to the tier map, never to standard', () => {
    const session = { ...bare, modelProvider: opus.provider, modelId: opus.model };

    const routed = chatRoutedProject({ contentMode: 'standard' }, session, { contentMode: 'unrestricted', costTier: 'economy' });

    expect(routed.chatModel).toBeUndefined();
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

describe('aliasRoutedProject', () => {
  const project: ProjectConfig = { contentMode: 'standard', costTier: 'balanced' };
  const selection = { contentMode: 'standard', costTier: 'economy' } as const;

  it('should pin the chat to its alias while the catalog offers it, and route every role on the tier map', () => {
    const routed = aliasRoutedProject(project, { aliasKey: 'opus' }, selection, ['opus', 'grok']);
    const route = router().routeModel('chat', routed);

    expect(routed).toEqual({ contentMode: 'standard', costTier: 'economy', chatAlias: 'opus', chatPinned: true });
    expect(route.resolved).toEqual(COST_TIER_DEFAULTS.economy.standard.chat);
    expect(synapseAlias('chat', routed)).toBe('opus');
    expect(synapseAlias('plan', routed)).toBeUndefined();
  });

  it('should drop an alias the catalog does not offer for the selection, so the reply falls to the routes', () => {
    const routed = aliasRoutedProject(project, { aliasKey: 'opus' }, { contentMode: 'unrestricted', costTier: 'economy' }, ['grok']);

    expect(routed).toEqual({ contentMode: 'unrestricted', costTier: 'economy' });
    expect(synapseAlias('chat', routed)).toBeUndefined();
  });

  it('should send the stored alias for Synapse to judge when the catalog could not be read', () => {
    expect(aliasRoutedProject(project, { aliasKey: 'opus' }, selection, undefined)).toMatchObject({ chatAlias: 'opus', chatPinned: true });
  });

  it('should leave an unpinned chat unpinned', () => {
    expect(aliasRoutedProject(project, { aliasKey: null }, selection, ['opus'])).toEqual({ contentMode: 'standard', costTier: 'economy' });
  });
});

describe('presentChatSession', () => {
  const row = { id: 's1', modelProvider: 'openrouter', modelId: 'anthropic/claude-opus-5', aliasKey: 'opus' } as Refinement.ChatSession;

  it('should show an alias pin as its Synapse option on the Synapse backend', () => {
    const restore = setConfig({ 'ai.backend': 'synapse' });
    try {
      expect(presentChatSession(row)).toMatchObject({ modelProvider: 'synapse', modelId: 'opus', aliasKey: 'opus' });
      expect(presentChatSession({ ...row, aliasKey: null })).toMatchObject({ modelProvider: null, modelId: null });
    } finally {
      restore();
    }
  });

  it('should leave the registry pin as stored on the legacy backend', () => {
    const restore = setConfig({ 'ai.backend': 'legacy' });
    try {
      expect(presentChatSession(row)).toBe(row);
    } finally {
      restore();
    }
  });
});
