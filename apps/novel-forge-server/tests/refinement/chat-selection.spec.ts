import { describe, expect, it } from 'bun:test';

import { type Refinement } from '@server/database';

import { runWithCostTier } from '@modules/ai/cost-tier-scope';
import { ModelRouterService, type ProjectConfig } from '@modules/ai/model-router.service';
import { synapseAlias } from '@modules/ai/synapse-request';
import { aliasRoutedProject, chatSelection, presentChatSession } from '@modules/refinement/chat-selection';

import { FakeSynapse } from '../ai/synapse-fakes';

const bare = { contentMode: null, costTier: null, modelProvider: null, modelId: null };

function router(): ModelRouterService {
  return new ModelRouterService({} as never, { getPostgresClient: () => ({}) } as never, new FakeSynapse().client);
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

describe('the tier a chat turn hands its actions', () => {
  it('should write chapters in the novel’s own mode under that tier', () => {
    const unrestrictedTurn = chatSelection({ contentMode: 'unrestricted', costTier: 'economy' }, bare, { contentMode: 'standard', costTier: 'balanced' });
    const novel: ProjectConfig = { contentMode: 'standard', costTier: 'balanced' };

    const writer = runWithCostTier(unrestrictedTurn.costTier, () => router().routeModel('generation', novel));

    expect(writer).toEqual({ task: 'novel-forge.writing', costTier: 'economy', contentMode: 'standard' });
  });
});

describe('aliasRoutedProject', () => {
  const project: ProjectConfig = { contentMode: 'standard', costTier: 'balanced' };
  const selection = { contentMode: 'standard', costTier: 'economy' } as const;

  it("should pin the chat to its alias while the catalog offers it, and route every role on the chat's selection", () => {
    const routed = aliasRoutedProject(project, { aliasKey: 'opus' }, selection, ['opus', 'grok']);

    expect(routed).toEqual({ contentMode: 'standard', costTier: 'economy', chatAlias: 'opus', chatPinned: true });
    expect(router().routeModel('plan', routed)).toEqual({ task: 'novel-forge.planning', costTier: 'economy', contentMode: 'standard' });
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

  it('should show an alias pin as its Synapse option, never the registry slug stored beside it', () => {
    expect(presentChatSession(row)).toMatchObject({ modelProvider: 'synapse', modelId: 'opus', aliasKey: 'opus' });
    expect(presentChatSession({ ...row, aliasKey: null })).toMatchObject({ modelProvider: null, modelId: null });
  });
});
