import { describe, expect, it, mock } from 'bun:test';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler, FULL_CAST_MAX, PREV_ENDING_TAIL } from '@modules/ai/context/context-assembler.service';
import { applyBudget, countTokens, truncateAtParagraph, truncateAtParagraphTail } from '@modules/ai/context/token-budget';
import { DEFAULT_WRITING_INSTRUCTIONS } from '@modules/ai/prompts/authoring-preamble';
import { PROJECT_ADDITIONS_HEADING } from '@modules/ai/prompts/writing-instructions';
import { emptyPolicy } from '@modules/plugins/plugin-policy.service';

describe('countTokens', () => {
  it('returns a positive integer for a non-empty string', () => {
    const result = countTokens('hello world');
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('returns 0 for an empty string', () => {
    expect(countTokens('')).toBe(0);
  });
});

describe('truncateAtParagraph', () => {
  it('keeps paragraphs that fit and drops those that exceed maxTokens', () => {
    // Three paragraphs; para1 + para2 fit together, para3 would exceed.
    const para1 = 'Alpha paragraph with some words here.';
    const para2 = 'Beta paragraph with some words here too.';
    const para3 = 'Gamma paragraph with some words here as well, bringing the total over budget.';
    const text = [para1, para2, para3].join('\n\n');

    const twoParasTokens = countTokens(`${para1}\n\n${para2}`);
    const threeParasTokens = countTokens(text);

    const maxTokens = twoParasTokens + Math.floor((threeParasTokens - twoParasTokens) / 2);

    const { text: result, truncated } = truncateAtParagraph(text, maxTokens);
    expect(truncated).toBe(true);
    expect(result).not.toContain('Gamma');
    expect(result).toContain('Alpha');
  });

  it('returns empty string with truncated=true when maxTokens is 0', () => {
    const { text, truncated } = truncateAtParagraph('some text', 0);
    expect(text).toBe('');
    expect(truncated).toBe(true);
  });

  it('returns truncated=false when text fits within budget', () => {
    const short = 'Short text.';
    const { truncated } = truncateAtParagraph(short, 1000);
    expect(truncated).toBe(false);
  });
});

describe('truncateAtParagraphTail', () => {
  it('keeps paragraphs that fit and drops those that exceed maxTokens, from the front', () => {
    // Three paragraphs; para2 + para3 fit together, para1 would exceed — the TAIL is kept.
    const para1 = 'Alpha paragraph with some words here.';
    const para2 = 'Beta paragraph with some words here too.';
    const para3 = 'Gamma paragraph with some words here as well, bringing the total over budget.';
    const text = [para1, para2, para3].join('\n\n');

    const twoParasTokens = countTokens(`${para2}\n\n${para3}`);
    const threeParasTokens = countTokens(text);

    const maxTokens = twoParasTokens + Math.floor((threeParasTokens - twoParasTokens) / 2);

    const { text: result, truncated } = truncateAtParagraphTail(text, maxTokens);
    expect(truncated).toBe(true);
    expect(result).not.toContain('Alpha');
    expect(result).toContain('Gamma');
  });

  it('returns empty string with truncated=true when maxTokens is 0', () => {
    const { text, truncated } = truncateAtParagraphTail('some text', 0);
    expect(text).toBe('');
    expect(truncated).toBe(true);
  });

  it('returns truncated=false when text fits within budget', () => {
    const short = 'Short text.';
    const { truncated } = truncateAtParagraphTail(short, 1000);
    expect(truncated).toBe(false);
  });
});

describe('applyBudget', () => {
  it('greedily keeps sections that fit and skips ones that overflow', () => {
    // sections: [10, 20, 15], budget=25
    // s0=10 fits (used=10), s1=20 skips (10+20=30>25), s2=15 fits (10+15=25)
    const sections = [
      { key: 'a', tokens: 10, label: 'a' },
      { key: 'b', tokens: 20, label: 'b' },
      { key: 'c', tokens: 15, label: 'c' },
    ];
    const { fitting, omitted } = applyBudget(sections, 25);
    expect(fitting.length).toBe(2);
    expect(fitting[0]?.label).toBe('a');
    expect(fitting[1]?.label).toBe('c');
    expect(omitted).toEqual([{ key: 'b', reason: 'budget', tokens: 20 }]);
  });

  it('returns empty array when budget is 0', () => {
    const sections = [{ key: 'x', tokens: 5, label: 'x' }];
    expect(applyBudget(sections, 0).fitting).toHaveLength(0);
  });

  it('returns all sections when all fit within budget', () => {
    const sections = [
      { key: 'a', tokens: 5, label: 'a' },
      { key: 'b', tokens: 5, label: 'b' },
    ];
    expect(applyBudget(sections, 100).fitting).toHaveLength(2);
    expect(applyBudget(sections, 100).omitted).toHaveLength(0);
  });

  it('records omitted sections with reason "budget" when a section overflows', () => {
    const sections = [
      { key: 'fits', tokens: 5 },
      { key: 'overflow', tokens: 50 },
    ];
    const { omitted } = applyBudget(sections, 10);
    expect(omitted).toEqual([{ key: 'overflow', reason: 'budget', tokens: 50 }]);
  });
});

function makeDbStub(overrides: Record<string, unknown> = {}) {
  const defaultQuery = {
    projects: { findFirst: mock(async () => null) },
    briefs: { findFirst: mock(async () => null) },
    chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
    volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
    drafts: { findFirst: mock(async () => null), findMany: mock(async () => []) },
    entities: { findFirst: mock(async () => null), findMany: mock(async () => []) },
    worldFacts: { findMany: mock(async () => []) },
    plotThreads: { findMany: mock(async () => []) },
    mysteries: { findMany: mock(async () => []) },
    characterStates: { findMany: mock(async () => []) },
    entityRelationships: { findMany: mock(async () => []) },
    canonFacts: { findMany: mock(async () => []) },
    contextPacks: { findFirst: mock(async () => null) },
    userFeedback: { findMany: mock(async () => []) },
    decisionLedgerEntries: { findMany: mock(async () => []) },
    bibleDocuments: { findMany: mock(async () => []) },
  };

  const insert = mock(() => ({
    values: mock(() => ({
      onConflictDoNothing: mock(() => ({
        returning: mock(async () => []),
      })),
    })),
  }));

  return {
    insert,
    ...overrides,
    query: { ...defaultQuery, ...(overrides.query ?? {}) },
  };
}

function makeAssembler(dbOverrides: Record<string, unknown> = {}, catalogText = '') {
  const db = makeDbStub(dbOverrides);
  const fakeDatabaseService = { getPostgresClient: () => db } as never;
  const fakeCatalog = { render: mock(async () => catalogText) } as unknown as CatalogService;
  return new ContextAssembler(fakeDatabaseService, fakeCatalog);
}

describe('ContextAssembler.forChapter — isolated-adjacency', () => {
  async function prevEndingFor(prevChapter: Record<string, unknown>): Promise<string | undefined> {
    const prevDraft = { chapter: 4, state: { power: 50 }, body: 'body text' };

    const dbOverrides = {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: null, contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => null) },
        chapters: {
          findFirst: mock(async () => prevChapter),
          findMany: mock(async () => []),
        },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => prevDraft), findMany: mock(async () => [prevDraft]) },
        entities: { findMany: mock(async () => []) },
        worldFacts: { findMany: mock(async () => []) },
        plotThreads: { findMany: mock(async () => []) },
        mysteries: { findMany: mock(async () => []) },
        contextPacks: { findFirst: mock(async () => null) },
        userFeedback: { findMany: mock(async () => []) },
      },
    };

    const assembler = makeAssembler(dbOverrides);
    const pack = await assembler.forChapter(1n, 5, { dryRun: true });
    return pack.sections.find(s => s.key === 'prev_ending')?.rendered;
  }

  it('should render summary+state instead of the prose tail when the previous chapter is isolated', async () => {
    const rendered = await prevEndingFor({
      number: 4,
      generator: 'unrestricted',
      status: 'done',
      summary: 'Iron treaty signed',
      content: 'Long prose...',
      title: 'Ch4',
      isolated: true,
    });

    expect(rendered).toBeDefined();
    expect(rendered).toContain('Summary:');
    expect(rendered).not.toContain('Long prose...');
  });

  it('should contain a human-written previous chapter that is isolated', async () => {
    const rendered = await prevEndingFor({ number: 4, generator: 'human', status: 'done', summary: 'Iron treaty signed', content: 'Long prose...', title: 'Ch4', isolated: true });

    expect(rendered).toContain('Summary:');
    expect(rendered).not.toContain('Long prose...');
  });

  it('should render the verbatim prose tail for a human-written previous chapter that is not isolated', async () => {
    const rendered = await prevEndingFor({ number: 4, generator: 'human', status: 'done', summary: 'Iron treaty signed', content: 'Long prose...', title: 'Ch4', isolated: false });

    expect(rendered).toContain('Long prose...');
  });
});

