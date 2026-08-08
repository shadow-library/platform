import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it as testIt } from 'bun:test';

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { HumanMessage } from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';
import { Config } from '@shadow-library/common';

import { ModelRouterService } from '@modules/ai/model-router.service';
import { buildArcPlanPrompt } from '@modules/ai/prompts/arc-plan.prompt';
import { foundationPrompt } from '@modules/ai/prompts/bible-builder/foundation.prompt';
import { buildChatRefinePrompt } from '@modules/ai/prompts/chat-refine.prompt';
import { fixPrompt } from '@modules/ai/prompts/fix.prompt';
import { judgePrompt } from '@modules/ai/prompts/judge.prompt';
import { premiseEnhancePrompt } from '@modules/ai/prompts/premise-enhance.prompt';
import { renderScopeInstructions } from '@modules/ai/prompts/scope-playbooks';
import { titlePrompt } from '@modules/ai/prompts/title.prompt';
import { type TelemetryHandler } from '@modules/ai/telemetry.handler';
import { runToolLoop } from '@modules/ai/tools/tool-loop';
import { ToolRegistryService } from '@modules/ai/tools/tool-registry.service';
import { type ToolContext } from '@modules/ai/tools/types';

const ollamaAvailable = !!process.env['OLLAMA_HOST'];
const it = ollamaAvailable ? testIt : testIt.skip;

class NoopCallbackHandler extends BaseCallbackHandler {
  name = 'noop';
}

