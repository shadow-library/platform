import { describe, expect, it } from 'bun:test';

import { type Refinement } from '@server/database';

import { UNRESTRICTED_DEFAULTS } from '@modules/ai/defaults';
import { findHardLine, HARD_LINE_LEXICON, isHardLineRefusal } from '@modules/ai/hard-line';
import { passageHash } from '@modules/generation/passage-anchor';
import { ChatService } from '@modules/refinement/chat.service';
import { ChatCompactionService } from '@modules/refinement/chat-compaction.service';
import { authorWords, paragraphAt, type PassageContextInput, renderTurnContent, resolvePassageContexts, turnScreens } from '@modules/refinement/passage-context';
import { serialiseMessage } from '@modules/refinement/serialise';

const BODY = 'The keeper counts the ships at the harbour wall.\n\nThe tide turns late tonight. The ferry waits by the empty pier.\n\nGulls cry over the water.';
const QUOTE = 'The tide turns late tonight.';
const START = BODY.indexOf(QUOTE);
const PREFIX = 'Night falls.\n\n';

/** A term the production lexicon refuses on its own, taken from the lexicon so no such text is written here. */
const PROBE = (HARD_LINE_LEXICON.standalone[0] as RegExp).source.replace(/^\\b\(\?:|\)\\b$/g, '');
const PROBE_QUOTE = `The keeper waits.\n${PROBE} is the word.`;
const PROBE_BODY = `${PROBE_QUOTE}\n\nGulls cry over the water.`;

interface DraftRow {
  id: bigint;
  chapter: number;
  revision: number;
  saveSeq: number;
  body: string;
  isolated: boolean;
}

const DRAFT: DraftRow = { id: 41n, chapter: 3, revision: 5, saveSeq: 9, body: BODY, isolated: false };

function input(overrides: Partial<PassageContextInput> = {}): PassageContextInput {
  const quote = overrides.quote ?? QUOTE;
  const start = overrides.start ?? BODY.indexOf(quote);
  return {
    kind: 'passage',
    chapter: 3,
    draftId: '41',
    revision: 5,
    saveSeq: 9,
    start,
    end: start + quote.length,
    passageHash: passageHash(quote),
    quote,
    comment: '  Make this tenser.\n',
    ...overrides,
  };
}

function drafts(rows: DraftRow[], snapshots: Record<number, string> = {}) {
  const reads: string[] = [];
  const db = {
    query: {
      drafts: { findMany: async () => rows },
      draftRevisions: {
        findFirst: async () => {
          reads.push('snapshot');
          const revision = Object.keys(snapshots)[0];
          return revision === undefined ? undefined : { body: snapshots[Number(revision)] };
        },
      },
    },
  };
  return { db: db as never, reads };
}

function context(overrides: Partial<Refinement.ChatPassageContext> = {}): Refinement.ChatPassageContext {
  return {
    kind: 'passage',
    chapter: 3,
    draftId: '41',
    revision: 5,
    saveSeq: 9,
    start: START,
    end: START + QUOTE.length,
    passageHash: passageHash(QUOTE),
    quote: QUOTE,
    comment: 'Make this tenser.',
    firstParagraph: 2,
    lastParagraph: 2,
    ...overrides,
  };
}

describe('paragraphAt', () => {
  it('should count paragraphs by blank lines, as a reader does', () => {
    expect(paragraphAt(BODY, 0)).toBe(1);
    expect(paragraphAt(BODY, START)).toBe(2);
    expect(paragraphAt(BODY, BODY.indexOf('Gulls'))).toBe(3);
  });

  it('should give an offset between two paragraphs to the next one, ignoring leading blank lines and spaces on a blank line', () => {
    const body = '\n\nFirst line\nstill first.\n  \t\nSecond.';

    expect(paragraphAt(body, 0)).toBe(1);
    expect(paragraphAt(body, body.indexOf('still'))).toBe(1);
    expect(paragraphAt(body, body.indexOf('  \t'))).toBe(2);
    expect(paragraphAt(body, body.indexOf('Second'))).toBe(2);
  });
});

