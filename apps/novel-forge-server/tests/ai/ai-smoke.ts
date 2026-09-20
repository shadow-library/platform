import '@server/bootstrap';

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { HumanMessage } from '@langchain/core/messages';
import { Config, Logger } from '@shadow-library/common';

import { type AiRole, PRODUCTION_DEFAULTS } from '@modules/ai/defaults';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { MODEL_MAP } from '@modules/ai/models';
import { foundationPrompt } from '@modules/ai/prompts/bible-builder/foundation.prompt';
import { judgePrompt } from '@modules/ai/prompts/judge.prompt';
import { titlePrompt } from '@modules/ai/prompts/title.prompt';
import { translateAuditPrompt } from '@modules/ai/prompts/translate-audit.prompt';
import { translateChapterPrompt } from '@modules/ai/prompts/translate-chapter.prompt';
import { translateSeedPrompt } from '@modules/ai/prompts/translate-seed.prompt';

const SPEND_VAR = 'AI_SMOKE_SPEND';
const ROLES: AiRole[] = ['bible', 'title', 'judge', 'generation', 'translate', 'translate', 'audit'];

// Every rung sends a short pack and asks for a short answer; these bound one call generously.
const INPUT_TOKENS_PER_CALL = 1500;
const OUTPUT_TOKENS_PER_CALL = 700;

function estimateCostUsd(): number {
  return ROLES.reduce((total, role) => {
    const entry = MODEL_MAP[PRODUCTION_DEFAULTS[role].model];
    const input = ((entry?.inputPricePerMToken ?? 0) * INPUT_TOKENS_PER_CALL) / 1_000_000;
    const output = ((entry?.outputPricePerMToken ?? 0) * OUTPUT_TOKENS_PER_CALL) / 1_000_000;
    return total + input + output;
  }, 0);
}

if (!process.env[SPEND_VAR]) {
  const models = [...new Set(ROLES.map(role => `${role} → ${PRODUCTION_DEFAULTS[role].model}`))];
  console.log('AI smoke not run — it makes real, billable calls through OpenRouter.');
  console.log('');
  console.log(`  ${ROLES.length} live model calls, roughly $${estimateCostUsd().toFixed(3)} on the platform key:`);
  for (const model of models) console.log(`    ${model}`);
  console.log('');
  console.log(`  Run it with:  ${SPEND_VAR}=1 bun run ai:smoke`);
  process.exit(0);
}

if (!Config.get('ai.openrouter.api.key')) {
  console.error('AI_OPENROUTER_API_KEY is not set — the smoke check has no credential to spend.');
  process.exit(1);
}

Logger.attachTransport('console:pretty');
const logger = Logger.getLogger('Scripts', 'AiSmoke');

class SmokeNoop extends BaseCallbackHandler {
  name = 'smoke-noop';
}

// Deterministic roles with cache disabled always miss, so the stub only has to answer a lookup and swallow a write.
const stubDbService = {
  getPostgresClient: () => ({ query: { llmCache: { findFirst: async () => undefined } }, insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }) }),
};
const router = new ModelRouterService(
  new SmokeNoop() as never,
  stubDbService as never,
  { enforce: async () => undefined } as never,
  { defaultsFor: async () => undefined } as never,
);

logger.info('AI smoke test starting', { calls: ROLES.length, estimatedCostUsd: Number(estimateCostUsd().toFixed(3)) });

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
  const llm = await router.chatFor('generation');
  const response = await llm.invoke([new HumanMessage('Write one sentence of fantasy prose.')]);
  const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  record('generation chat', content.length > 5, `content length=${content.length}`);
} catch (err) {
  record('generation chat', false, String(err));
}

// Translation pipeline (TL9): the three prompt modules through the same `router.structured` path the
// checks above use, chained seed → chapter → audit like a real run — a two-entry glossary slice feeds
// the chapter translation, and the chapter's own output becomes the audit's aligned pair.
const zhSample = '叶凡站在城墙之上，望着远方的战场，心中涌起一股寒意。他知道，属于灵界的战争，才刚刚开始。';
const glossarySlice = '- 叶凡 (character, translate) -> Ye Fan\n- 灵界 (place, translate) -> Spirit Realm';
let translatedBody = '';

try {
  const ctx = { projectId: BigInt(1), promptKey: 'translate-seed', promptVersion: '1.0.0', role: 'translate' };
  const result = await router.structured(
    translateSeedPrompt,
    { contextPack: 'PROJECT: A cultivator web novel following Ye Fan as he rises through the spirit realm.', language: 'zh', sampleChapters: `Chapter 1:\n${zhSample}` },
    ctx,
  );
  record('translate-seed structured output', typeof result.styleNotes === 'string' && result.styleNotes.length > 10, `terms=${result.terms.length}`);
} catch (err) {
  record('translate-seed structured output', false, String(err));
}

try {
  const ctx = { projectId: BigInt(1), promptKey: 'translate-chapter', promptVersion: '1.0.0', role: 'translate' };
  const result = await router.structured(
    translateChapterPrompt,
    {
      stableContext: `Style notes: third person past tense, honorifics dropped.\nGlossary:\n${glossarySlice}`,
      volatileContext: 'Term policy: apply the glossary above exactly.',
      segmentIndex: 1,
      segmentCount: 1,
      sourceSegment: zhSample,
      prevTranslatedTail: 'none',
      repairNotes: 'none',
    },
    ctx,
  );
  translatedBody = result.body;
  record('translate-chapter structured output', typeof result.body === 'string' && result.body.length > 5, `body length=${result.body.length}`);
} catch (err) {
  record('translate-chapter structured output', false, String(err));
}

try {
  const ctx = { projectId: BigInt(1), promptKey: 'translate-audit', promptVersion: '1.0.0', role: 'audit' };
  const translation = translatedBody || '(translate-chapter rung produced no body — auditing an empty translation)';
  const pairs = `### Segment 1\n[original]\n${zhSample}\n[translation]\n${translation}`;
  const result = await router.structured(translateAuditPrompt, { styleNotes: 'Third person past tense, honorifics dropped.', glossarySlice, pairs }, ctx);
  record('translate-audit structured output', ['clean', 'issues'].includes(result.verdict), `verdict=${result.verdict}`);
} catch (err) {
  record('translate-audit structured output', false, String(err));
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
