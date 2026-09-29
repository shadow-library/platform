import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from 'bun:test';

import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

import { GatewayChatOpenAI } from '@modules/ai/gateway-chat-openai';
import {
  describeSection,
  findHardLine,
  HARD_LINE_LEXICON,
  HARD_LINE_SYSTEM_LINE,
  type HardLineLexicon,
  inputScreens,
  isClassifiedInput,
  isHardLineRefusal,
  outputScope,
  screenTexts,
  sectionScreens,
} from '@modules/ai/hard-line';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { buildChatRefinePrompt, PROMPT_REGISTRY } from '@modules/ai/prompts';
import { ChatRefineSchema } from '@modules/ai/schemas/chat-refine.schema';
import { JudgeSchema } from '@modules/ai/schemas/judge.schema';
import { toHostedPromptSchema } from '@modules/ai/schemas/validate';
import { TelemetryHandler } from '@modules/ai/telemetry.handler';
import { AppErrorCode } from '@server/classes';
import { schema } from '@server/database';
import { Config } from '@shadow-library/common';

const PLACEHOLDERS: HardLineLexicon = {
  standalone: [/\bBANNED_MARKER\b/],
  minor: [/\bMINOR_MARKER\b/],
  sexual: [/\bSEXUAL_MARKER\b/, /\bEXPLICIT_MARKER\b/],
  explicit: [/\bEXPLICIT_MARKER\b/],
};

/** Terms taken from the production lexicon itself, so no such text is written here: the first entry of a list that is a plain word. */
function plainTerm(list: readonly RegExp[], exclude: readonly RegExp[] = []): string {
  const terms = list.map(term => term.source.replace(/^\\b\(\?:|\)\\b$/g, '')).filter(term => /^[a-z]+$/.test(term));
  const term = terms.find(candidate => !exclude.some(other => other.test(candidate)));
  if (!term) throw new Error('the lexicon has no plain term to probe with');
  return term;
}

const PROBE = plainTerm(HARD_LINE_LEXICON.standalone);
const MINOR = plainTerm(HARD_LINE_LEXICON.minor);
const SEXUAL_ONLY = plainTerm(HARD_LINE_LEXICON.sexual, HARD_LINE_LEXICON.explicit);
const EXPLICIT = plainTerm(HARD_LINE_LEXICON.explicit);

const CTX = { projectId: 1n, runId: 'run-1', node: 'draftChapter', promptKey: 'judge', promptVersion: '1', role: 'judge', chapter: 4 };
const CONSISTENT = JSON.stringify({ verdict: 'consistent', findings: [] });

const echoPrompt = {
  key: 'judge' as const,
  version: '1.0.0',
  kind: 'analytical' as const,
  system: 'test',
  template: { formatMessages: async (input: { guidance?: string; contextPack?: string }) => [new HumanMessage(`${input.contextPack ?? ''}\n${input.guidance ?? ''}`)] } as never,
  schema: JudgeSchema,
};

function setConfig(key: string, value: unknown): void {
  (Config as unknown as { cache: Map<string, unknown> })['cache'].set(key, value);
}

function getConfig(key: string): unknown {
  return (Config as unknown as { cache: Map<string, unknown> })['cache'].get(key);
}

interface Insert {
  table: unknown;
  values: Record<string, unknown>;
}

function fakeDb(inserts: Insert[]) {
  return {
    query: { llmCache: { findFirst: async () => undefined } },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return Object.assign(Promise.resolve(), { catch: async () => undefined, onConflictDoNothing: async () => undefined });
      },
    }),
  };
}

function router(answer = CONSISTENT) {
  const inserts: Insert[] = [];
  const databaseService = { getPostgresClient: () => fakeDb(inserts) } as never;
  const telemetry = new TelemetryHandler(databaseService);
  const service = new ModelRouterService(telemetry, databaseService, { enforce: async () => undefined } as never);
  const invoke = mock(async () => ({ content: answer }));
  const stream = mock(async function* () {
    yield { content: answer };
  });
  const stubClient = () => ((service as unknown as Record<string, unknown>)['buildClient'] = () => ({ invoke, stream }));
  return { service, inserts, invoke, stream, stubClient };
}

