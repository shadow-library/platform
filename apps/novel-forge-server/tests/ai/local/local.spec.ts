/**
 * Importing packages with side effects
 */
import '@server/bootstrap';

/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it as testIt } from 'bun:test';

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { HumanMessage } from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { ModelRouterService } from '@modules/ai/model-router.service';
import { foundationPrompt } from '@modules/ai/prompts/bible-builder/foundation.prompt';
import { fixPrompt } from '@modules/ai/prompts/fix.prompt';
import { judgePrompt } from '@modules/ai/prompts/judge.prompt';
import { titlePrompt } from '@modules/ai/prompts/title.prompt';
import { type TelemetryHandler } from '@modules/ai/telemetry.handler';
import { runToolLoop } from '@modules/ai/tools/tool-loop';
import { ToolRegistryService } from '@modules/ai/tools/tool-registry.service';
import { type ToolContext } from '@modules/ai/tools/types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// Gate: all tests in this file skip cleanly when Ollama is not reachable.
const ollamaAvailable = !!process.env['OLLAMA_HOST'];
const it = ollamaAvailable ? testIt : testIt.skip;

// Minimal no-op callback handler — satisfies LangChain's callback interface without a real DB.
class NoopCallbackHandler extends BaseCallbackHandler {
  name = 'noop';
}

// ─── Rung-3 Ollama integration tests ─────────────────────────────────────────

describe('Rung-3 Ollama integration', () => {
  let router: ModelRouterService;
  let ollamaHost: string;

  if (ollamaAvailable) {
    beforeAll(() => {
      ollamaHost = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
      // Point the config cache at the test Ollama instance.
      (Config as unknown as { cache: Map<string, unknown> }).cache.set('ai.ollamaHost', ollamaHost);
      // Select the local-test profile so the router resolves all roles to Ollama.
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

  // ─── 1. seed-from-brief ──────────────────────────────────────────────────────
  // Sends a 3-sentence brief through the foundation bible prompt and asserts that
  // the structured output has a non-empty body field (the section prose).

  it('seed-from-brief: foundationPrompt with a brief produces a body string', async () => {
    const brief =
      'A young street thief discovers she can rewrite history by touching old coins. Her power attracts an ancient order determined to control the timeline. She must choose between erasing her painful past and saving the future.';
    const result = await router.structured(foundationPrompt, { projectBrief: brief }, noopCtx);
    expect(typeof result.body).toBe('string');
    expect(result.body.length).toBeGreaterThan(10);
  });

  // ─── 2. generate chapter ─────────────────────────────────────────────────────
  // Calls the generation LLM directly (chat, not structured) and asserts that the
  // response contains prose content.

  it('generate chapter: chatFor(generation) returns non-empty content', async () => {
    const llm = router.chatFor('generation');
    const response = await llm.invoke([new HumanMessage('Write a single short paragraph opening a fantasy chapter. Output only the prose, nothing else.')]);
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    expect(content.length).toBeGreaterThan(20);
  });

  // ─── 3. judge a draft ────────────────────────────────────────────────────────
  // Seeds a canon fact and a contradicting draft, then calls the judge prompt.
  // Asserts that the parsed output has a valid verdict field.

  it('judge a draft: judgePrompt returns a verdict with findings', async () => {
    const contextPack =
      'CANON: Elara cannot use fire magic — she lost that ability in Chapter 1.\n\nDRAFT CHAPTER 3:\nElara raised her hands and released a torrent of flames, burning through the iron gate.';
    const result = await router.structured(judgePrompt, { contextPack, task: 'Identify any contradictions between the draft and the canon above.' }, noopCtx);
    expect(['consistent', 'contradiction']).toContain(result.verdict);
    // A contradiction verdict must include hard findings.
    if (result.verdict === 'contradiction') expect(result.findings.some(f => f.severity === 'hard')).toBe(true);
  });

  // ─── 4. fix-loop ─────────────────────────────────────────────────────────────
  // Plants a unique find-string in a draft and asks the repair model to patch it.
  // Asserts that the fix output specifies a valid action.

  it('fix-loop: fixPrompt on a contradiction draft returns action=patch or action=rewrite', async () => {
    const contextPack = 'CANON: The magic sword is named "Dawnbreaker".\n\nDRAFT: Kiran drew his sword, the legendary "Nightfall", and cut through the shadow.';
    const task = 'Hard finding: The sword is named "Nightfall" in the draft but "Dawnbreaker" in the canon. Fix it.';
    const result = await router.structured(fixPrompt, { contextPack, task }, noopCtx);
    expect(['patch', 'rewrite']).toContain(result.action);
    if (result.action === 'patch') expect(result.patches?.length).toBeGreaterThan(0);
    if (result.action === 'rewrite') expect(typeof result.body).toBe('string');
  });

  // ─── 5. tool loop ────────────────────────────────────────────────────────────
  // Runs the tool loop with a real Ollama model and a mock DB (for audit rows).
  // Asserts that the loop completes without error and returns a numeric toolCallCount.

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

    // Mock DB that accepts .insert().values() for the audit rows written by runToolLoop.
    const mockFullDb = { insert: () => ({ values: async () => [] }) } as never;

    const result = await runToolLoop(ollamaModel, tools, rawTools, [new HumanMessage('What world facts are known? Use get_world_facts if available.')], mockToolCtx, mockFullDb, {
      maxRounds: 3,
    });

    expect(typeof result.toolCallCount).toBe('number');
    expect(result.toolCallCount).toBeGreaterThanOrEqual(0);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  // ─── 6. structured output torture ────────────────────────────────────────────
  // Runs the title and judge schemas 5× each against the local model and records
  // pass/fail counts. Asserts that at least half the runs parse successfully —
  // a local model that can't sustain >50% structured output is too unreliable.

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

    // Require ≥50% pass rate — a local model that can't sustain this is too flaky to use.
    expect(titlePass).toBeGreaterThanOrEqual(Math.ceil(runs / 2));
    expect(judgePass).toBeGreaterThanOrEqual(Math.ceil(runs / 2));
  });
});