describe('ContextAssembler.forChapter — prev_ending tail truncation', () => {
  it('keeps the END of the previous chapter, not its opening, when content exceeds PREV_ENDING_TAIL', async () => {
    // Build enough paragraphs that the opening and closing paragraphs can't both fit in the budget.
    const openingPara = 'OPENING_MARKER: '.repeat(80);
    const closingPara = 'CLOSING_MARKER: '.repeat(80);
    const content = [openingPara, closingPara].join('\n\n');
    expect(countTokens(content)).toBeGreaterThan(PREV_ENDING_TAIL);

    const prevChapter = { number: 4, generator: 'standard', status: 'done', summary: 'Something happened', content, title: 'Ch4' };

    const dbOverrides = {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: null, contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => null) },
        chapters: { findFirst: mock(async () => prevChapter), findMany: mock(async () => []) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        entities: { findMany: mock(async () => []) },
        worldFacts: { findMany: mock(async () => []) },
        plotThreads: { findMany: mock(async () => []) },
        mysteries: { findMany: mock(async () => []) },
        contextPacks: { findFirst: mock(async () => null) },
        userFeedback: { findMany: mock(async () => []) },
      },
    };

    const assembler = makeAssembler(dbOverrides);
    const pack = await assembler.forChapter(1n, 5, { dryRun: true });

    const prevEndingSection = pack.sections.find(s => s.key === 'prev_ending');
    expect(prevEndingSection).toBeDefined();
    expect(prevEndingSection?.rendered).toContain('CLOSING_MARKER');
    expect(prevEndingSection?.rendered).not.toContain('OPENING_MARKER');
  });
});

describe('ContextAssembler.forChapter — batch adjacency (unfinalized predecessor)', () => {
  it('includes the previous draft tail, labeled as provisional, when chapter N-1 has no canonical row', async () => {
    const prevDraft = { chapter: 4, state: { power: 50 }, body: 'The forge cooled as the last ember died.' };

    const dbOverrides = {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: null, contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => null) },
        chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => prevDraft), findMany: mock(async () => [prevDraft]) },
        entities: { findMany: mock(async () => []) },
        worldFacts: { findMany: mock(async () => []) },
        plotThreads: { findMany: mock(async () => []) },
        mysteries: { findMany: mock(async () => []) },
        contextPacks: { findFirst: mock(async () => null) },
        userFeedback: { findMany: mock(async () => []) },
      },
    };

    const assembler = makeAssembler(dbOverrides);
    const pack = await assembler.forChapter(1n, 5, { dryRun: true });

    const prevEndingSection = pack.sections.find(s => s.key === 'prev_ending');
    expect(prevEndingSection).toBeDefined();
    expect(prevEndingSection?.tier).toBe('working');
    expect(prevEndingSection?.rendered).toContain('[DRAFT — not yet canon]');
    expect(prevEndingSection?.rendered).toContain('The forge cooled as the last ember died.');

    const continuationSection = pack.sections.find(s => s.key === 'continuation_state');
    expect(continuationSection).toBeDefined();
  });

  it('adds no prev_ending section when neither a canonical row nor a draft exists for N-1', async () => {
    const dbOverrides = {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: null, contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => null) },
        chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        entities: { findMany: mock(async () => []) },
        worldFacts: { findMany: mock(async () => []) },
        plotThreads: { findMany: mock(async () => []) },
        mysteries: { findMany: mock(async () => []) },
        contextPacks: { findFirst: mock(async () => null) },
        userFeedback: { findMany: mock(async () => []) },
      },
    };

    const assembler = makeAssembler(dbOverrides);
    const pack = await assembler.forChapter(1n, 5, { dryRun: true });

    expect(pack.sections.find(s => s.key === 'prev_ending')).toBeUndefined();
  });
});

describe('ContextAssembler.forChapter — established state carry', () => {
  const HIDDEN_TEXT = 'The lamplighter is the missing heir of the salt vault';
  const hiddenFact = { id: 9n, factKey: 'lamplighter_heir', text: HIDDEN_TEXT, constraintNote: null, writerNote: null, revealChapter: 12, source: 'bible', terms: [] };

  function carryOverrides(options: {
    drafts: Record<string, unknown>[];
    finalized?: Record<string, unknown>[];
    facts?: Record<string, unknown>[];
    prevChapter?: Record<string, unknown>;
  }) {
    return {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: null, contentMode: 'standard' })) },
        chapters: { findFirst: mock(async () => options.prevChapter ?? null), findMany: mock(async () => options.finalized ?? []) },
        drafts: { findFirst: mock(async () => options.drafts.find(draft => draft.chapter === 4) ?? null), findMany: mock(async () => options.drafts) },
        canonFacts: { findMany: mock(async () => options.facts ?? []) },
        characterKnowledge: { findMany: mock(async () => []) },
      },
    };
  }

  it('should list unfinalized predecessors by their draft summaries in chapter order', async () => {
    const drafts = [
      { chapter: 4, body: 'Tail of four.', summary: 'The pump failed at the ninth lock.', state: null },
      { chapter: 2, body: 'Tail of two.', summary: 'The barge ran aground on the third shoal.', state: null },
      { chapter: 3, body: 'Tail of three.', summary: '', state: null },
    ];
    const pack = await makeAssembler(carryOverrides({ drafts })).forChapter(1n, 5, { dryRun: true });

    const memory = pack.sections.find(s => s.key === 'memory');
    expect(memory?.tier).toBe('working');
    expect(memory?.rendered).toContain('1. [DRAFT — not yet canon] Ch 2: The barge ran aground on the third shoal.');
    expect(memory?.rendered).toContain('2. [DRAFT — not yet canon] Ch 4: The pump failed at the ninth lock.');
    expect(memory?.rendered).not.toContain('Ch 3:');
  });

  it('should prefer a finalized chapter summary over its draft and keep only the three latest chapters', async () => {
    const finalized = [
      { number: 3, summary: 'CANON_THREE' },
      { number: 1, summary: 'CANON_ONE' },
    ];
    const drafts = [
      { chapter: 3, body: 'x', summary: 'DRAFT_THREE', state: null },
      { chapter: 4, body: 'x', summary: 'DRAFT_FOUR', state: null },
      { chapter: 2, body: 'x', summary: 'DRAFT_TWO', state: null },
    ];
    const pack = await makeAssembler(carryOverrides({ drafts, finalized })).forChapter(1n, 5, { dryRun: true });

    const rendered = pack.sections.find(s => s.key === 'memory')?.rendered ?? '';
    expect(rendered).toContain('1. [DRAFT — not yet canon] Ch 2: DRAFT_TWO');
    expect(rendered).toContain('2. Ch 3: CANON_THREE');
    expect(rendered).toContain('3. [DRAFT — not yet canon] Ch 4: DRAFT_FOUR');
    expect(rendered).not.toContain('DRAFT_THREE');
    expect(rendered).not.toContain('CANON_ONE');
  });

  it('should carry the previous chapter established facts into the continuation state', async () => {
    const state = { lastBeat: 'She pockets the brass key.', establishedFacts: ['The tide gauge read 7 at dusk', 'Her left wrist is sprained'] };
    const pack = await makeAssembler(carryOverrides({ drafts: [{ chapter: 4, body: 'Tail.', summary: 'Four.', state }] })).forChapter(1n, 5, { dryRun: true });

    const continuation = pack.sections.find(s => s.key === 'continuation_state')?.rendered ?? '';
    expect(continuation).toContain('The tide gauge read 7 at dusk');
    expect(continuation).toContain('Her left wrist is sprained');
  });

  it('should withhold a still-hidden fact from the carried state and summaries', async () => {
    const state = { establishedFacts: [HIDDEN_TEXT, 'The ledger sits in the blue chest'] };
    const drafts = [{ chapter: 4, body: 'Tail.', summary: `She guessed it: ${HIDDEN_TEXT}.`, state }];
    const pack = await makeAssembler(carryOverrides({ drafts, facts: [hiddenFact] })).forChapter(1n, 5, { dryRun: true });

    expect(pack.rendered).not.toContain(HIDDEN_TEXT);
    expect(pack.sections.find(s => s.key === 'continuation_state')?.rendered).toContain('The ledger sits in the blue chest');
    expect(pack.sections.find(s => s.key === 'memory')?.rendered).toContain('[withheld]');
  });

  it('should withhold a hidden fact whose text carries quotes and line breaks from the continuation state', async () => {
    const quoted = 'The widow said "the vault key is mine"\nand meant the salt vault';
    const fact = { ...hiddenFact, text: quoted };
    const state = { lastBeat: `She hears it: ${quoted}`, establishedFacts: ['The ledger sits in the blue chest'] };
    const pack = await makeAssembler(carryOverrides({ drafts: [{ chapter: 4, body: 'Tail.', summary: 'Four.', state }], facts: [fact] })).forChapter(1n, 5, { dryRun: true });

    const continuation = pack.sections.find(s => s.key === 'continuation_state')?.rendered ?? '';
    expect(continuation).toContain('[withheld]');
    expect(continuation).not.toContain('the vault key is mine');
    expect(continuation).toContain('The ledger sits in the blue chest');
  });

  it('should drop an established fact that trips a hidden fact term and cap the rest at fifteen', async () => {
    const fact = { ...hiddenFact, terms: ['salt vault'] };
    const entries = ['The lamplighter guards the salt vault door', ...Array.from({ length: 20 }, (_, i) => `Crate ${i} holds ${i + 3} lamps`)];
    const drafts = [{ chapter: 4, body: 'Tail.', summary: 'Four.', state: { establishedFacts: entries } }];
    const pack = await makeAssembler(carryOverrides({ drafts, facts: [fact] })).forChapter(1n, 5, { dryRun: true });

    const continuation = pack.sections.find(s => s.key === 'continuation_state')?.rendered ?? '';
    const rendered = Array.from({ length: 20 }, (_, i) => `Crate ${i} holds ${i + 3} lamps`).filter(entry => continuation.includes(`"${entry}"`));
    expect(rendered).toEqual(Array.from({ length: 15 }, (_, i) => `Crate ${i} holds ${i + 3} lamps`));
    expect(continuation).not.toContain('salt vault');
  });

  it('should render an isolated unfinalized predecessor as scrubbed summary, dropping its free-text state for a standard reader, never its prose tail', async () => {
    const state = { lastBeat: 'She shuts the gate.', characterPositions: 'Mara at the gate.' };
    const drafts = [{ chapter: 4, body: 'ISOLATED_PROSE_TAIL', summary: `Four. ${HIDDEN_TEXT}.`, state, isolated: true }];
    const unrestricted = emptyPolicy('permissive');
    const standardPack = await makeAssembler(carryOverrides({ drafts, facts: [hiddenFact] })).forChapter(1n, 5, { dryRun: true });
    const unrestrictedPack = await makeAssembler(carryOverrides({ drafts, facts: [hiddenFact] })).forChapter(1n, 5, { dryRun: true, policy: unrestricted });

    const ending = standardPack.sections.find(s => s.key === 'prev_ending')?.rendered ?? '';
    expect(ending).toContain('[DRAFT — not yet canon]');
    expect(ending).toContain('Summary: Four. [withheld].');
    expect(ending).not.toContain('Mara at the gate.');
    expect(standardPack.rendered).not.toContain('She shuts the gate.');
    expect(unrestrictedPack.sections.find(s => s.key === 'prev_ending')?.rendered).toContain('She shuts the gate.');
    for (const pack of [standardPack, unrestrictedPack]) {
      expect(pack.rendered).not.toContain('ISOLATED_PROSE_TAIL');
      expect(pack.rendered).not.toContain(HIDDEN_TEXT);
    }
  });

  it('should scrub the isolated finalized predecessor summary and the prose tail of a finalized one', async () => {
    const drafts = [{ chapter: 4, body: 'x', summary: 'x', state: { lastBeat: HIDDEN_TEXT } }];
    const isolated = { number: 4, status: 'done', summary: `Four. ${HIDDEN_TEXT}.`, content: 'x', isolated: true };
    const isolatedPack = await makeAssembler(carryOverrides({ drafts, facts: [hiddenFact], prevChapter: isolated })).forChapter(1n, 5, { dryRun: true });
    expect(isolatedPack.rendered).not.toContain(HIDDEN_TEXT);
    expect(isolatedPack.sections.find(s => s.key === 'prev_ending')?.rendered).toContain('Summary: Four. [withheld].');

    const finalized = { number: 4, status: 'done', summary: 'Four.', content: `The gate shut. ${HIDDEN_TEXT}.`, isolated: false };
    const tailPack = await makeAssembler(carryOverrides({ drafts, facts: [hiddenFact], prevChapter: finalized })).forChapter(1n, 5, { dryRun: true });
    expect(tailPack.sections.find(s => s.key === 'prev_ending')?.rendered).toContain('The gate shut. [withheld].');
  });

  it('should scrub chapter ref summaries for a writer pack but not for the planner', async () => {
    const finalized = [{ number: 3, status: 'done', title: null, summary: `Three. ${HIDDEN_TEXT}.` }];
    const assembler = makeAssembler(carryOverrides({ drafts: [], finalized, facts: [hiddenFact] }));

    const { resolved: writer } = await assembler.resolveRefs(1n, ['chapter:3'], 5);
    expect(writer[0]?.rendered).toContain('Ch 3: Three. [withheld].');

    const { resolved: planner } = await assembler.resolveRefs(1n, ['chapter:3']);
    expect(planner[0]?.rendered).toContain(HIDDEN_TEXT);
  });

  it('should fall back to the draft summary when a finalized chapter has none', async () => {
    const drafts = [{ chapter: 3, body: 'x', summary: 'The weir held overnight.', state: null }];
    const pack = await makeAssembler(carryOverrides({ drafts, finalized: [{ number: 3, summary: '' }] })).forChapter(1n, 5, { dryRun: true });

    const memory = pack.sections.find(s => s.key === 'memory');
    expect(memory?.rendered).toContain('1. Ch 3: The weir held overnight.');
    expect(memory?.tier).toBe('canonical');
  });
});