async function refusal(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => null,
    (err: unknown) => err,
  );
}

describe('findHardLine', () => {
  it('should refuse a standalone term in supplied text and in background alike', () => {
    expect(findHardLine(['Later, BANNED_MARKER appears.'], 'supplied', PLACEHOLDERS)).toBe('standalone-term');
    expect(findHardLine(['Later, BANNED_MARKER appears.'], 'background', PLACEHOLDERS)).toBe('standalone-term');
  });

  it('should hold supplied text to the full pairing', () => {
    expect(findHardLine(['The MINOR_MARKER and the SEXUAL_MARKER share this sentence.'], 'supplied', PLACEHOLDERS)).toBe('minor-with-sexual-content');
  });

  it('should hold background only to the narrow explicit pairing', () => {
    expect(findHardLine(['The MINOR_MARKER and the SEXUAL_MARKER share this sentence.'], 'background', PLACEHOLDERS)).toBeNull();
    expect(findHardLine(['The MINOR_MARKER and the EXPLICIT_MARKER share this sentence.'], 'background', PLACEHOLDERS)).toBe('minor-with-explicit-act');
  });

  it('should keep sentences, lines and JSON list items apart', () => {
    const apart = ['The MINOR_MARKER waits. Elsewhere, EXPLICIT_MARKER.', 'MINOR_MARKER\nEXPLICIT_MARKER', JSON.stringify(['MINOR_MARKER on the pier', 'EXPLICIT_MARKER'])];
    expect(findHardLine(apart, 'supplied', PLACEHOLDERS)).toBeNull();
  });

  it('should not refuse either term alone', () => {
    expect(findHardLine(['The MINOR_MARKER walks home.', 'An EXPLICIT_MARKER scene between adults.'], 'supplied', PLACEHOLDERS)).toBeNull();
  });

  it('should refuse the probes drawn from the production lexicon, and let the narrow scope pass a non-explicit pairing', () => {
    expect(findHardLine([`Ordinary words, then ${PROBE}.`])).toBe('standalone-term');
    expect(findHardLine([`The ${MINOR} ${SEXUAL_ONLY}.`], 'supplied')).toBe('minor-with-sexual-content');
    expect(findHardLine([`The ${MINOR} ${SEXUAL_ONLY}.`], 'background')).toBeNull();
    expect(findHardLine([`The ${MINOR} ${EXPLICIT}.`], 'background')).toBe('minor-with-explicit-act');
  });

  it('should never refuse its own system line', () => {
    expect(findHardLine([HARD_LINE_SYSTEM_LINE], 'supplied')).toBeNull();
  });

  it.each(Object.values(PROMPT_REGISTRY).map(prompt => [prompt.key, prompt] as const))('should not refuse the %s prompt’s own instructions', (_key, prompt) => {
    const fewShots = (prompt.fewShots ?? []).map(message => (typeof message.content === 'string' ? message.content : JSON.stringify(message.content)));
    expect(findHardLine([prompt.system, ...fewShots, JSON.stringify(toHostedPromptSchema(prompt.schema))], 'supplied')).toBeNull();
  });
});

describe('input classification', () => {
  const templates = [
    ...Object.values(PROMPT_REGISTRY),
    ...(['project', 'novel', 'bible_document', 'volume', 'brief'] as const).map(scope => buildChatRefinePrompt(scope, { proseEdits: true })),
  ];
  const variables = [...new Set(templates.flatMap(prompt => (prompt.template as unknown as { inputVariables: string[] }).inputVariables))];

  it.each(variables)('should classify the %s prompt variable', variable => {
    expect(isClassifiedInput(variable)).toBe(true);
  });

  it('should hold an unknown variable to the full rule', () => {
    expect(inputScreens({ somethingNew: 'Text.' })).toEqual([{ text: 'Text.', scope: 'supplied', source: 'The request' }]);
  });

  it('should hold creative roles’ output to the full rule and derived roles’ to the narrow one', () => {
    expect(['generation', 'fix', 'revision', 'chat'].map(outputScope)).toEqual(['supplied', 'supplied', 'supplied', 'supplied']);
    expect(['continuity', 'extraction', 'review', 'judge', 'title', 'compact', 'validation'].map(outputScope)).toEqual(Array(7).fill('background'));
  });
});

