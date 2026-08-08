import { Logger } from '@shadow-library/common';

Logger.attachTransport('console:pretty');
const logger = Logger.getLogger('Scripts', 'AiSmoke');

const ollamaHost = process.env['OLLAMA_HOST'];

if (!ollamaHost) {
  console.log('OLLAMA_HOST not set — smoke test skipped');
  process.exit(0);
}

// Select local-test profile before any config-aware code runs.
// getProfileDefaults() reads process.env['AI_PROFILE'] at call time, so this takes effect
// as long as it is set before the model router is used.
process.env['AI_PROFILE'] = 'local-test';

// Config must be loaded before any Config.get() calls in the app.
await import('@server/bootstrap');

const { Config } = await import('@shadow-library/common');
// Override the ollamaHost config cache entry to point at the test instance.
(Config as unknown as { cache: Map<string, unknown> }).cache.set('ai.ollamaHost', ollamaHost);

const { BaseCallbackHandler } = await import('@langchain/core/callbacks/base');
const { ModelRouterService } = await import('@server/modules/ai/model-router.service');
const { judgePrompt } = await import('@server/modules/ai/prompts/judge.prompt');
const { titlePrompt } = await import('@server/modules/ai/prompts/title.prompt');
const { foundationPrompt } = await import('@server/modules/ai/prompts/bible-builder/foundation.prompt');

// Minimal no-op telemetry — smoke test does not need DB writes.
class SmokeNoop extends BaseCallbackHandler {
  name = 'smoke-noop';
}

// Minimal DatabaseService stub — smoke test runs deterministic roles with cache disabled (always misses).
const stubDbService = {
  getPostgresClient: () => ({ query: { llmCache: { findFirst: async () => undefined } }, insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }) }),
};
const router = new ModelRouterService(new SmokeNoop() as never, stubDbService as never);

logger.info('AI smoke test starting', { ollamaHost, profile: 'local-test' });

const results: { test: string; passed: boolean; detail?: string }[] = [];

function record(test: string, passed: boolean, detail?: string): void {
  results.push({ test, passed, detail });
  const icon = passed ? '✓' : '✗';
  console.log(`  ${icon} ${test}${detail ? `: ${detail}` : ''}`);
}

try {
  const ctx = { projectId: BigInt(1), promptKey: 'bible:foundation', promptVersion: '1.0.0', role: 'bible' };
  const result = await router.structured(
    foundationPrompt,
    { projectBrief: 'A world where memories are currency. The protagonist is a memory thief who accidentally steals the memory of a murder and becomes the only witness.' },
    ctx,
  );
  record('foundation structured output', typeof result.body === 'string' && result.body.length > 10, `body length=${result.body.length}`);
} catch (err) {
  record('foundation structured output', false, String(err));
}

try {
  const ctx = { projectId: BigInt(1), promptKey: 'title', promptVersion: '1.0.0', role: 'title' };
  const result = await router.structured(
    titlePrompt,
    { existingTitles: '1. The Weight of Memory\n2. Glass Minds', chapterSummary: 'The thief is caught and must return the stolen memory or face execution.' },
    ctx,
  );
  record('title structured output', typeof result.title === 'string' && result.title.length > 0, `title="${result.title}"`);
} catch (err) {
  record('title structured output', false, String(err));
}

try {
  const ctx = { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' };
  const result = await router.structured(
    judgePrompt,
    { contextPack: 'CANON: The protagonist cannot read minds.\nDRAFT: She reached into his thoughts and plucked the truth out.', task: 'Identify any contradictions.' },
    ctx,
  );
  record('judge structured output', ['consistent', 'contradiction'].includes(result.verdict), `verdict=${result.verdict}`);
} catch (err) {
  record('judge structured output', false, String(err));
}

try {
  const { HumanMessage } = await import('@langchain/core/messages');
  const llm = router.chatFor('generation');
  const response = await llm.invoke([new HumanMessage('Write one sentence of fantasy prose.')]);
  const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  record('generation chat', content.length > 5, `content length=${content.length}`);
} catch (err) {
  record('generation chat', false, String(err));
}

const passed = results.filter(r => r.passed).length;
const total = results.length;

console.log('');
console.log(`AI smoke: ${passed}/${total} passed`);

if (passed < total) {
  console.log('FAILED tests:');
  for (const r of results.filter(r => !r.passed)) console.log(`  ✗ ${r.test}: ${r.detail}`);
  process.exit(1);
}

logger.info('AI smoke test completed successfully');
