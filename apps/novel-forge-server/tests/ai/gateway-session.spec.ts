import { afterEach, describe, expect, it } from 'bun:test';

import { type BaseMessage } from '@langchain/core/messages';
import { type ChatOpenAI } from '@langchain/openai';
import { Config } from '@shadow-library/common';

import { gatewaySessionKey, keepsGatewaySession } from '@modules/ai/gateway-session';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { chatRefinePrompt } from '@modules/ai/prompts/chat-refine.prompt';

const cache = (Config as unknown as { cache: Map<string, unknown> })['cache'];
const KEYS = ['app.stage', 'ai.openrouter.api.url', 'ai.openrouter.api.key', 'ai.model-override', 'ai.backend'];
const saved = new Map(KEYS.map(key => [key, cache.get(key)]));

function setConfig(values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) cache.set(key, value);
}

afterEach(() => {
  for (const [key, value] of saved) cache.set(key, value);
});

const GATEWAY = 'http://host.docker.internal:8318/v1';
const CLAUDE = 'anthropic/claude-sonnet-5';

describe('gatewaySessionKey', () => {
  it('should keep dev and prod apart on the host gateway they share', () => {
    setConfig({ 'app.stage': 'dev' });
    const dev = gatewaySessionKey(7n, 'chat-1');
    setConfig({ 'app.stage': 'prod' });
    const prod = gatewaySessionKey(7n, 'chat-1');

    expect(dev).toBe('dev:7:chat-1');
    expect(prod).toBe('prod:7:chat-1');
  });
});

describe('keepsGatewaySession', () => {
  it('should hold for a Claude model the gateway runs on its CLI', () => {
    setConfig({ 'ai.openrouter.api.url': GATEWAY, 'ai.model-override': undefined });

    expect(keepsGatewaySession(CLAUDE)).toBe(true);
  });

  it('should not hold for another vendor, on OpenRouter itself or under a local-model override', () => {
    setConfig({ 'ai.openrouter.api.url': GATEWAY, 'ai.model-override': undefined });
    expect(keepsGatewaySession('x-ai/grok-4.6')).toBe(false);

    setConfig({ 'ai.openrouter.api.url': 'https://openrouter.ai/api/v1' });
    expect(keepsGatewaySession(CLAUDE)).toBe(false);

    setConfig({ 'ai.openrouter.api.url': GATEWAY, 'ai.model-override': 'qwen3:8b' });
    expect(keepsGatewaySession(CLAUDE)).toBe(false);
  });

  it('should hold for every model under Synapse, which decides per deployment whether the session is kept', () => {
    setConfig({ 'ai.backend': 'synapse', 'ai.openrouter.api.url': 'https://openrouter.ai/api/v1', 'ai.model-override': 'qwen3:8b' });

    expect(keepsGatewaySession('x-ai/grok-4.6')).toBe(true);
    expect(keepsGatewaySession(CLAUDE)).toBe(true);
  });
});

describe('ModelRouterService session header', () => {
  const router = new ModelRouterService({} as never, { getPostgresClient: () => ({}) } as never, { enforce: async () => undefined } as never);
  const project = { chatModel: { provider: 'openrouter', model: CLAUDE } };
  const ctx = { projectId: 1n, promptKey: 'chat-refine', promptVersion: '1', role: 'chat', gatewaySession: 'dev:1:chat-1' };
  const headers = (client: unknown) => (client as ChatOpenAI).clientConfig.defaultHeaders;

  it('should name the conversation only when told to, beside the web-tools header', () => {
    setConfig({ 'ai.openrouter.api.key': 'test-key', 'ai.openrouter.api.url': GATEWAY });
    const build = (opts: { webTools?: boolean; session?: string }) => headers(router.buildClient({ provider: 'openrouter', model: CLAUDE }, opts));

    expect(build({ session: 'dev:1:chat-1', webTools: true })).toEqual({ 'x-gateway-web-tools': 'on', 'x-gateway-session': 'dev:1:chat-1' });
    expect(build({ webTools: true })).toEqual({ 'x-gateway-web-tools': 'on' });
    expect(build({})).toBeUndefined();
  });

  it('should never name the conversation on a client that may bind tools, whatever the context carries', async () => {
    setConfig({ 'ai.openrouter.api.key': 'test-key', 'ai.openrouter.api.url': GATEWAY, 'ai.model-override': undefined });

    expect(headers(await router.chatFor('chat', ctx, project))).toBeUndefined();
  });
});

describe('ModelRouterService schema placement', () => {
  const input = { scopeInstructions: 'playbook', stableContext: 'STABLE', history: [], volatileContext: 'nothing', turnRules: 'RULES', userMessage: 'raise the stakes' };
  const project = { chatModel: { provider: 'openrouter', model: CLAUDE } };

  async function sent(gatewaySession?: string): Promise<BaseMessage[]> {
    setConfig({ 'ai.openrouter.api.url': GATEWAY, 'ai.model-override': undefined });
    const router = new ModelRouterService({} as never, { getPostgresClient: () => ({}) } as never, { enforce: async () => undefined } as never);
    const messages: BaseMessage[][] = [];
    (router as unknown as Record<string, unknown>)['buildClient'] = () => ({
      invoke: async (sentMessages: BaseMessage[]) => (messages.push(sentMessages), { content: JSON.stringify({ reply: 'ok' }) }),
    });
    const ctx = { projectId: 1n, promptKey: 'chat-refine', promptVersion: '1', role: 'chat', ...(gatewaySession ? { gatewaySession } : {}) };
    await router.structured(chatRefinePrompt, input, ctx, project);
    return messages[0] ?? [];
  }

  it('should put the schema in the system prompt of a call the gateway keeps a session for', async () => {
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