describe('resolvePassageContexts', () => {
  it('should keep a passage that still stands where it was selected, with its paragraph and a trimmed comment', async () => {
    const { db } = drafts([DRAFT]);

    expect(await resolvePassageContexts(db, 1n, [input()])).toEqual([context()]);
  });

  it('should re-anchor a passage the draft has moved since, to the current revision’s offsets', async () => {
    const { db } = drafts([{ ...DRAFT, revision: 6, saveSeq: 12, body: `${PREFIX}${BODY}` }]);

    const [resolved] = await resolvePassageContexts(db, 1n, [input()]);

    expect(resolved).toMatchObject({ revision: 6, saveSeq: 12, start: START + PREFIX.length, end: START + PREFIX.length + QUOTE.length, firstParagraph: 3, lastParagraph: 3 });
  });

  it('should tell copies apart by the words around them in the revision the author read', async () => {
    const { db, reads } = drafts([{ ...DRAFT, revision: 6, body: `${PREFIX}${BODY}\n\n${QUOTE}` }], { 5: BODY });

    const [resolved] = await resolvePassageContexts(db, 1n, [input()]);

    expect(resolved?.start).toBe(START + PREFIX.length);
    expect(reads).toEqual(['snapshot']);
  });

  it('should not read a snapshot for a passage still in place', async () => {
    const { db, reads } = drafts([{ ...DRAFT, revision: 6, body: `${BODY} More.` }], { 5: BODY });

    await resolvePassageContexts(db, 1n, [input()]);

    expect(reads).toEqual([]);
  });

  it('should refuse a passage cut from its paragraph and written into another, though its words now occur once', async () => {
    const moved = `${BODY.replace(`${QUOTE} `, '')}\n\nAt last the bell rings. ${QUOTE}`;
    const { db, reads } = drafts([{ ...DRAFT, revision: 6, body: moved }], { 5: BODY });

    await expect(resolvePassageContexts(db, 1n, [input()])).rejects.toMatchObject({ code: 'CHT_009' });
    expect(reads).toEqual(['snapshot']);
  });

  it('should take the quote’s one occurrence when no earlier revision can show what surrounded it', async () => {
    const moved = `${BODY.replace(`${QUOTE} `, '')}\n\nAt last the bell rings. ${QUOTE}`;
    const { db } = drafts([{ ...DRAFT, saveSeq: 10, body: moved }]);

    const [resolved] = await resolvePassageContexts(db, 1n, [input()]);

    expect(resolved?.start).toBe(moved.indexOf(QUOTE));
  });

  it.each([
    ['its words were edited', { ...DRAFT, revision: 6, body: BODY.replace('late tonight', 'early tonight') }],
    ['it moved and now has copies the draft cannot tell apart', { ...DRAFT, saveSeq: 10, body: `${PREFIX}${BODY}\n\n${QUOTE}` }],
    ['the chapter’s draft was replaced', { ...DRAFT, id: 52n }],
  ])('should refuse a passage that changed when %s', async (_name, row) => {
    const { db } = drafts([row]);

    await expect(resolvePassageContexts(db, 1n, [input()])).rejects.toMatchObject({ code: 'CHT_009' });
  });

  it('should refuse a passage from a chapter with no draft', async () => {
    const { db } = drafts([]);

    await expect(resolvePassageContexts(db, 1n, [input()])).rejects.toMatchObject({ code: 'CHT_009' });
  });

  it.each([
    ['a hash of other words', input({ passageHash: passageHash('Something else.') })],
    ['offsets of another length', input({ end: START + QUOTE.length + 3 })],
    ['a blank selection', input({ quote: '\n\n', start: BODY.indexOf('\n\n') })],
    ['half of a surrogate pair', input({ quote: 'Tide \uD83C' })],
    ['a comment holding half of a surrogate pair', input({ comment: 'Too calm \uDF0A' })],
  ])('should refuse a quote with %s as malformed', async (_name, malformed) => {
    const { db } = drafts([DRAFT]);

    await expect(resolvePassageContexts(db, 1n, [malformed])).rejects.toMatchObject({ code: 'CHT_010' });
  });

  it('should refuse an isolated chapter’s passage', async () => {
    const { db } = drafts([{ ...DRAFT, isolated: true }]);

    await expect(resolvePassageContexts(db, 1n, [input()])).rejects.toMatchObject({ code: 'CHT_011' });
  });

  it('should number a passage across paragraphs, and not count a trailing blank line as the next one', async () => {
    const { db } = drafts([DRAFT]);
    const across = 'The ferry waits by the empty pier.\n\nGulls cry';
    const trailing = 'The ferry waits by the empty pier.\n\n';

    const resolved = await resolvePassageContexts(db, 1n, [input({ quote: across }), input({ quote: trailing })]);

    expect(resolved.map(({ firstParagraph, lastParagraph }) => [firstParagraph, lastParagraph])).toEqual([
      [2, 3],
      [2, 2],
    ]);
  });
});