describe('ContextAssembler.forNovelChat — planner-only pages', () => {
  it('should list the organised timeline by address alone, so its content reaches a chat turn only through a lookup', async () => {
    const bibleDocuments = [
      { section: 'project', slug: 'timeline', frontmatter: null, body: '# Timeline\n\n## The ending\n\n- The ferryman takes the throne' },
      { section: 'world', slug: 'river', frontmatter: { title: 'The River' }, body: 'The river runs east.' },
    ];
    const assembler = makeAssembler({
      query: {
        bibleDocuments: { findMany: mock(async () => bibleDocuments) },
        briefs: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        milestones: { findMany: mock(async () => []) },
      },
      $count: mock(async () => 0),
    });
    const pack = await assembler.forNovelChat(1n, new Date(1), { promptTokens: 4_000, requestTokens: 0 });
    const inventory = pack.sections.find(section => section.key === 'inventory')?.rendered ?? '';

    expect(inventory).toContain('world/river');
    expect(inventory).toContain('project/timeline (planner-only');
    expect(pack.rendered).not.toContain('takes the throne');
    expect(pack.rendered).not.toContain('The river runs east.');
  });
});

describe('ContextAssembler — writer-pack scrub', () => {
  const HIDDEN_TEXT = 'The ferryman is the drowned heir of the tide court';
  const TERM = 'tide court';
  const hiddenFact = { id: 21n, factKey: 'ferryman_heir', text: HIDDEN_TEXT, constraintNote: null, writerNote: null, revealChapter: 12, source: 'bible', terms: [TERM] };
  const ferryman = {
    id: 30n,
    entityKey: 'ferryman',
    name: 'Ferryman',
    type: 'character',
    status: 'active',
    body: `Poles the night barge. ${HIDDEN_TEXT}.`,
    notes: null,
    aliases: [],
  };

  interface ScrubFixture {
    brief?: Record<string, unknown>;
    volume?: Record<string, unknown>;
    drafts?: Record<string, unknown>[];
    prevChapter?: Record<string, unknown>;
    characterStates?: Record<string, unknown>[];
    entityRelationships?: Record<string, unknown>[];
    bibleDocuments?: Record<string, unknown>[];
    instructions?: string | null;
  }

  function scrubDb(fixture: ScrubFixture) {
    const brief = { id: 1n, projectId: 1n, chapter: 5, body: 'Brief body.', contextRefs: [], pov: null, volumeKey: null, ...fixture.brief };
    const drafts = fixture.drafts ?? [];
    return {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: fixture.instructions ?? null, contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => brief) },
        chapters: { findFirst: mock(async () => fixture.prevChapter ?? null), findMany: mock(async () => []) },
        volumes: { findFirst: mock(async () => fixture.volume ?? null), findMany: mock(async () => (fixture.volume ? [fixture.volume] : [])) },
        drafts: { findFirst: mock(async () => drafts.find(draft => draft.chapter === 4) ?? null), findMany: mock(async () => drafts) },
        entities: { findFirst: mock(async () => ferryman), findMany: mock(async () => [ferryman]) },
        characterStates: { findMany: mock(async () => fixture.characterStates ?? []) },
        entityRelationships: { findMany: mock(async () => fixture.entityRelationships ?? []) },
        bibleDocuments: { findMany: mock(async () => fixture.bibleDocuments ?? []) },
        canonFacts: { findMany: mock(async () => [hiddenFact]) },
        characterKnowledge: { findMany: mock(async () => []) },
      },
    };
  }

  function sectionOf(pack: { sections: { key: string; rendered: string }[] }, key: string): string {
    return pack.sections.find(section => section.key === key)?.rendered ?? '';
  }

  it('should withhold a hidden fact from the rendered character state', async () => {
    const characterStates = [
      {
        id: 1n,
        projectId: 1n,
        entityKey: 'ferryman',
        location: 'the lower quay',
        conditions: null,
        immediateGoal: null,
        statusNote: `Suspects ${HIDDEN_TEXT}`,
        lastUpdatedChapter: 4,
      },
    ];
    const pack = await makeAssembler(scrubDb({ brief: { pov: 'ferryman' }, characterStates })).forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    const state = sectionOf(pack, 'character_state');
    expect(state).toContain('Status: Suspects [withheld]');
    expect(state).toContain('Location: the lower quay');
    expect(pack.rendered).not.toContain(HIDDEN_TEXT);
  });

  it('should withhold a hidden fact from the rendered relationship notes', async () => {
    const entityRelationships = [{ id: 1n, projectId: 1n, entityId: 30n, targetKey: 'warden', kind: 'rival', note: `Knows that ${HIDDEN_TEXT}`, chapter: 3 }];
    const pack = await makeAssembler(scrubDb({ brief: { pov: 'ferryman' }, entityRelationships })).forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    const relationships = sectionOf(pack, 'relationships');
    expect(relationships).toContain('Ferryman → warden (rival): Knows that [withheld] [ch 3]');
    expect(relationships).not.toContain(HIDDEN_TEXT);
  });

  it('should withhold a hidden fact from the POV card, entity refs, bible documents and writing style', async () => {
    const bibleDocuments = [{ section: 'world', slug: 'river', body: `The river runs east. ${HIDDEN_TEXT}.` }];
    const fixture = scrubDb({ brief: { pov: 'ferryman', contextRefs: ['bible_doc:world/river'] }, bibleDocuments, instructions: `Keep it quiet: ${HIDDEN_TEXT}.` });
    const pack = await makeAssembler(fixture).forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    expect(sectionOf(pack, 'ref:entity:ferryman')).toContain('Poles the night barge. [withheld].');
    expect(sectionOf(pack, 'ref:bible_doc:world/river')).toContain('The river runs east. [withheld].');
    expect(sectionOf(pack, 'writing_style')).toContain('Keep it quiet: [withheld].');
    expect(pack.rendered).not.toContain(HIDDEN_TEXT);
  });

  it('should never carry the organised timeline or the open questions into a chapter pack, even when a brief cites them', async () => {
    const bibleDocuments = [
      { section: 'project', slug: 'timeline', body: '# Timeline\n\n## The ending\n\n- The ferryman takes the throne' },
      { section: 'project', slug: 'open-questions', body: '# Open questions\n\n1. **Who drowned the heir?**' },
      { section: 'world', slug: 'river', body: 'The river runs east.' },
    ];
    const fixture = scrubDb({ brief: { contextRefs: ['bible_doc:project/timeline', 'bible_doc:project/open-questions', 'bible_doc:world/river'] }, bibleDocuments });
    const assembler = makeAssembler(fixture);
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    expect(sectionOf(pack, 'ref:bible_doc:world/river')).toContain('The river runs east.');
    expect(pack.rendered).not.toContain('takes the throne');
    expect(pack.rendered).not.toContain('Who drowned the heir');
    expect(await assembler.sanitizeOutlinedRefs(1n, ['bible_doc:project/timeline', 'bible_doc:world/river'])).toEqual({
      kept: ['bible_doc:world/river'],
      dropped: ['bible_doc:project/timeline'],
    });
  });

  it('should label a stale predecessor draft in its ending, carried state and summary', async () => {
    const drafts = [
      { chapter: 4, body: 'The barge slid under the bridge.', summary: 'The barge crossed.', state: { lastBeat: 'Lanterns out.' }, staleReason: 'ancestor chapter 2 was revised' },
    ];
    const pack = await makeAssembler(scrubDb({ drafts })).forChapter(1n, 5, { dryRun: true });

    expect(sectionOf(pack, 'prev_ending')).toContain('[DRAFT — not yet canon]\n[STALE — may not match the current plan]\nThe barge slid under the bridge.');
    expect(sectionOf(pack, 'continuation_state')).toContain('[STALE — may not match the current plan]\n{"lastBeat":"Lanterns out."}');
    expect(sectionOf(pack, 'memory')).toContain('1. [DRAFT — not yet canon] [STALE — may not match the current plan] Ch 4: The barge crossed.');
  });

  it('should label a stale isolated predecessor draft', async () => {
    const drafts = [{ chapter: 4, body: 'x', summary: 'The barge crossed.', state: null, isolated: true, staleReason: 'a chapter was inserted after this point' }];
    const pack = await makeAssembler(scrubDb({ drafts })).forChapter(1n, 5, { dryRun: true });

    expect(sectionOf(pack, 'prev_ending')).toContain('[DRAFT — not yet canon]\n[STALE — may not match the current plan]\nSummary: The barge crossed.');
  });

  it('should leave a fresh predecessor draft unlabelled', async () => {
    const drafts = [{ chapter: 4, body: 'The barge slid under the bridge.', summary: 'The barge crossed.', state: { lastBeat: 'Lanterns out.' }, staleReason: null }];
    const pack = await makeAssembler(scrubDb({ drafts })).forChapter(1n, 5, { dryRun: true });

    expect(pack.rendered).not.toContain('[STALE');
  });

  it('should withhold a hidden fact named by a carried state key', async () => {
    const state = { [HIDDEN_TEXT]: true, 'fact:ferryman_heir': 'settled', nested: { [`${HIDDEN_TEXT} (rumour)`]: 'spreading' }, barge: 'moored' };
    const drafts = [{ chapter: 4, body: 'Tail.', summary: 'Four.', state, staleReason: null }];
    const pack = await makeAssembler(scrubDb({ drafts })).forChapter(1n, 5, { dryRun: true });

    const continuation = sectionOf(pack, 'continuation_state');
    expect(continuation).toContain('"[withheld]":true');
    expect(continuation).toContain('"[withheld] (2)":"settled"');
    expect(continuation).toContain('"[withheld] (rumour)":"spreading"');
    expect(continuation).toContain('"barge":"moored"');
    expect(continuation).not.toContain(HIDDEN_TEXT);
    expect(continuation).not.toContain('ferryman_heir');
  });

  it('should withhold a reveal term from the volume goal before the reveal chapter', async () => {
    const volume = { volumeKey: 'vol_1', ordinal: 1, objective: `Win back the ${TERM}.` };
    const pack = await makeAssembler(scrubDb({ brief: { volumeKey: 'vol_1' }, volume })).forChapter(1n, 5, { dryRun: true });

    expect(sectionOf(pack, 'volume_objective')).toContain('Win back the [withheld].');
    expect(pack.rendered).not.toContain(TERM);
  });

  it('should let the reveal chapter read the volume goal in full', async () => {
    const volume = { volumeKey: 'vol_1', ordinal: 1, objective: `Win back the ${TERM}.` };
    const pack = await makeAssembler(scrubDb({ brief: { chapter: 12, volumeKey: 'vol_1' }, volume })).forChapter(1n, 12, { dryRun: true });

    expect(sectionOf(pack, 'volume_objective')).toContain(`Win back the ${TERM}.`);
  });

  it('should withhold a reveal term from a volume ref for the writer but not for the planner', async () => {
    const volume = { volumeKey: 'vol_1', ordinal: 1, title: 'The River', objective: `Win back the ${TERM}.` };
    const assembler = makeAssembler(scrubDb({ brief: { volumeKey: 'vol_1' }, volume }));

    const { resolved: writer } = await assembler.resolveRefs(1n, ['volume:vol_1'], 5);
    expect(writer[0]?.rendered).toContain('Goal: Win back the [withheld].');
    expect(writer[0]?.rendered).not.toContain(TERM);

    const { resolved: planner } = await assembler.resolveRefs(1n, ['volume:vol_1']);
    expect(planner[0]?.rendered).toContain(`Goal: Win back the ${TERM}.`);
  });

  it('should leave the planner outline pack unscrubbed', async () => {
    const volume = { volumeKey: 'vol_1', ordinal: 1, objective: `Win back the ${TERM}. ${HIDDEN_TEXT}` };
    const pack = await makeAssembler(scrubDb({ brief: { volumeKey: 'vol_1' }, volume })).forOutline(1n, 5, { budgetTokens: 100_000, dryRun: true } as never);

    expect(sectionOf(pack, 'volume_objective')).toContain(`Win back the ${TERM}.`);
    expect(sectionOf(pack, 'volume_objective')).toContain(HIDDEN_TEXT);
  });

  it('should plan an inserted chapter under exactly the volume its caller resolved', async () => {
    const volume = { volumeKey: 'vol_1', ordinal: 1, objective: 'Win back the ferry.' };
    const fixture = scrubDb({ brief: { volumeKey: 'vol_1' }, volume });

    const unassigned = await makeAssembler(fixture).forOutline(1n, 5, { budgetTokens: 100_000, dryRun: true, insertAfter: 4, volumeKey: null } as never);
    expect(unassigned.sections.some(section => section.key === 'volume_objective')).toBe(false);
    expect(fixture.query.briefs.findFirst).not.toHaveBeenCalled();

    const assigned = await makeAssembler(fixture).forOutline(1n, 5, { budgetTokens: 100_000, dryRun: true, insertAfter: 4, volumeKey: 'vol_1' } as never);
    expect(sectionOf(assigned, 'volume_objective')).toContain('Win back the ferry.');
  });
});