describe('the lexicon', () => {
  const pairs = (list: readonly RegExp[], word: string) => list.some(term => term.test(word));

  it('should pair "sex" on the supplied scope only, as a whole word', () => {
    expect([pairs(HARD_LINE_LEXICON.sexual, 'sex'), pairs(HARD_LINE_LEXICON.explicit, 'sex'), pairs(HARD_LINE_LEXICON.sexual, 'sextant')]).toEqual([true, false, false]);
  });

  it('should keep "molest" on the supplied scope (P4-27) and "intercourse" on both', () => {
    expect([pairs(HARD_LINE_LEXICON.sexual, 'molested'), pairs(HARD_LINE_LEXICON.explicit, 'molested')]).toEqual([true, false]);
    expect([pairs(HARD_LINE_LEXICON.sexual, 'intercourse'), pairs(HARD_LINE_LEXICON.explicit, 'intercourse')]).toEqual([true, true]);
  });
});

describe('screen sources', () => {
  it('should name the record a section came from without quoting it', () => {
    expect(describeSection('memory', ['chapter:4'])).toBe("Chapter 4's summary");
    expect(describeSection('ref', ['entity:keeper'])).toBe('The Story Bible entry "keeper"');
    expect(describeSection('brief', ['chapter:5'])).toBe("Chapter 5's plan");
    expect(describeSection('writing_style', [])).toBe("The story context's writing style section");
  });

  it('should hold a pack’s plan to the full pairing and the rest of it to the narrow one, carrying each section’s refs', () => {
    const sections = [
      { key: 'memory', rendered: `The ${MINOR} ${SEXUAL_ONLY}.`, sourceRefs: ['chapter:4'] },
      { key: 'brief', rendered: `The ${MINOR} ${SEXUAL_ONLY}.`, sourceRefs: ['chapter:5'] },
    ];

    expect(screenTexts(sectionScreens(sections))).toEqual({ rule: 'minor-with-sexual-content', source: "Chapter 5's plan", sourceRefs: ['chapter:5'] });
    expect(screenTexts(sectionScreens([{ key: 'memory', rendered: `The ${MINOR} ${EXPLICIT}.`, sourceRefs: ['chapter:4'] }]))).toMatchObject({
      rule: 'minor-with-explicit-act',
      source: "Chapter 4's summary",
    });
  });

  it('should give the author’s own inputs the full pairing and split the conversation history per message', () => {
    const screens = inputScreens({ userMessage: 'Hello.', contextPack: 'Pack.', history: [new HumanMessage('One.'), new AIMessage('Two.')] });

    expect(screens).toEqual([
      { text: 'Hello.', scope: 'supplied', source: 'Your message' },
      { text: 'Pack.', scope: 'background', source: 'The story context' },
      { text: 'One.', scope: 'background', source: 'The earlier conversation' },
      { text: 'Two.', scope: 'background', source: 'The earlier conversation' },
    ]);
  });
});