describe('renderTurnContent', () => {
  it('should leave a message without passage comments as it is', () => {
    expect(renderTurnContent('Tighten chapter 3.', null)).toBe('Tighten chapter 3.');
    expect(renderTurnContent('Tighten chapter 3.', [])).toBe('Tighten chapter 3.');
  });

  it('should list each passage after the message with its chapter, revision, paragraphs, range, quote and comment, each on its own lines', () => {
    const rendered = renderTurnContent('Two things.', [context(), context({ firstParagraph: 2, lastParagraph: 3, quote: 'A "pier".\n\nGulls', comment: '' })]);

    expect(rendered).toBe(
      [
        'Two things.',
        '',
        'Passage comments:',
        `1. Chapter 3, revision 5, ¶2 (chars ${START}–${START + QUOTE.length})`,
        '   Quote: "The tide turns late tonight."',
        '   Comment: Make this tenser.',
        `2. Chapter 3, revision 5, ¶2–3 (chars ${START}–${START + QUOTE.length})`,
        '   Quote: "A "pier".',
        '   ',
        '   Gulls"',
        '   Comment: (none)',
      ].join('\n'),
    );
  });

  it('should send the comments alone when the message is empty', () => {
    expect(renderTurnContent('  ', [context()])).toStartWith('Passage comments:\n1. Chapter 3');
  });

  it('should keep a quote’s line breaks, so a screen of the rendered text still finds a refused term that follows one', () => {
    const probe = context({ quote: PROBE_QUOTE });

    expect(findHardLine([renderTurnContent('Look.', [probe])])).not.toBeNull();
    expect(turnScreens('Look.', [probe]).map(screen => screen.source)).toEqual(['Your message', 'The passage you quoted from chapter 3', 'Your comment on chapter 3']);
  });
});

describe('authorWords', () => {
  it('should read the message and the comments, never the quoted chapter text', () => {
    expect(authorWords('Two things.', [context(), context({ comment: '' })])).toBe('Two things.\n\nMake this tenser.');
    expect(authorWords('', [context()])).toBe('Make this tenser.');
  });
});

const SESSION = {
  id: 'session-1',
  projectId: 1n,
  status: 'active',
  scopeType: 'project',
  scopeRef: null,
  mode: 'manual',
  contentMode: null,
  costTier: null,
  summary: null,
  summaryThroughOrdinal: 0,
  createdAt: new Date(0),
};

