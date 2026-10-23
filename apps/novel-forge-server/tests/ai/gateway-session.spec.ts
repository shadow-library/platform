import { afterEach, describe, expect, it } from 'bun:test';

import { type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { Config } from '@shadow-library/common';

import { ModelRouterService, type ProjectConfig } from '@modules/ai/model-router.service';
import { chatRefinePrompt } from '@modules/ai/prompts/chat-refine.prompt';
import { gatewaySessionKey } from '@modules/ai/synapse-request';

import { completion, FakeSynapse, json } from './synapse-fakes';

const cache = (Config as unknown as { cache: Map<string, unknown> })['cache'];
const savedStage = cache.get('app.stage');

afterEach(() => {
  cache.set('app.stage', savedStage);
});

const OWNED: ProjectConfig = { ownerKind: 'user', ownerId: 1n };

describe('gatewaySessionKey', () => {
  it('should keep dev and prod apart on the host gateway they share', () => {
    cache.set('app.stage', 'dev');
    const dev = gatewaySessionKey(7n, 'chat-1');
    cache.set('app.stage', 'prod');
    const prod = gatewaySessionKey(7n, 'chat-1');

    expect(dev).toBe('dev:7:chat-1');
    expect(prod).toBe('prod:7:chat-1');
  });
});

describe('ModelRouterService session', () => {
  it('should never name the conversation on a client that may bind tools, whatever the context carries', async () => {
    const synapse = new FakeSynapse().reply(json(completion('{}')));
    const router = new ModelRouterService({} as never, { getPostgresClient: () => ({}) } as never, synapse.client);
    const ctx = { projectId: 1n, promptKey: 'chat-refine', promptVersion: '1', role: 'chat', gatewaySession: 'dev:1:chat-1' };

    await (await router.chatFor('chat', ctx, OWNED)).invoke([new HumanMessage('Judge.')]);

    expect(synapse.requests[0]?.body?.synapse).not.toHaveProperty('session');
  });
});

describe('ModelRouterService schema placement', () => {
  const input = { scopeInstructions: 'playbook', stableContext: 'STABLE', history: [], volatileContext: 'nothing', turnRules: 'RULES', userMessage: 'raise the stakes' };

  async function sent(gatewaySession?: string): Promise<BaseMessage[]> {
    const router = new ModelRouterService({} as never, { getPostgresClient: () => ({}) } as never, new FakeSynapse().client);
    const messages: BaseMessage[][] = [];
    (router as unknown as Record<string, unknown>)['buildSynapseClient'] = () => ({
      invoke: async (sentMessages: BaseMessage[]) => (messages.push(sentMessages), { content: JSON.stringify({ reply: 'ok' }) }),
    });
    const ctx = { projectId: 1n, promptKey: 'chat-refine', promptVersion: '1', role: 'chat', ...(gatewaySession ? { gatewaySession } : {}) };
    await router.structured(chatRefinePrompt, input, ctx, OWNED);
    return messages[0] ?? [];
  }

  it('should put the schema in the system prompt of a call that continues a session', async () => {
    const messages = await sent('dev:1:chat-1');

    expect(messages[1]?.getType()).toBe('system');
    expect(String(messages[1]?.content)).toContain('matching this JSON schema');
    expect(String(messages.at(-1)?.content)).toContain('raise the stakes');
  });

  it('should close any other call with the schema, as every structured call did', async () => {
    const messages = await sent();

    expect(messages.filter(message => message.getType() === 'system')).toHaveLength(1);
    expect(messages.at(-1)?.getType()).toBe('human');
    expect(String(messages.at(-1)?.content)).toContain('matching this JSON schema');
  });
});