describe('ContextAssembler.forOutline — retrieval absent', () => {
  it('returns pack with no lore_retrieved or prose_retrieved sections', async () => {
    const assembler = makeAssembler({}, 'catalog text');
    const pack = await assembler.forOutline(1n, 3, { budgetTokens: 100_000 });

    const sectionKeys = pack.sections.map(s => s.key);
    expect(sectionKeys).not.toContain('lore_retrieved');
    expect(sectionKeys).not.toContain('prose_retrieved');
  });
});

describe('ContextAssembler.forChapter — no brief', () => {
  it('assembles a pack without brief section when no brief exists', async () => {
    const dbOverrides = {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: 'write well', contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => null) },
        chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        entities: { findMany: mock(async () => []) },
        worldFacts: { findMany: mock(async () => []) },
        plotThreads: { findMany: mock(async () => []) },
        mysteries: { findMany: mock(async () => []) },
        contextPacks: { findFirst: mock(async () => null) },
        userFeedback: { findMany: mock(async () => []) },
      },
    };

    const assembler = makeAssembler(dbOverrides);
    const pack = await assembler.forChapter(1n, 1, { dryRun: true });

    const sectionKeys = pack.sections.map(s => s.key);
    expect(sectionKeys).not.toContain('brief');
    expect(sectionKeys).toContain('writing_style');
  });

  it('falls back to the default writing instructions when the project has none', async () => {
    const dbOverrides = {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: null, contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => null) },
        chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        entities: { findMany: mock(async () => []) },
        worldFacts: { findMany: mock(async () => []) },
        plotThreads: { findMany: mock(async () => []) },
        mysteries: { findMany: mock(async () => []) },
        contextPacks: { findFirst: mock(async () => null) },
        userFeedback: { findMany: mock(async () => []) },
      },
    };

    const assembler = makeAssembler(dbOverrides);
    const pack = await assembler.forChapter(1n, 1, { dryRun: true });

    // The chapter generator must always be told how to write, even absent a project override.
    const writingStyle = pack.sections.find(s => s.key === 'writing_style');
    expect(writingStyle).toBeDefined();
    expect(writingStyle?.rendered).toContain(DEFAULT_WRITING_INSTRUCTIONS.slice(0, 40));
    expect(writingStyle?.rendered).toContain('Pacing and endings');
  });

  it('should send the default once, then the project additions, when the stored instructions embed a copy of the default', async () => {
    const dbOverrides = {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: `${DEFAULT_WRITING_INSTRUCTIONS}\n\nWRITING_STYLE_MARKER`, contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => null) },
        chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        entities: { findMany: mock(async () => []) },
        worldFacts: { findMany: mock(async () => []) },
        plotThreads: { findMany: mock(async () => []) },
        mysteries: { findMany: mock(async () => []) },
        contextPacks: { findFirst: mock(async () => null) },
        userFeedback: { findMany: mock(async () => []) },
      },
    };

    const pack = await makeAssembler(dbOverrides).forChapter(1n, 1, { dryRun: true });
    const rendered = pack.sections.find(s => s.key === 'writing_style')?.rendered ?? '';

    expect(rendered.split(DEFAULT_WRITING_INSTRUCTIONS)).toHaveLength(2);
    expect(rendered.indexOf(DEFAULT_WRITING_INSTRUCTIONS)).toBeLessThan(rendered.indexOf(PROJECT_ADDITIONS_HEADING));
    expect(rendered.indexOf(PROJECT_ADDITIONS_HEADING)).toBeLessThan(rendered.indexOf('WRITING_STYLE_MARKER'));
  });
});