describe('ModelRouterService hard line', () => {
  const realFetch = globalThis.fetch;
  const savedConfig = new Map(['ai.openrouter.api.key', 'ai.openrouter.api.url'].map(key => [key, getConfig(key)]));
  beforeAll(() => {
    setConfig('ai.openrouter.api.key', 'test-openrouter-key');
    setConfig('ai.openrouter.api.url', 'http://gateway.invalid/openrouter');
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  afterAll(() => {
    for (const [key, value] of savedConfig) setConfig(key, value);
  });

  function recordFetch() {
    const sent = mock(async () => new Response('{}'));
    globalThis.fetch = sent as unknown as typeof fetch;
    return sent;
  }

  it('should refuse supplied text before any model call and record the rule and source', async () => {
    const run = router();
    run.stubClient();

    const err = await refusal(run.service.structured(echoPrompt, { guidance: `Scene notes: ${PROBE}.` }, CTX, { contentMode: 'unrestricted' }));

    expect(err).toMatchObject({ code: AppErrorCode.AI_015.code, status: 422, data: { rule: 'standalone-term', source: 'The guidance for this chapter' } });
    expect(run.invoke).not.toHaveBeenCalled();
    expect(run.inserts.map(({ table, values }) => [table, values['status'], values['error']])).toEqual([
      [schema.modelCalls, 'refused', { code: 'AI_015', rule: 'standalone-term', source: 'The guidance for this chapter', sourceRefs: [] }],
    ]);
  });

  it('should let background context through the narrow scope where supplied text would refuse', async () => {
    const run = router();
    run.stubClient();

    await run.service.structured(echoPrompt, { contextPack: `The ${MINOR} ${SEXUAL_ONLY}.` }, CTX, { contentMode: 'unrestricted' });
    const err = await refusal(run.service.structured(echoPrompt, { guidance: `The ${MINOR} ${SEXUAL_ONLY}.` }, CTX, { contentMode: 'unrestricted' }));

    expect(run.invoke).toHaveBeenCalledTimes(1);
    expect(isHardLineRefusal(err)).toBe(true);
  });

  it('should refuse unrestricted output before it is cached or returned', async () => {
    const run = router(JSON.stringify({ verdict: 'consistent', findings: [{ severity: 'soft', text: `It reads ${PROBE}.` }] }));
    run.stubClient();

    const err = await refusal(run.service.structured(echoPrompt, { guidance: 'Clean.' }, CTX, { contentMode: 'unrestricted' }));

    expect(err).toMatchObject({ code: 'AI_015', data: { source: 'The generated text' } });
    expect(run.inserts).toEqual([]);
  });

  it('should hold creative output to the full rule and derived output only to the narrow one', async () => {
    const paraphrase = JSON.stringify({ verdict: 'consistent', findings: [{ severity: 'soft', text: `The ${MINOR} ${SEXUAL_ONLY}.` }] });
    const derived = router(paraphrase);
    const creative = router(paraphrase);
    derived.stubClient();
    creative.stubClient();

    await derived.service.structured({ ...echoPrompt, role: 'compact' }, { guidance: 'Clean.' }, CTX, { contentMode: 'unrestricted' });
    const err = await refusal(creative.service.structured({ ...echoPrompt, role: 'generation' }, { guidance: 'Clean.' }, CTX, { contentMode: 'unrestricted' }));

    expect(isHardLineRefusal(err)).toBe(true);
  });

  it('should screen a tool-loop client’s parsed answer for its role', async () => {
    const run = router();

    await run.service.screenOutput('judge', { findings: [{ text: `The ${MINOR} ${SEXUAL_ONLY}.` }] }, CTX, { contentMode: 'unrestricted' });
    const err = await refusal(run.service.screenOutput('judge', { findings: [{ text: `The ${MINOR} ${EXPLICIT}.` }] }, CTX, { contentMode: 'unrestricted' }));

    expect(isHardLineRefusal(err)).toBe(true);
    expect(run.inserts).toEqual([]);
  });

  it('should release a streamed unrestricted reply a sentence at a time and never send the sentence it refuses', async () => {
    const run = router();
    const chunks = [`{"reply":"The harbour`, ` wakes. The ${MINOR} ${SEXUAL_ONLY}`, ` follows. Tail"}`];
    (run.service as unknown as Record<string, unknown>)['buildClient'] = () => ({
      stream: async function* () {
        for (const content of chunks) yield { content };
      },
    });
    const sent: string[] = [];
    const resets: number[] = [];
    const chatPrompt = { ...echoPrompt, key: 'chat-refine' as const, role: 'chat' as const, schema: ChatRefineSchema };

    const err = await refusal(
      run.service.streamStructured(
        chatPrompt,
        { userMessage: 'Go on.' },
        CTX,
        { onDelta: text => sent.push(text), onReset: () => resets.push(1) },
        { contentMode: 'unrestricted' },
      ),
    );

    expect(isHardLineRefusal(err)).toBe(true);
    expect(sent).toEqual(['The harbour wakes.']);
    expect(sent.join('')).not.toContain(SEXUAL_ONLY);
    expect(resets).toEqual([1]);
  });

  it('should never stream an unrestricted change whose text it refuses', async () => {
    const run = router();
    const clean = { op: 'entity.upsert', entityKey: 'mara', type: 'character', name: 'Mara' };
    const refused = { op: 'entity.upsert', entityKey: 'jon', type: 'character', name: 'Jon', body: `The ${MINOR} ${SEXUAL_ONLY}.` };
    const payload = JSON.stringify({ reply: 'Two people.', changeSet: [clean, refused] });
    (run.service as unknown as Record<string, unknown>)['buildClient'] = () => ({
      stream: async function* () {
        yield { content: payload };
      },
    });
    const changes: string[] = [];
    const resets: number[] = [];
    const chatPrompt = { ...echoPrompt, key: 'chat-refine' as const, role: 'chat' as const, schema: ChatRefineSchema };

    const err = await refusal(
      run.service.streamStructured(
        chatPrompt,
        { userMessage: 'Go on.' },
        CTX,
        { onDelta: () => undefined, onChange: ({ element }) => changes.push(String(element.entityKey)), onReset: () => resets.push(1) },
        { contentMode: 'unrestricted' },
      ),
    );

    expect(isHardLineRefusal(err)).toBe(true);
    expect(changes).toEqual(['mara']);
    expect(resets).toEqual([1]);
  });

  it('should leave a standard call to the standard model’s own refusal', async () => {
    const run = router();
    run.stubClient();

    await run.service.structured(echoPrompt, { guidance: `Scene notes: ${PROBE}.` }, CTX, { contentMode: 'standard' });

    expect(run.invoke).toHaveBeenCalledTimes(1);
  });

  it('should refuse a streamed turn before the stream opens', async () => {
    const run = router();
    run.stubClient();

    const err = await refusal(run.service.streamStructured(echoPrompt, { guidance: `Notes: ${PROBE}.` }, CTX, { onDelta: () => undefined }, { contentMode: 'unrestricted' }));

    expect(isHardLineRefusal(err)).toBe(true);
    expect(run.stream).not.toHaveBeenCalled();
  });

  it('should refuse at the wire a tool-bound judge client, send nothing, and record the refusal with its rule', async () => {
    const sent = recordFetch();
    const run = router();
    const client = await run.service.chatFor('judge', CTX, { contentMode: 'unrestricted' });
    const tool = { type: 'function', function: { name: 'noop', description: 'Does nothing.', parameters: { type: 'object', properties: {} } } };

    const err = await refusal(client.bindTools?.([tool])?.invoke([new HumanMessage(`Context: ${PROBE}.`)]) ?? Promise.resolve());
    await awaitAllCallbacks();

    expect(isHardLineRefusal(err)).toBe(true);
    expect(sent).not.toHaveBeenCalled();
    expect(run.inserts.map(({ values }) => [values['status'], (values['error'] as { rule?: string }).rule])).toEqual([['refused', 'standalone-term']]);
  });

  it('should guard a client that takes the Responses API as well', async () => {
    const sent = recordFetch();
    const screen = mock(() => {
      throw AppErrorCode.AI_015.create({ source: 'The request', rule: 'standalone-term', sourceRefs: [] });
    });
    const client = new GatewayChatOpenAI(
      { model: 'x-ai/grok-4.6', apiKey: 'k', maxRetries: 0, useResponsesApi: true, configuration: { baseURL: 'http://gateway.invalid/openrouter' } },
      { screen, systemLine: HARD_LINE_SYSTEM_LINE },
    );

    const err = await refusal(client.invoke([new HumanMessage('Anything.')]));

    expect(isHardLineRefusal(err)).toBe(true);
    expect(screen).toHaveBeenCalledTimes(1);
    expect(sent).not.toHaveBeenCalled();
  });

  it('should refuse an unrestricted image prompt before the request', async () => {
    const sent = recordFetch();

    const err = await refusal(router().service.images({ prompt: `Cover: ${PROBE}.`, n: 1 }, { ...CTX, role: 'image' }, { contentMode: 'unrestricted' }));

    expect(err).toMatchObject({ code: 'AI_015', data: { source: 'The image prompt' } });
    expect(sent).not.toHaveBeenCalled();
  });
});