function chat(contentMode: 'standard' | 'unrestricted', draftRows: DraftRow[] = [DRAFT]) {
  const inserts: Record<string, unknown>[] = [];
  const prompts: { userMessage: string }[] = [];
  const runs: unknown[] = [];
  const db = {
    query: {
      chatSessions: { findFirst: async () => SESSION },
      projects: { findFirst: async () => ({ id: 1n, contentMode }) },
      drafts: { findMany: async () => draftRows },
      draftRevisions: { findFirst: async () => undefined },
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserts.push(values);
        return Object.assign(Promise.resolve(), { returning: async () => [{ id: BigInt(inserts.length), createdAt: new Date(0), ...values }] });
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    select: () => ({ from: () => ({ where: async () => [{ max: 0 }] }) }),
  };
  const modelRouter = {
    resolveModel: () => UNRESTRICTED_DEFAULTS.chat,
    routeModel: () => ({ resolved: { provider: 'p', model: 'm' }, source: 'tier', costTier: 'balanced', contentMode }),
    structured: async (_prompt: unknown, prompt: { userMessage: string }) => {
      prompts.push(prompt);
      return { reply: 'Tightened.' };
    },
  };
  const workflowRunService = {
    runChain: async (_projectId: bigint, _graph: string, _target: string, input: unknown, fn: (runId: string) => Promise<unknown>) => {
      runs.push(input);
      return { runId: 'run-1', result: await fn('run-1') };
    },
    linkContextPack: async () => undefined,
    setParentRun: async () => undefined,
  };
  const service = new ChatService(
    { getPostgresClient: () => db } as never,
    { forNovelChat: async () => ({ id: null, renderedStable: '', renderedVolatile: '' }) } as never,
    modelRouter as never,
    workflowRunService as never,
    {} as never,
    {} as never,
    { getRaw: () => [] } as never,
    {} as never,
    { compactIfNeeded: async () => undefined, buildHistory: async () => [] } as never,
    { resolve: async () => ({ writerClass: 'standard', raised: false, systemMessages: [] }) } as never,
    { publish: () => undefined } as never,
    { read: async () => ({ text: '' }) } as never,
    { modeFor: async () => 'off' } as never,
    {} as never,
  );
  return { service, inserts, prompts, runs };
}

function historyOf(stored: Record<string, unknown>[], turnMode: 'standard' | 'unrestricted') {
  const db = { query: { chatMessages: { findMany: async () => stored } } };
  const compaction = new ChatCompactionService({ getPostgresClient: () => db } as never, {} as never, {} as never, {} as never);
  return compaction.buildHistory(SESSION as never, { contentMode: turnMode }, turnMode);
}

describe('ChatService.turn with passage comments', () => {
  it('should store the anchored passages on the author’s message and show the model the same rendering a later turn’s history does', async () => {
    const run = chat('standard', [{ ...DRAFT, revision: 6, body: `${PREFIX}${BODY}` }]);

    const result = await run.service.turn(1n, 'session-1', 'Two things.', undefined, { contexts: [input()] });

    const stored = run.inserts[0] as Record<string, unknown>;
    expect(stored['content']).toBe('Two things.');
    expect(stored['contexts']).toEqual([context({ revision: 6, start: START + PREFIX.length, end: START + PREFIX.length + QUOTE.length, firstParagraph: 3, lastParagraph: 3 })]);
    const history = await historyOf([{ ...stored, role: 'user' }], 'standard');
    expect(history.map(message => message.content)).toEqual([run.prompts[0]?.userMessage]);
    expect(run.prompts[0]?.userMessage).toContain('Passage comments:\n1. Chapter 3, revision 6, ¶3 ');
    expect(serialiseMessage(result.userMessage).contexts).toEqual([
      {
        kind: 'passage',
        chapter: 3,
        draftId: '41',
        revision: 6,
        saveSeq: 9,
        start: START + PREFIX.length,
        end: START + PREFIX.length + QUOTE.length,
        passageHash: passageHash(QUOTE),
        quote: QUOTE,
        comment: 'Make this tenser.',
        firstParagraph: 3,
        lastParagraph: 3,
      },
    ]);
  });

  it('should store no passages on a message that sent none', async () => {
    const run = chat('standard');

    const result = await run.service.turn(1n, 'session-1', 'Two things.');

    expect(run.inserts[0]?.['contexts']).toBeNull();
    expect(serialiseMessage(result.userMessage).contexts).toBeNull();
  });

  it('should accept an empty message that carries a comment, and refuse one that carries nothing', async () => {
    const run = chat('standard');

    await run.service.turn(1n, 'session-1', '', undefined, { contexts: [input()] });

    expect(run.prompts[0]?.userMessage).toStartWith('Passage comments:');
    await expect(run.service.turn(1n, 'session-1', '   ')).rejects.toMatchObject({ code: 'CHT_012' });
  });

  it('should refuse a passage that changed before the turn starts or saves anything', async () => {
    const run = chat('standard', [{ ...DRAFT, revision: 6, body: BODY.replace('late tonight', 'early tonight') }]);

    await expect(run.service.turn(1n, 'session-1', 'Two things.', undefined, { contexts: [input()] })).rejects.toMatchObject({ code: 'CHT_009' });
    expect(run.runs).toEqual([]);
    expect(run.inserts).toEqual([]);
  });

  it('should refuse a quote holding a refused term after a line break on the unrestricted route, before saving anything', async () => {
    const run = chat('unrestricted', [{ ...DRAFT, body: PROBE_BODY }]);

    const err = await run.service.turn(1n, 'session-1', 'Look.', undefined, { contexts: [input({ quote: PROBE_QUOTE, start: 0 })] }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(isHardLineRefusal(err)).toBe(true);
    expect(err).toMatchObject({ data: { source: 'The passage you quoted from chapter 3' } });
    expect(run.inserts).toEqual([]);
  });

  it.each([['standard'], ['unrestricted']] as const)('should refuse an isolated chapter’s passage on the %s route before the turn starts', async contentMode => {
    const run = chat(contentMode, [{ ...DRAFT, isolated: true }]);

    await expect(run.service.turn(1n, 'session-1', 'Look.', undefined, { contexts: [input()] })).rejects.toMatchObject({ code: 'CHT_011' });
    expect(run.runs).toEqual([]);
    expect(run.inserts).toEqual([]);
  });

  it('should leave a stored message whose quote the hard line refuses out of an unrestricted turn’s history', async () => {
    const stored = { id: 1n, ordinal: 1, role: 'user', content: 'Look.', contexts: [context({ quote: PROBE_QUOTE })], runId: 't1', tokens: 5 };
    const kept = { id: 2n, ordinal: 2, role: 'user', content: 'The harbour at dawn.', contexts: null, runId: 't2', tokens: 5 };

    const history = await historyOf([stored, kept], 'unrestricted');

    expect(history.map(message => message.content)).toEqual(['The harbour at dawn.']);
  });
});