describe('Rung-3 Ollama integration', () => {
  let router: ModelRouterService;
  let ollamaHost: string;

  if (ollamaAvailable) {
    beforeAll(() => {
      ollamaHost = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
      (Config as unknown as { cache: Map<string, unknown> }).cache.set('ai.ollamaHost', ollamaHost);
      process.env['AI_PROFILE'] = 'local-test';
      const stubDbService = {
        getPostgresClient: () => ({
          query: { llmCache: { findFirst: async () => undefined } },
          insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }),
        }),
      };
      router = new ModelRouterService(new NoopCallbackHandler() as unknown as TelemetryHandler, stubDbService as never);
    });

    afterAll(() => {
      delete process.env['AI_PROFILE'];
    });
  }

  const noopCtx = { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' };

  it('seed-from-brief: foundationPrompt with a brief produces a body string', async () => {
    const brief =
      'A young street thief discovers she can rewrite history by touching old coins. Her power attracts an ancient order determined to control the timeline. She must choose between erasing her painful past and saving the future.';
    const result = await router.structured(foundationPrompt, { projectBrief: brief }, noopCtx);
    expect(typeof result.body).toBe('string');
    expect(result.body.length).toBeGreaterThan(10);
  });

  it('generate chapter: chatFor(generation) returns non-empty content', async () => {
    const llm = router.chatFor('generation');
    const response = await llm.invoke([new HumanMessage('Write a single short paragraph opening a fantasy chapter. Output only the prose, nothing else.')]);
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    expect(content.length).toBeGreaterThan(20);
  });

  it('judge a draft: judgePrompt returns a verdict with findings', async () => {
    const contextPack =
      'CANON: Elara cannot use fire magic — she lost that ability in Chapter 1.\n\nDRAFT CHAPTER 3:\nElara raised her hands and released a torrent of flames, burning through the iron gate.';
    const result = await router.structured(judgePrompt, { contextPack, task: 'Identify any contradictions between the draft and the canon above.' }, noopCtx);
    expect(['consistent', 'contradiction']).toContain(result.verdict);
    if (result.verdict === 'contradiction') expect(result.findings.some(f => f.severity === 'hard')).toBe(true);
  });

  it('fix-loop: fixPrompt on a contradiction draft returns action=patch or action=rewrite', async () => {
    const contextPack = 'CANON: The magic sword is named "Dawnbreaker".\n\nDRAFT: Kiran drew his sword, the legendary "Nightfall", and cut through the shadow.';
    const task = 'Hard finding: The sword is named "Nightfall" in the draft but "Dawnbreaker" in the canon. Fix it.';
    const result = await router.structured(fixPrompt, { contextPack, task }, noopCtx);
    expect(['patch', 'rewrite']).toContain(result.action);
    if (result.action === 'patch') expect(result.patches?.length).toBeGreaterThan(0);
    if (result.action === 'rewrite') expect(typeof result.body).toBe('string');
  });

  it('tool loop: runToolLoop with Ollama model completes without crash', async () => {
    const ollamaModel = new ChatOllama({ model: 'qwen3:8b', baseUrl: ollamaHost, temperature: 0 });

    const mockToolCtx: ToolContext = {
      chapter: 1,
      db: {
        query: {
          chapters: { findMany: async () => [] },
          entities: { findFirst: async () => undefined },
          entityAliases: { findMany: async () => [] },
          entityRelationships: { findMany: async () => [] },
          plotThreads: { findMany: async () => [] },
          worldFacts: { findMany: async () => [] },
        },
        select: () => ({ from: () => ({ where: async () => [] }) }),
      } as never,
      node: 'judge',
      projectId: BigInt(1),
      retrieval: { searchLore: async () => [], searchProse: async () => [] } as never,
      runId: 'local-test-run',
    };

    const registry = new ToolRegistryService();
    const rawTools = registry.getRaw('judge');
    const tools = registry.forNode('judge', mockToolCtx);

    const mockFullDb = { insert: () => ({ values: async () => [] }) } as never;

    const result = await runToolLoop(ollamaModel, tools, rawTools, [new HumanMessage('What world facts are known? Use get_world_facts if available.')], mockToolCtx, mockFullDb, {
      maxRounds: 3,
    });

    expect(typeof result.toolCallCount).toBe('number');
    expect(result.toolCallCount).toBeGreaterThanOrEqual(0);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it('structured output torture: title and judge schemas pass ≥50% of 5 runs each', async () => {
    const runs = 5;
    let titlePass = 0;
    let judgePass = 0;

    const titleInput = {
      existingTitles: '1. The Hollow Crown\n2. Ash and Iron\n3. The Last Vow',
      chapterSummary: 'The protagonist betrays her mentor to save the city, then escapes alone into the rain.',
    };

    const judgeInput = {
      contextPack: 'CANON: The city of Valdris has no running water.\nDRAFT: Mira turned on the tap in her Valdris apartment.',
      task: 'Identify any contradictions.',
    };

    const titleCtx = { projectId: BigInt(1), promptKey: 'title', promptVersion: '1.0.0', role: 'title' };
    const judgeCtx = { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' };

    for (let i = 0; i < runs; i++) {
      try {
        await router.structured(titlePrompt, titleInput, titleCtx);
        titlePass++;
      } catch {
        // deliberate — count failures
      }

      try {
        await router.structured(judgePrompt, judgeInput, judgeCtx);
        judgePass++;
      } catch {
        // deliberate — count failures
      }
    }

    expect(titlePass).toBeGreaterThanOrEqual(Math.ceil(runs / 2));
    expect(judgePass).toBeGreaterThanOrEqual(Math.ceil(runs / 2));
  });

  it('chat-refine: a volume-scoped turn returns a reply (and only in-scope ops when proposing)', async () => {
    const prompt = buildChatRefinePrompt('volume');
    const input = {
      scopeInstructions: renderScopeInstructions('volume'),
      stableContext: '## VOLUME\n**The Trial** (v1, approved, chs 1–10)\nObjective: survive the sect trials\nConflict: the rival heir\nPayoff: first breakthrough',
      history: [],
      volatileContext: 'nothing',
      userMessage: 'The objective feels flat. Sharpen it and propose the change.',
    };
    const ctx = { projectId: BigInt(1), promptKey: 'chat-refine', promptVersion: '1.0.0', role: 'chat' };
    const result = await router.structured(prompt, input, ctx);
    expect(result.reply.length).toBeGreaterThan(10);
    if (result.changeSet) expect(result.changeSet.every(op => op['op'] === 'volume.upsert')).toBe(true);
  });

  it('premise-enhance: returns rationale fields and an in-vocabulary changeSet', async () => {
    const input = {
      stableContext: '## PREMISE\nA street thief discovers she can rewrite history by touching old coins.',
      overview: 'A street thief discovers she can rewrite history by touching old coins.',
    };
    const ctx = { projectId: BigInt(1), promptKey: 'premise-enhance', promptVersion: '1.1.0', role: 'premise' };
    const result = await router.structured(premiseEnhancePrompt, input, ctx);
    expect(result.enhancedPremise.length).toBeGreaterThan(20);
    expect(result.changeSet.length).toBeGreaterThan(0);
  });

  it('arc-plan: partitions a 6-chapter volume exactly', async () => {
    const prompt = buildArcPlanPrompt(1, 6);
    const input = {
      stableContext: '## VOLUME\n**The Trial** (v1, approved, chs 1–6)\nObjective: survive the sect trials\n\n## PREMISE\nA revenge cultivation story.',
      volumeKey: 'v1',
      startChapter: 1,
      endChapter: 6,
      arcCount: 2,
      guidance: '',
    };
    const ctx = { projectId: BigInt(1), promptKey: 'arc-plan', promptVersion: '1.0.0', role: 'arc' };
    const result = await router.structured(prompt, input, ctx);
    const sorted = [...result.arcs].sort((a, b) => a.chapterStart - b.chapterStart);
    expect(sorted[0]?.chapterStart).toBe(1);
    expect(sorted[sorted.length - 1]?.chapterEnd).toBe(6);
  });
});