describe('ContextAssembler.forChapter — volume goal', () => {
  function overrides(brief: Record<string, unknown>) {
    const volumes = { findFirst: mock(async () => ({ volumeKey: 'v1', ordinal: 1, objective: 'Topple the treaty.' })), findMany: mock(async () => []) };
    return {
      volumes,
      db: {
        query: {
          projects: { findFirst: mock(async () => ({ id: 1n, instructions: null, contentMode: 'standard' })) },
          briefs: { findFirst: mock(async () => ({ id: 1n, projectId: 1n, chapter: 5, body: 'Chapter body.', contextRefs: [], ...brief })) },
          chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
          volumes,
          drafts: { findFirst: mock(async () => null), findMany: mock(async () => []) },
          entities: { findMany: mock(async () => []) },
          worldFacts: { findMany: mock(async () => []) },
          plotThreads: { findMany: mock(async () => []) },
          mysteries: { findMany: mock(async () => []) },
          contextPacks: { findFirst: mock(async () => null) },
          userFeedback: { findMany: mock(async () => []) },
        },
      },
    };
  }

  it('should give the writer the goal of the volume the brief names', async () => {
    const { db } = overrides({ volumeKey: 'v1' });
    const pack = await makeAssembler(db).forChapter(1n, 5, { dryRun: true });

    const section = pack.sections.find(s => s.key === 'volume_objective');
    expect(section?.rendered).toContain('Topple the treaty.');
    expect(section?.sourceRefs).toEqual(['volume:v1']);
  });

  it('should leave the volume goal out when the brief names no volume, without looking one up', async () => {
    const { db, volumes } = overrides({ volumeKey: null });
    const pack = await makeAssembler(db).forChapter(1n, 5, { dryRun: true });

    expect(pack.sections.some(s => s.key === 'volume_objective')).toBe(false);
    expect(volumes.findFirst).not.toHaveBeenCalled();
  });
});

describe('ContextAssembler.forChapter — stable/volatile split', () => {
  const brief = { id: 1n, projectId: 1n, chapter: 5, body: 'Chapter body.', contextRefs: ['entity:mira'], volumeKey: 'v1' };
  const volume = { volumeKey: 'v1', ordinal: 1, objective: 'VOLUME_OBJECTIVE_MARKER' };
  const entity = { entityKey: 'mira', name: 'Mira', type: 'character', status: 'active', origin: 'extracted', body: 'ENTITY_CARD_MARKER', notes: null, aliases: [] };

  function overrides(prevContent: string) {
    return {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: 'WRITING_STYLE_MARKER', contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => brief) },
        chapters: {
          findFirst: mock(async () => ({ number: 4, generator: 'claude', status: 'done', content: prevContent, summary: 'ch4' })),
          findMany: mock(async () => [{ number: 4, summary: 'MEMORY_MARKER' }]),
        },
        volumes: { findFirst: mock(async () => volume), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => ({ state: { lastBeat: 'CONTINUATION_MARKER' } })), findMany: mock(async () => []) },
        entities: { findMany: mock(async () => [entity]) },
        worldFacts: { findMany: mock(async () => []) },
        plotThreads: { findMany: mock(async () => []) },
        mysteries: { findMany: mock(async () => []) },
        contextPacks: { findFirst: mock(async () => null) },
        userFeedback: { findMany: mock(async () => []) },
      },
    };
  }

  it('should mark the volume goal, writing style, and canon cards stable and the per-chapter sections volatile', async () => {
    const assembler = makeAssembler(overrides('PREV_ENDING_MARKER'));
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    const segments = Object.fromEntries(pack.sections.map(s => [s.key, s.segment]));
    expect(segments).toMatchObject({
      volume_objective: 'stable',
      writing_style: 'stable',
      'ref:entity:mira': 'stable',
      prev_ending: 'volatile',
      continuation_state: 'volatile',
      memory: 'volatile',
    });

    for (const marker of ['VOLUME_OBJECTIVE_MARKER', 'WRITING_STYLE_MARKER', 'ENTITY_CARD_MARKER']) {
      expect(pack.renderedStable).toContain(marker);
      expect(pack.renderedVolatile).not.toContain(marker);
    }
    for (const marker of ['PREV_ENDING_MARKER', 'CONTINUATION_MARKER', 'MEMORY_MARKER']) {
      expect(pack.renderedVolatile).toContain(marker);
      expect(pack.renderedStable).not.toContain(marker);
    }
  });

  it('keeps the stable segment byte-identical when only per-chapter content changes', async () => {
    const pack5 = await makeAssembler(overrides('ENDING_A')).forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });
    const pack6 = await makeAssembler(overrides('ENDING_B')).forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    expect(pack5.renderedStable.length).toBeGreaterThan(0);
    expect(pack6.renderedStable).toBe(pack5.renderedStable);
    expect(pack6.renderedVolatile).not.toBe(pack5.renderedVolatile);
  });
});

