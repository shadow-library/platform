import { describe, expect, it } from 'bun:test';

import { DRAFT_EXPANSION_MAX_PASSES, expandShortDraft } from '@modules/ai/graphs/draft-expansion';
import { WORD_COUNT_HARD_MAX } from '@modules/ai/graphs/mechanical-check';
import { type TelemetryContext } from '@modules/ai/telemetry.handler';
import { countWords, WORD_TARGET_AIM, WORD_TARGET_MIN } from '@modules/eval/deterministic-metrics';

const SENTENCE = 'She climbed the ridge and did not look back. ';
const SENTENCE_WORDS = 9;

function bodyOfWords(words: number): string {
  return SENTENCE.repeat(Math.ceil(words / SENTENCE_WORDS)).trim();
}

interface StructuredCall {
  key: string;
  vars: Record<string, unknown>;
  ctx: TelemetryContext;
}

function routerReturning(...responses: (unknown | Error)[]) {
  const calls: StructuredCall[] = [];
  const modelRouter = {
    structured: async (prompt: { key: string }, vars: Record<string, unknown>, ctx: TelemetryContext) => {
      calls.push({ key: prompt.key, vars, ctx });
      const response = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (response instanceof Error) throw response;
      return response;
    },
  };
  return { calls, modelRouter: modelRouter as never };
}

const CTX: TelemetryContext = { projectId: 1n, runId: 'run-1', node: 'draftChapter', promptKey: 'generation', promptVersion: '2.5.0', role: 'generation' };

function input(body: string) {
  return { body, stableContext: 'STABLE', volatileContext: 'VOLATILE', chapterBrief: 'BRIEF', endingContract: 'CONTRACT', guidance: 'GUIDANCE' };
}

describe('expandShortDraft', () => {
  it('should not call the model when the draft already reaches the target floor', async () => {
    const { calls, modelRouter } = routerReturning({ body: bodyOfWords(2400) });
    const body = bodyOfWords(WORD_TARGET_MIN + 50);

    const result = await expandShortDraft(modelRouter, input(body), CTX);

    expect(calls).toHaveLength(0);
    expect(result).toEqual({ body, passes: 0, initialWords: countWords(body), finalWords: countWords(body) });
  });

  it('should expand a short draft once when the first pass lands inside the band', async () => {
    const expanded = bodyOfWords(2100);
    const { calls, modelRouter } = routerReturning({ body: expanded });
    const short = bodyOfWords(1400);

    const result = await expandShortDraft(modelRouter, input(short), CTX);

    expect(calls).toHaveLength(1);
    expect(result.body).toBe(expanded);
    expect(result.passes).toBe(1);
    expect(result.finalWords).toBe(countWords(expanded));
  });

  it('should pass the pack segments, the draft and its concrete word targets to the chapter-expand prompt', async () => {
    const { calls, modelRouter } = routerReturning({ body: bodyOfWords(2100) });
    const short = bodyOfWords(1400);
    const words = countWords(short);

    await expandShortDraft(modelRouter, input(short), CTX);

    expect(calls[0]?.key).toBe('chapter-expand');
    expect(calls[0]?.vars).toMatchObject({
      stableContext: 'STABLE',
      volatileContext: 'VOLATILE',
      chapterBrief: 'BRIEF',
      endingContract: 'CONTRACT',
      guidance: 'GUIDANCE',
      draftBody: short,
      draftWords: words,
      minWords: WORD_TARGET_MIN,
      aimWords: WORD_TARGET_AIM,
      missingWords: WORD_TARGET_AIM - words,
    });
    expect(calls[0]?.ctx).toMatchObject({ runId: 'run-1', node: 'draftChapter:expand', promptKey: 'chapter-expand', role: 'generation' });
  });

  it('should stop after the maximum number of passes when the draft stays short', async () => {
    const { calls, modelRouter } = routerReturning({ body: bodyOfWords(1500) }, { body: bodyOfWords(1600) }, { body: bodyOfWords(1700) });

    const result = await expandShortDraft(modelRouter, input(bodyOfWords(1400)), CTX);

    expect(calls).toHaveLength(DRAFT_EXPANSION_MAX_PASSES);
    expect(result.passes).toBe(DRAFT_EXPANSION_MAX_PASSES);
    expect(result.finalWords).toBe(countWords(bodyOfWords(1600)));
  });

  it('should respect an explicit pass bound', async () => {
    const { calls, modelRouter } = routerReturning({ body: bodyOfWords(1500) });

    await expandShortDraft(modelRouter, input(bodyOfWords(1400)), CTX, undefined, undefined, 1);

    expect(calls).toHaveLength(1);
  });

  it('should keep the current draft when a pass does not grow it', async () => {
    const short = bodyOfWords(1400);
    const { calls, modelRouter } = routerReturning({ body: bodyOfWords(900) });

    const result = await expandShortDraft(modelRouter, input(short), CTX);

    expect(calls).toHaveLength(1);
    expect(result.body).toBe(short);
  });

  it('should keep the current draft when a pass runs past the hard ceiling', async () => {
    const short = bodyOfWords(1400);
    const { modelRouter } = routerReturning({ body: bodyOfWords(WORD_COUNT_HARD_MAX + 300) });

    const result = await expandShortDraft(modelRouter, input(short), CTX);

    expect(result.body).toBe(short);
  });

  it('should keep the best body so far when a later pass fails', async () => {
    const firstPass = bodyOfWords(1600);
    const { calls, modelRouter } = routerReturning({ body: firstPass }, new Error('unparseable'));

    const result = await expandShortDraft(modelRouter, input(bodyOfWords(1400)), CTX);

    expect(calls).toHaveLength(2);
    expect(result.body).toBe(firstPass);
    expect(result.passes).toBe(2);
  });

  it('should tolerate a response without a body', async () => {
    const short = bodyOfWords(1400);
    const { modelRouter } = routerReturning({ title: 'not an expansion' });

    const result = await expandShortDraft(modelRouter, input(short), CTX);

    expect(result.body).toBe(short);
  });
});
