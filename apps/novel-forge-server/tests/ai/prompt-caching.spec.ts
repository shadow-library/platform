import { describe, expect, it, mock } from 'bun:test';

import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { countTokens } from '@modules/ai/context/token-budget';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { applyAnthropicCacheControl, MIN_CACHEABLE_TOKENS } from '@modules/ai/prompt-caching';
import { chatRefinePrompt } from '@modules/ai/prompts/chat-refine.prompt';
import { generationPrompt } from '@modules/ai/prompts/generation.prompt';

const bigText = 'the sect trials continue with rising stakes and sharper blades. '.repeat(150);
const smallText = 'short volatile tail';

function makeRouter(fakeLlm: { invoke: ReturnType<typeof mock> }): ModelRouterService {
  const router = new ModelRouterService({} as never, { getPostgresClient: () => ({}) } as never);
  (router as unknown as Record<string, unknown>)['buildClient'] = () => fakeLlm;
  return router;
}

function cacheControlOf(content: unknown): unknown {
  if (!Array.isArray(content)) return undefined;
  return (content[0] as { cache_control?: unknown }).cache_control;
}

describe('applyAnthropicCacheControl', () => {
  it('marks system, first human, and the last prior-turn message — never the volatile tail', () => {
    const messages = [new SystemMessage(bigText), new HumanMessage(bigText), new HumanMessage(bigText), new HumanMessage(smallText)];
    applyAnthropicCacheControl(messages);

    expect(cacheControlOf(messages[0]?.content)).toEqual({ type: 'ephemeral' });
    expect(cacheControlOf(messages[1]?.content)).toEqual({ type: 'ephemeral' });
    expect(cacheControlOf(messages[2]?.content)).toEqual({ type: 'ephemeral' });
    expect(typeof messages[3]?.content).toBe('string');
  });

  it('leaves blocks below the minimum cacheable size unmarked', () => {
    const messages = [new SystemMessage(smallText), new HumanMessage(bigText), new HumanMessage(smallText)];
    applyAnthropicCacheControl(messages);

    expect(typeof messages[0]?.content).toBe('string');
    expect(cacheControlOf(messages[1]?.content)).toEqual({ type: 'ephemeral' });
    expect(typeof messages[2]?.content).toBe('string');
  });
});

describe('ModelRouterService cacheStrategy integration', () => {
  const input = { scopeInstructions: 'refine the volume', stableContext: bigText, history: [], volatileContext: 'nothing changed', userMessage: 'raise the stakes' };
  const ctx = { projectId: BigInt(1), promptKey: 'chat-refine', promptVersion: '1.0.0', role: 'chat' };

  it('injects cache_control blocks for anthropic (and routes by module role, not key)', async () => {
    const fakeLlm = { invoke: mock(async () => ({ content: JSON.stringify({ reply: 'sharper stakes proposed' }) })) };
    const router = makeRouter(fakeLlm);
    // The override is keyed by role 'chat' — reaching anthropic proves the router maps key
    // 'chat-refine' to role 'chat' before resolving the model.
    const project = { config: { models: { chat: { provider: 'anthropic', model: 'claude-sonnet-4-6' } } } } as never;

    const result = await router.structured<{ reply: string }>(chatRefinePrompt, input, ctx, project);
    expect(result.reply).toBe('sharper stakes proposed');

    const [messages] = fakeLlm.invoke.mock.calls[0] as unknown as [{ content: unknown; getType(): string }[]];
    expect(messages[0]?.getType()).toBe('system');
    // The chat system prompt sits below the 1024-token cacheable minimum, so only the stable
    // scope-context human message earns a breakpoint here.
    expect(typeof messages[0]?.content).toBe('string');
    expect(cacheControlOf(messages[1]?.content)).toEqual({ type: 'ephemeral' });
    expect(typeof messages[messages.length - 1]?.content).toBe('string');
  });

  it('keeps messages unmarked for non-anthropic providers while preserving stable-first order', async () => {
    const fakeLlm = { invoke: mock(async () => ({ content: JSON.stringify({ reply: 'ok' }) })) };
    const router = makeRouter(fakeLlm);
    const project = { config: { models: { chat: { provider: 'ollama', model: 'qwen3:14b' } } } } as never;

    await router.structured<{ reply: string }>(chatRefinePrompt, input, ctx, project);

    const [messages] = fakeLlm.invoke.mock.calls[0] as unknown as [{ content: unknown; getType(): string }[]];
    expect(messages.every(m => typeof m.content === 'string')).toBe(true);
    expect(messages[0]?.getType()).toBe('system');
    expect(String(messages[1]?.content)).toContain(bigText.slice(0, 40));
  });
});

describe('generation path caching', () => {
  const ctx = { projectId: BigInt(1), promptKey: 'generation', promptVersion: generationPrompt.version, role: 'generation' };
  const input = { stableContext: bigText, volatileContext: smallText, chapterBrief: 'reach the summit', endingContract: 'none', guidance: '' };
  const draft = { title: 'Ascent', body: 'the rope bit into his palms and the ledge came no closer. '.repeat(4), summary: 'they climbed' };

  it('breakpoints the stable pack and leaves the per-chapter tail uncached', async () => {
    const fakeLlm = { invoke: mock(async () => ({ content: JSON.stringify(draft) })) };
    const router = makeRouter(fakeLlm);
    const project = { config: { models: { generation: { provider: 'anthropic', model: 'claude-sonnet-4-6' } } } } as never;

    await router.structured(generationPrompt, input, ctx, project);

    // The JSON-schema reminder is appended after cache injection, so it never displaces a breakpoint.
    const [messages] = fakeLlm.invoke.mock.calls[0] as unknown as [{ content: unknown; getType(): string }[]];
    expect(messages).toHaveLength(4);
    // The generation system prompt is ~700 tokens — below the cacheable minimum — so the stable pack
    // is the only breakpoint, and the per-chapter tail must stay outside it.
    expect(countTokens(generationPrompt.system)).toBeLessThan(MIN_CACHEABLE_TOKENS);
    expect(typeof messages[0]?.content).toBe('string');
    expect(cacheControlOf(messages[1]?.content)).toEqual({ type: 'ephemeral' });
    expect(typeof messages[2]?.content).toBe('string');
    expect(String(messages[2]?.content)).toContain(smallText);
  });
});