describe('ContextAssembler.forChapter — FULL_CAST_MAX', () => {
  it(`moves entity refs beyond FULL_CAST_MAX (${FULL_CAST_MAX}) to end of section list`, async () => {
    const entityRefs = Array.from({ length: 7 }, (_, i) => `entity:ent${i}`);

    const entityRows = entityRefs.map((ref, i) => ({
      entityKey: `ent${i}`,
      name: `Entity ${i}`,
      type: 'character',
      status: 'active',
      origin: 'extracted',
      body: `Body for entity ${i}`,
      notes: null,
      aliases: [],
    }));

    const dbOverrides = {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: 'style', contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => ({ id: 1n, projectId: 1n, chapter: 5, body: 'Brief body', contextRefs: entityRefs })) },
        chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        entities: { findMany: mock(async () => entityRows) },
        worldFacts: { findMany: mock(async () => []) },
        plotThreads: { findMany: mock(async () => []) },
        mysteries: { findMany: mock(async () => []) },
        contextPacks: { findFirst: mock(async () => null) },
        userFeedback: { findMany: mock(async () => []) },
      },
    };

    const assembler = makeAssembler(dbOverrides);
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    const sectionKeys = pack.sections.map(s => s.key);
    const entitySectionKeys = sectionKeys.filter(k => k.startsWith('ref:entity:'));

    expect(entitySectionKeys.length).toBe(7);

    const memoryIdx = sectionKeys.indexOf('memory');
    const writingStyleIdx = sectionKeys.indexOf('writing_style');
    const lastPriorityIdx = Math.max(memoryIdx !== -1 ? memoryIdx : 0, writingStyleIdx !== -1 ? writingStyleIdx : 0);

    const excessKeys = ['ref:entity:ent5', 'ref:entity:ent6'];
    for (const key of excessKeys) {
      const idx = sectionKeys.indexOf(key);
      expect(idx).toBeGreaterThan(lastPriorityIdx);
    }

    const priorityKeys = ['ref:entity:ent0', 'ref:entity:ent1', 'ref:entity:ent2', 'ref:entity:ent3', 'ref:entity:ent4'];
    for (const key of priorityKeys) {
      const idx = sectionKeys.indexOf(key);
      if (memoryIdx !== -1) expect(idx).toBeLessThan(memoryIdx);
    }
  });
});

describe('ContextAssembler.forChapter — POV entity card', () => {
  const POV_TAIL = 'THE_LAST_PARAGRAPH_OF_THE_POV_CARD';
  const povBody = `${Array.from({ length: 12 }, (_, i) => `Paragraph ${i}. ${'Amara remembers the docks and the ledger and the rain. '.repeat(12)}`).join('\n\n')}\n\n${POV_TAIL}`;
  const amara = { id: 10n, entityKey: 'amara', name: 'Amara', type: 'character', status: 'active', origin: 'extracted', body: povBody, notes: null, aliases: [] };

  function povDb(contextRefs: string[], pov: string | null, entities: { entityKey: string }[] = [amara]) {
    return {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: 'style', contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => ({ id: 1n, projectId: 1n, chapter: 5, body: 'Brief body', contextRefs, pov })) },
        entities: {
          findFirst: mock(async () => entities.find(e => e.entityKey === pov) ?? null),
          findMany: mock(async () => entities),
        },
      },
    };
  }

  it('should render the POV card in full while other entity cards stay capped', async () => {
    const assembler = makeAssembler(povDb(['entity:amara'], 'amara'));
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    const section = pack.sections.find(s => s.key === 'ref:entity:amara');
    expect(countTokens(povBody)).toBeGreaterThan(350);
    expect(section?.rendered).toContain(POV_TAIL);
    expect(section?.segment).toBe('stable');

    const capped = await makeAssembler(povDb(['entity:amara'], null)).forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });
    expect(capped.sections.find(s => s.key === 'ref:entity:amara')?.rendered).not.toContain(POV_TAIL);
  });

  it('should include the POV card even when the brief never lists it as a context ref', async () => {
    const assembler = makeAssembler(povDb([], 'amara'));
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    const section = pack.sections.find(s => s.key === 'ref:entity:amara');
    expect(section).toBeDefined();
    expect(section?.rendered).toContain('**Amara**');
    expect(section?.rendered).toContain(POV_TAIL);
  });

  it('should keep the POV card in the priority slice when the brief already names FULL_CAST_MAX other entities', async () => {
    const others = Array.from({ length: FULL_CAST_MAX + 1 }, (_, i) => ({
      entityKey: `ent${i}`,
      name: `Entity ${i}`,
      type: 'character',
      status: 'active',
      origin: 'extracted',
      body: `Body for entity ${i}`,
      notes: null,
      aliases: [],
    }));
    const refs = [...others.map(e => `entity:${e.entityKey}`), 'entity:amara'];
    const assembler = makeAssembler(povDb(refs, 'amara', [...others, amara]));
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    const keys = pack.sections.map(s => s.key);
    const povIdx = keys.indexOf('ref:entity:amara');
    const memoryIdx = keys.indexOf('writing_style');
    expect(povIdx).toBe(keys.findIndex(k => k.startsWith('ref:entity:')));
    expect(povIdx).toBeLessThan(memoryIdx);
    expect(pack.sections[povIdx]?.rendered).toContain(POV_TAIL);
    expect(keys.filter(k => k.startsWith('ref:entity:')).length).toBe(FULL_CAST_MAX + 2);
  });

  it('should degrade gracefully when pov names an entity that does not exist', async () => {
    const assembler = makeAssembler(povDb(['entity:amara'], 'ghost'));
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    expect(pack.sections.find(s => s.key === 'ref:entity:ghost')).toBeUndefined();
    expect(pack.unresolvedRefs).toContain('entity:ghost');
  });
});

describe('ContextAssembler.forChapter — dynamic cast state', () => {
  const amara = { id: 10n, entityKey: 'amara', name: 'Amara', type: 'character', status: 'active', origin: 'extracted', body: 'A smuggler.', notes: null, aliases: [] };
  const rook = { id: 11n, entityKey: 'rook', name: 'Rook', type: 'character', status: 'active', origin: 'extracted', body: 'A rival.', notes: null, aliases: [] };

  function castDb(overrides: { contextRefs?: string[]; pov?: string | null; entities?: { entityKey: string }[]; characterStates?: unknown[]; entityRelationships?: unknown[] }) {
    return {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: 'style', contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => ({ id: 1n, projectId: 1n, chapter: 5, body: 'Brief body', contextRefs: overrides.contextRefs ?? [], pov: overrides.pov ?? null })) },
        entities: {
          findFirst: mock(async () => (overrides.entities ?? []).find(e => e.entityKey === overrides.pov) ?? null),
          findMany: mock(async () => overrides.entities ?? []),
        },
        characterStates: { findMany: mock(async () => overrides.characterStates ?? []) },
        entityRelationships: { findMany: mock(async () => overrides.entityRelationships ?? []) },
      },
    };
  }

  it('should render the current location, conditions, goal and status for a character in the brief cast', async () => {
    const assembler = makeAssembler(
      castDb({
        contextRefs: ['entity:amara'],
        entities: [amara],
        characterStates: [
          {
            id: 1n,
            projectId: 1n,
            entityKey: 'amara',
            location: 'the docks',
            conditions: ['wounded', 'hunted'],
            immediateGoal: 'find the ledger',
            statusNote: 'shaken',
            lastUpdatedChapter: 4,
          },
        ],
      }),
    );
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    const section = pack.sections.find(s => s.key === 'character_state');
    expect(section).toBeDefined();
    expect(section?.segment).toBe('volatile');
    expect(section?.rendered).toContain('**Amara** (as of ch 4)');
    expect(section?.rendered).toContain('Location: the docks');
    expect(section?.rendered).toContain('Conditions: wounded, hunted');
    expect(section?.rendered).toContain('Goal: find the ledger');
    expect(section?.rendered).toContain('Status: shaken');
  });

  it('should include the POV character state even when the brief lists no entity refs', async () => {
    const assembler = makeAssembler(
      castDb({
        pov: 'amara',
        entities: [amara],
        characterStates: [{ id: 1n, projectId: 1n, entityKey: 'amara', location: 'the safehouse', conditions: null, immediateGoal: null, statusNote: null, lastUpdatedChapter: 4 }],
      }),
    );
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    expect(pack.sections.find(s => s.key === 'character_state')?.rendered).toContain('Location: the safehouse');
  });

  it('should render only the still-current fields once a continuity update clears the others', async () => {
    const assembler = makeAssembler(
      castDb({
        contextRefs: ['entity:amara'],
        entities: [amara],
        characterStates: [{ id: 1n, projectId: 1n, entityKey: 'amara', location: 'the market', conditions: null, immediateGoal: null, statusNote: 'wary', lastUpdatedChapter: 5 }],
      }),
    );
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    const section = pack.sections.find(s => s.key === 'character_state');
    expect(section?.rendered).toContain('Location: the market');
    expect(section?.rendered).toContain('Status: wary');
    expect(section?.rendered).not.toContain('Conditions:');
    expect(section?.rendered).not.toContain('Goal:');
    expect(pack.rendered).not.toContain('injured');
  });

  it('should exclude character state for an entity outside the chapter cast', async () => {
    const assembler = makeAssembler(
      castDb({
        contextRefs: ['entity:amara'],
        entities: [amara, rook],
        characterStates: [
          { id: 1n, projectId: 1n, entityKey: 'amara', location: 'the docks', conditions: null, immediateGoal: null, statusNote: null, lastUpdatedChapter: 4 },
          { id: 2n, projectId: 1n, entityKey: 'rook', location: 'THE_STALE_TOWER', conditions: null, immediateGoal: null, statusNote: null, lastUpdatedChapter: 2 },
        ],
      }),
    );
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    const section = pack.sections.find(s => s.key === 'character_state');
    expect(section?.rendered).toContain('the docks');
    expect(section?.rendered).not.toContain('THE_STALE_TOWER');
    expect(pack.rendered).not.toContain('THE_STALE_TOWER');
  });

  it('should keep only the most recent relationship row per entity, target and kind', async () => {
    const assembler = makeAssembler(
      castDb({
        contextRefs: ['entity:amara'],
        entities: [amara],
        entityRelationships: [
          { id: 1n, projectId: 1n, entityId: 10n, targetKey: 'rook', kind: 'rival', note: 'STALE_TRADED_THREATS', chapter: 2 },
          { id: 2n, projectId: 1n, entityId: 10n, targetKey: 'rook', kind: 'rival', note: 'CURRENT_UNEASY_ALLIANCE', chapter: 4 },
        ],
      }),
    );
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    const section = pack.sections.find(s => s.key === 'relationships');
    expect(section).toBeDefined();
    expect(section?.segment).toBe('volatile');
    expect(section?.rendered).toContain('Amara → rook (rival): CURRENT_UNEASY_ALLIANCE [ch 4]');
    expect(section?.rendered).not.toContain('STALE_TRADED_THREATS');
  });

  it('should omit both dynamic sections when the cast has no state or relationship rows', async () => {
    const assembler = makeAssembler(castDb({ contextRefs: ['entity:amara'], entities: [amara] }));
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    expect(pack.sections.find(s => s.key === 'character_state')).toBeUndefined();
    expect(pack.sections.find(s => s.key === 'relationships')).toBeUndefined();
  });

  it('should omit both dynamic sections when the brief names no cast at all', async () => {
    const assembler = makeAssembler(
      castDb({
        entities: [amara],
        characterStates: [{ id: 1n, projectId: 1n, entityKey: 'amara', location: 'the docks', conditions: null, immediateGoal: null, statusNote: null, lastUpdatedChapter: 4 }],
        entityRelationships: [{ id: 1n, projectId: 1n, entityId: 10n, targetKey: 'rook', kind: 'rival', note: 'n', chapter: 4 }],
      }),
    );
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    expect(pack.sections.find(s => s.key === 'character_state')).toBeUndefined();
    expect(pack.sections.find(s => s.key === 'relationships')).toBeUndefined();
  });
});

