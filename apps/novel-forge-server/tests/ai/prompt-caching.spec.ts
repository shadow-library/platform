import { describe, expect, it, mock } from 'bun:test';

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { convertMessagesToCompletionsMessageParams } from '@langchain/openai';

import { countTokens } from '@modules/ai/context/token-budget';
import { ModelRouterService, type ProjectConfig } from '@modules/ai/model-router.service';
import { applyAnthropicCacheControl, MIN_CACHEABLE_TOKENS } from '@modules/ai/prompt-caching';
import { chatRefinePrompt } from '@modules/ai/prompts/chat-refine.prompt';
import { generationPrompt, generationWordTargetVars } from '@modules/ai/prompts/generation.prompt';
import { resolveWordTarget } from '@modules/eval/deterministic-metrics';

import { FakeSynapse } from './synapse-fakes';

const bigText = 'the sect trials continue with rising stakes and sharper blades. '.repeat(150);
const smallText = 'short volatile tail';
const OWNED: ProjectConfig = { ownerKind: 'user', ownerId: 1n };

function makeRouter(fakeLlm: { invoke: ReturnType<typeof mock> }): ModelRouterService {
  const router = new ModelRouterService({} as never, { getPostgresClient: () => ({}) } as never, new FakeSynapse().client);
  (router as unknown as Record<string, unknown>)['buildSynapseClient'] = () => fakeLlm;
  return router;
}

function cacheControlOf(content: unknown): unknown {
  if (!Array.isArray(content)) return undefined;
  return (content[0] as { cache_control?: unknown }).cache_control;
}

describe('applyAnthropicCacheControl', () => {
  it('marks system, first human, and the last prior-turn message — never the volatile tail', () => {
    const messages = applyAnthropicCacheControl([new SystemMessage(bigText), new HumanMessage(bigText), new HumanMessage(bigText), new HumanMessage(smallText)]);

    expect(cacheControlOf(messages[0]?.content)).toEqual({ type: 'ephemeral' });
    expect(cacheControlOf(messages[1]?.content)).toEqual({ type: 'ephemeral' });
    expect(cacheControlOf(messages[2]?.content)).toEqual({ type: 'ephemeral' });
    expect(typeof messages[3]?.content).toBe('string');
  });

  it('leaves blocks below the minimum cacheable size unmarked', () => {
    const messages = applyAnthropicCacheControl([new SystemMessage(smallText), new HumanMessage(bigText), new HumanMessage(smallText)]);

    expect(typeof messages[0]?.content).toBe('string');
    expect(cacheControlOf(messages[1]?.content)).toEqual({ type: 'ephemeral' });
    expect(typeof messages[2]?.content).toBe('string');
  });

  it('should mark copies, leaving the messages it was given untouched', () => {
    const shared = new SystemMessage(bigText);
    const [marked] = applyAnthropicCacheControl([shared, new HumanMessage(smallText)]);

    expect(cacheControlOf(marked?.content)).toEqual({ type: 'ephemeral' });
    expect(shared.content).toBe(bigText);
  });
});

describe('ModelRouterService cacheStrategy integration', () => {
  const input = {
    scopeInstructions: 'refine the volume',
    stableContext: bigText,
    history: [],
    volatileContext: 'nothing changed',
    turnRules: 'Prose edits: not requested.',
    userMessage: 'raise the stakes',
  };
  const ctx = { projectId: BigInt(1), promptKey: 'chat-refine', promptVersion: '1.0.0', role: 'chat' };

  it('should inject cache_control blocks on a cacheStrategy module, leaving Synapse to keep or strip them per model', async () => {
    const fakeLlm = { invoke: mock(async () => ({ content: JSON.stringify({ reply: 'sharper stakes proposed' }) })) };
    const router = makeRouter(fakeLlm);

    const result = await router.structured<{ reply: string }>(chatRefinePrompt, input, ctx, OWNED);
    expect(result.reply).toBe('sharper stakes proposed');

    const [messages] = fakeLlm.invoke.mock.calls[0] as unknown as [{ content: unknown; getType(): string }[]];
    expect(messages[0]?.getType()).toBe('system');
    expect(countTokens(chatRefinePrompt.system)).toBeGreaterThanOrEqual(MIN_CACHEABLE_TOKENS);
    expect(cacheControlOf(messages[0]?.content)).toEqual({ type: 'ephemeral' });
    expect(cacheControlOf(messages[1]?.content)).toEqual({ type: 'ephemeral' });
    expect(typeof messages[messages.length - 1]?.content).toBe('string');
  });
});

// The breakpoints are only worth anything if they survive the hop to Synapse's OpenAI-compatible chat-completions endpoint, which
// `SynapseChatModel` reaches through @langchain/openai: it passes non-multimodal content parts through verbatim, which is what carries
// `cache_control` onto the wire.
describe('cache_control wire shape through ChatOpenAI', () => {
  it('survives the completions-params conversion as a text part carrying cache_control', () => {
    const messages = applyAnthropicCacheControl([new SystemMessage(bigText), new HumanMessage(bigText), new HumanMessage(smallText)]);

    const params = convertMessagesToCompletionsMessageParams({ messages, model: 'anthropic/claude-sonnet-5' });

    expect(params[0]?.content).toEqual([{ type: 'text', text: bigText, cache_control: { type: 'ephemeral' } }]);
    expect(params[1]?.content).toEqual([{ type: 'text', text: bigText, cache_control: { type: 'ephemeral' } }]);
    expect(params[2]?.content).toBe(smallText);
  });
});

describe('generation path caching', () => {
  const ctx = { projectId: BigInt(1), promptKey: 'generation', promptVersion: generationPrompt.version, role: 'generation' };
  const input = {
    stableContext: bigText,
    volatileContext: smallText,
    chapterBrief: 'reach the summit',
    endingContract: 'none',
    guidance: '',
    ...generationWordTargetVars(resolveWordTarget()),
  };
  const draft = { title: 'Ascent', body: 'the rope bit into his palms and the ledge came no closer. '.repeat(4), summary: 'they climbed' };

  it('breakpoints the stable pack and leaves the per-chapter tail uncached', async () => {
    const fakeLlm = { invoke: mock(async () => ({ content: JSON.stringify(draft) })) };
    const router = makeRouter(fakeLlm);
    await router.structured(generationPrompt, input, ctx, { ...OWNED, costTier: 'balanced' });

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