describe('ContextAssembler.forChapter — required material over the budget', () => {
  it('should fail naming the chapter plan instead of dropping what the writer needs', async () => {
    const dbOverrides = {
      query: {
        projects: {
          findFirst: mock(async () => ({
            id: 1n,
            instructions: 'Keep the prose tight. '.repeat(250),
            contentMode: 'standard',
          })),
        },
        briefs: { findFirst: mock(async () => ({ id: 1n, projectId: 1n, chapter: 1, body: 'Ash climbs the bell tower. '.repeat(250), contextRefs: [] })) },
        chapters: { findFirst: mock(async () => null), findMany: mock(async () => [{ number: 1, summary: 'A short prior chapter.' }]) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        entities: { findMany: mock(async () => []) },
        worldFacts: { findMany: mock(async () => []) },
        plotThreads: { findMany: mock(async () => []) },
        mysteries: { findMany: mock(async () => []) },
        contextPacks: { findFirst: mock(async () => null) },
        userFeedback: { findMany: mock(async () => []) },
      },
    };

    const assembler = makeAssembler(dbOverrides);

    await expect(assembler.forChapter(1n, 1, { dryRun: true, budgetTokens: 100, enforceWriterReservations: true })).rejects.toMatchObject({
      code: 'CTX_002',
      message: expect.stringContaining('with the chapter plan the required material reaches'),
    });
    const judged = await assembler.forChapter(1n, 1, { dryRun: true, budgetTokens: 100 });
    expect(judged.sections.some(section => section.key === 'writing_style')).toBe(true);
  });
});

describe('ContextAssembler.forChapter — knowledge sections', () => {
  const facts = [
    { id: 1n, factKey: 'service_door', text: 'The killer used the service door.', constraintNote: null, terms: ['service door'], source: 'manual' },
    {
      id: 2n,
      factKey: 'ledger_forgery',
      text: 'The ledger is a forgery planted by Elias.',
      constraintNote: 'Protects the forged-ledger reveal.',
      writerNote: 'Elias steers conversation away from the study.',
      terms: ['forgery'],
      source: 'manual',
    },
    { id: 3n, factKey: 'motive_debt', text: 'Marlow owed Elias a ruinous gambling debt.', constraintNote: null, terms: ['gambling debt'], source: 'manual' },
  ];

  const promiseFact = {
    id: 4n,
    factKey: 'promise:no-harem',
    text: 'she never collects suitors',
    constraintNote: 'Reader promise — plan and write nothing that breaks it: she never collects suitors',
    writerNote: 'Reader promise — plan and write nothing that breaks it: she never collects suitors',
    terms: [] as string[],
    source: 'seed',
  };

  function knowledgeOverrides(brief: unknown) {
    return {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: null, contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => brief) },
        chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        entities: {
          findMany: mock(async () => [
            { id: 10n, entityKey: 'amara', name: 'Amara', type: 'character', status: 'active', body: 'Amara keeps the accounts.', notes: null, aliases: [] },
          ]),
        },
        canonFacts: { findMany: mock(async () => facts) },
        characterKnowledge: { findMany: mock(async () => [{ factId: 1n, entityId: 10n, learnedInChapter: 3 }]) },
        contextPacks: { findFirst: mock(async () => null) },
      },
    };
  }

  it('renders known facts, on-page reveals, and constraints while keeping hidden fact text out of the pack', async () => {
    const brief = {
      chapter: 5,
      body: 'Amara studies the ledger.',
      contextRefs: [],
      knowledgeContract: { pov: ['amara'], learns: [{ entityKey: 'amara', factKey: 'ledger_forgery' }] },
    };
    const assembler = makeAssembler(knowledgeOverrides(brief));
    const pack = await assembler.forChapter(1n, 5, { dryRun: true });

    const known = pack.sections.find(s => s.key === 'known_facts');
    expect(known?.rendered).toContain('[service_door] The killer used the service door.');
    expect(known?.tier).toBe('canonical');

    const reveals = pack.sections.find(s => s.key === 'chapter_reveals');
    expect(reveals?.rendered).toContain('[ledger_forgery] The ledger is a forgery planted by Elias.');

    // The hidden fact (motive_debt) must not leak into the rendered pack in any form; the revealed
    // fact's constraint note must not appear either — it is known now, not hidden.
    expect(pack.sections.find(s => s.key === 'hidden_constraints')).toBeUndefined();
    expect(pack.rendered).not.toContain('gambling debt');
    expect(pack.rendered).not.toContain('motive_debt');
  });

  it('should render hidden constraints for unrevealed facts and say plainly that nothing is known yet', async () => {
    const brief = { chapter: 5, body: 'Boone canvasses the street.', contextRefs: [], knowledgeContract: { pov: ['boone'], learns: [] } };
    const overrides = knowledgeOverrides(brief);
    overrides.query.entities.findMany = mock(async () => []);
    const assembler = makeAssembler(overrides);
    const pack = await assembler.forChapter(1n, 5, { dryRun: true });

    const known = pack.sections.find(s => s.key === 'known_facts');
    expect(known?.rendered).toContain('no ledgered facts');
    expect(known?.sourceRefs).toEqual([]);
    const constraints = pack.sections.find(s => s.key === 'hidden_constraints');
    expect(constraints?.rendered).toContain('Elias steers conversation away from the study.');
    expect(constraints?.rendered).not.toContain('forgery');
    expect(pack.rendered).not.toContain('Protects the forged-ledger reveal.');
    expect(pack.rendered).not.toContain('The killer used the service door.');
  });

  it('keeps a seed-sourced promise fact in the behavioral constraints — the drafter must obey it, spoiler or not', async () => {
    const brief = { chapter: 5, body: 'Boone canvasses the street.', contextRefs: [], knowledgeContract: { pov: ['boone'], learns: [] } };
    const overrides = knowledgeOverrides(brief);
    overrides.query.entities.findMany = mock(async () => []);
    overrides.query.canonFacts.findMany = mock(async () => [...facts, promiseFact]);
    const assembler = makeAssembler(overrides);
    const pack = await assembler.forChapter(1n, 5, { dryRun: true });

    const constraints = pack.sections.find(s => s.key === 'hidden_constraints');
    expect(constraints?.rendered).toContain('Reader promise — plan and write nothing that breaks it');
    expect(constraints?.sourceRefs).toContain('fact:promise:no-harem');
  });

  it('adds no knowledge sections when the brief has no contract', async () => {
    const brief = { chapter: 5, body: 'A quiet chapter.', contextRefs: [], knowledgeContract: null };
    const assembler = makeAssembler(knowledgeOverrides(brief));
    const pack = await assembler.forChapter(1n, 5, { dryRun: true });
    expect(pack.sections.some(s => ['known_facts', 'chapter_reveals', 'hidden_constraints'].includes(s.key))).toBe(false);
  });
});

describe('ContextAssembler.resolveRefs — bible_doc and fact prefixes', () => {
  it('resolves a bible_doc:section/slug ref to the document body when the row exists', async () => {
    const doc = { section: 'world', slug: 'factions-locations', body: 'The Ashen Concord governs the eastern reaches.' };
    const assembler = makeAssembler({ query: { bibleDocuments: { findMany: mock(async () => [doc]) } } });

    const { resolved, unresolved } = await assembler.resolveRefs(1n, ['bible_doc:world/factions-locations']);

    expect(unresolved).toEqual([]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.key).toBe('ref:bible_doc:world/factions-locations');
    expect(resolved[0]?.tier).toBe('canonical');
    expect(resolved[0]?.rendered).toContain('The Ashen Concord governs the eastern reaches.');
  });

  it('reports a bible_doc: ref unresolved when the section/slug pair does not exist', async () => {
    const assembler = makeAssembler({ query: { bibleDocuments: { findMany: mock(async () => []) } } });

    const { resolved, unresolved } = await assembler.resolveRefs(1n, ['bible_doc:world/nonexistent']);

    expect(resolved).toEqual([]);
    expect(unresolved).toEqual(['bible_doc:world/nonexistent']);
  });

  it('resolves a fact:factKey ref to the fact text when the row exists', async () => {
    const fact = { factKey: 'ledger_forgery', text: 'The ledger is a forgery planted by Elias.', constraintNote: null };
    const assembler = makeAssembler({ query: { canonFacts: { findMany: mock(async () => [fact]) } } });

    const { resolved, unresolved } = await assembler.resolveRefs(1n, ['fact:ledger_forgery']);

    expect(unresolved).toEqual([]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.key).toBe('ref:fact:ledger_forgery');
    expect(resolved[0]?.tier).toBe('canonical');
    expect(resolved[0]?.rendered).toContain('The ledger is a forgery planted by Elias.');
  });

  it('reports a fact: ref unresolved when the factKey does not exist', async () => {
    const assembler = makeAssembler({ query: { canonFacts: { findMany: mock(async () => []) } } });

    const { resolved, unresolved } = await assembler.resolveRefs(1n, ['fact:nonexistent_key']);

    expect(resolved).toEqual([]);
    expect(unresolved).toEqual(['fact:nonexistent_key']);
  });

  it('resolves and unresolves the new prefixes alongside the existing six in one call without cross-contamination', async () => {
    const entityRow = { entityKey: 'boone', name: 'Boone', type: 'character', status: 'active', body: 'A weary detective.', notes: null, aliases: [] };
    const doc = { section: 'plot', slug: 'volumes', body: 'Volume outline body.' };
    const fact = { factKey: 'motive_debt', text: 'Boone owes a gambling debt.', constraintNote: 'Elias avoids money talk.' };

    const assembler = makeAssembler({
      query: {
        entities: { findMany: mock(async () => [entityRow]) },
        worldFacts: { findMany: mock(async () => []) },
        plotThreads: { findMany: mock(async () => []) },
        mysteries: { findMany: mock(async () => []) },
        bibleDocuments: { findMany: mock(async () => [doc]) },
        canonFacts: { findMany: mock(async () => [fact]) },
      },
    });

    const refs = ['entity:boone', 'entity:missing', 'bible_doc:plot/volumes', 'bible_doc:plot/missing', 'fact:motive_debt', 'fact:missing', 'world_fact:missing'];
    const { resolved, unresolved } = await assembler.resolveRefs(1n, refs);

    const resolvedKeys = resolved.map(s => s.key).sort();
    expect(resolvedKeys).toEqual(['ref:bible_doc:plot/volumes', 'ref:entity:boone', 'ref:fact:motive_debt'].sort());
    expect(unresolved.sort()).toEqual(['bible_doc:plot/missing', 'entity:missing', 'fact:missing', 'world_fact:missing'].sort());
  });
});

describe('ContextAssembler.forIllustration', () => {
  const project = { id: 1n, title: 'Ashfall', premise: 'A frozen empire eats its heirs.', brief: null, themes: ['betrayal'], instructions: null };
  const artStyle = { section: 'project', slug: 'art-style', body: 'Heavy ink outlines over a bleached winter palette.' };

  // `makeDbStub` spreads its raw overrides last, so an override of `query` replaces the defaults wholesale.
  function illustrationAssembler(query: Record<string, unknown>) {
    return makeAssembler({
      query: {
        contextPacks: { findFirst: mock(async () => null) },
        projects: { findFirst: mock(async () => project) },
        bibleDocuments: { findFirst: mock(async () => null) },
        entities: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        entityAppearances: { findMany: mock(async () => []) },
        worldFacts: { findMany: mock(async () => []) },
        chapters: { findFirst: mock(async () => null) },
        ...query,
      },
    });
  }

  it('carries the art-style bible and the premise as the stable prefix', async () => {
    const assembler = illustrationAssembler({ bibleDocuments: { findFirst: mock(async () => artStyle) } });

    const pack = await assembler.forIllustration(1n, 'cover', null);

    expect(pack.purpose).toBe('illustration');
    expect(pack.renderedStable).toContain('## ART STYLE BIBLE');
    expect(pack.renderedStable).toContain('Heavy ink outlines');
    expect(pack.renderedStable).toContain('A frozen empire eats its heirs.');
    expect(pack.renderedVolatile).toBe('');
  });

  it('omits the art-style section when the project has no such document', async () => {
    const assembler = illustrationAssembler({});

    const pack = await assembler.forIllustration(1n, 'cover', null);

    expect(pack.sections.map(s => s.key)).toEqual(['premise']);
  });

  it('renders the entity card with its canonical appearance and the world facts around it', async () => {
    const entity = {
      entityKey: 'hero',
      name: 'Evan Vale',
      type: 'character',
      significance: 'major',
      status: 'alive',
      appearance: 'silver hair, scarred jaw',
      body: 'Heir to a broken house.',
      notes: null,
      motivation: 'Reclaim the ridge.',
      aliases: [{ alias: 'The Ridgeling' }],
    };
    const assembler = illustrationAssembler({
      bibleDocuments: { findFirst: mock(async () => artStyle) },
      entities: { findFirst: mock(async () => entity) },
      worldFacts: { findMany: mock(async () => [{ category: 'climate', key: 'winter', value: 'A century of unbroken frost.' }]) },
    });

    const pack = await assembler.forIllustration(1n, 'entity', 'hero');

    expect(pack.rendered).toContain('## SUBJECT');
    expect(pack.rendered).toContain('silver hair, scarred jaw');
    expect(pack.rendered).toContain('The Ridgeling');
    expect(pack.rendered).toContain('A century of unbroken frost.');
  });

  it('tells the composer to derive an appearance when the entity records none', async () => {
    const entity = {
      entityKey: 'hero',
      name: 'Evan Vale',
      type: 'character',
      significance: null,
      status: null,
      appearance: null,
      body: null,
      notes: null,
      motivation: null,
      aliases: [],
    };
    const assembler = illustrationAssembler({ entities: { findFirst: mock(async () => entity) } });

    const pack = await assembler.forIllustration(1n, 'entity', 'hero');

    expect(pack.rendered).toContain('none recorded — derive one');
  });

  it('renders a chapter subject with the appearance of its on-page cast', async () => {
    const assembler = illustrationAssembler({
      chapters: { findFirst: mock(async () => ({ number: 3, title: 'The Ridge', summary: 'Evan crosses the ridge alone.' })) },
      entityAppearances: { findMany: mock(async () => [{ entityId: 7n }]) },
      entities: { findFirst: mock(async () => null), findMany: mock(async () => [{ entityKey: 'hero', name: 'Evan Vale', type: 'character', appearance: 'silver hair' }]) },
    });

    const pack = await assembler.forIllustration(1n, 'chapter', '3');

    expect(pack.chapter).toBe(3);
    expect(pack.rendered).toContain('Chapter 3: The Ridge');
    expect(pack.rendered).toContain('## CAST APPEARANCE');
    expect(pack.rendered).toContain('Evan Vale (character): silver hair');
  });
});
