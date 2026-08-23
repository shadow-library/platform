import { describe, expect, it, mock } from 'bun:test';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler, FULL_CAST_MAX, PREV_ENDING_TAIL } from '@modules/ai/context/context-assembler.service';
import { applyBudget, countTokens, truncateAtParagraph, truncateAtParagraphTail } from '@modules/ai/context/token-budget';
import { DEFAULT_WRITING_INSTRUCTIONS } from '@modules/ai/prompts/authoring-preamble';

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
    expect(omitted).toEqual([{ key: 'b', reason: 'budget' }]);
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
    expect(omitted).toEqual([{ key: 'overflow', reason: 'budget' }]);
  });
});

function makeDbStub(overrides: Record<string, unknown> = {}) {
  const defaultQuery = {
    projects: { findFirst: mock(async () => null) },
    briefs: { findFirst: mock(async () => null) },
    chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
    volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
    arcs: { findFirst: mock(async () => null), findMany: mock(async () => []) },
    drafts: { findFirst: mock(async () => null) },
    entities: { findMany: mock(async () => []) },
    worldFacts: { findMany: mock(async () => []) },
    plotThreads: { findMany: mock(async () => []) },
    mysteries: { findMany: mock(async () => []) },
    contextPacks: { findFirst: mock(async () => null) },
    userFeedback: { findMany: mock(async () => []) },
  };

  const insert = mock(() => ({
    values: mock(() => ({
      onConflictDoNothing: mock(() => ({
        returning: mock(async () => []),
      })),
    })),
  }));

  return {
    query: { ...defaultQuery, ...(overrides.query ?? {}) },
    insert,
    ...overrides,
  };
}

function makeAssembler(dbOverrides: Record<string, unknown> = {}, catalogText = '') {
  const db = makeDbStub(dbOverrides);
  const fakeDatabaseService = { getPostgresClient: () => db } as never;
  const fakeCatalog = { render: mock(async () => catalogText) } as unknown as CatalogService;
  return new ContextAssembler(fakeDatabaseService, fakeCatalog);
}

describe('ContextAssembler.forChapter — grok-adjacency', () => {
  it('prev_ending section contains "Summary:" when prev chapter generator is grok', async () => {
    const prevChapter = { number: 4, generator: 'grok', status: 'done', summary: 'Iron treaty signed', content: 'Long prose...', title: 'Ch4' };
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
        drafts: { findFirst: mock(async () => prevDraft) },
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
    expect(prevEndingSection?.rendered).toContain('Summary:');
    // Raw prose tail should NOT be in the section (grok-adjacency renders summary+state, not content)
    expect(prevEndingSection?.rendered).not.toContain('Long prose...');
  });
});

describe('ContextAssembler.forChapter — prev_ending tail truncation', () => {
  it('keeps the END of the previous chapter, not its opening, when content exceeds PREV_ENDING_TAIL', async () => {
    // Build enough paragraphs that the opening and closing paragraphs can't both fit in the budget.
    const openingPara = 'OPENING_MARKER: '.repeat(200);
    const closingPara = 'CLOSING_MARKER: '.repeat(200);
    const content = [openingPara, closingPara].join('\n\n');
    expect(countTokens(content)).toBeGreaterThan(PREV_ENDING_TAIL);

    const prevChapter = { number: 4, generator: 'standard', status: 'done', summary: 'Something happened', content, title: 'Ch4' };

    const dbOverrides = {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: null, contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => null) },
        chapters: { findFirst: mock(async () => prevChapter), findMany: mock(async () => []) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => null) },
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
        drafts: { findFirst: mock(async () => prevDraft) },
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
        drafts: { findFirst: mock(async () => null) },
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
        drafts: { findFirst: mock(async () => null) },
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
        drafts: { findFirst: mock(async () => null) },
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
});

describe('ContextAssembler.forChapter — arc_objective', () => {
  it('includes the arc_objective section when the brief has a covering arc', async () => {
    const brief = { id: 1n, projectId: 1n, chapter: 5, body: 'Chapter body.', contextRefs: [], arcKey: 'arc1' };
    const arc = { arcKey: 'arc1', volumeKey: 'v1', objective: 'Topple the treaty.', escalation: 'The spy is exposed.', hook: 'A ship burns in the harbor.' };
    const dbOverrides = {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: null, contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => brief) },
        chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        arcs: { findFirst: mock(async () => arc), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => null) },
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

    const arcSection = pack.sections.find(s => s.key === 'arc_objective');
    expect(arcSection).toBeDefined();
    expect(arcSection?.rendered).toContain('Topple the treaty.');
    expect(arcSection?.rendered).toContain('The spy is exposed.');
    expect(arcSection?.rendered).toContain('A ship burns in the harbor.');
    expect(arcSection?.sourceRefs).toEqual(['arc:arc1']);
  });

  it('omits the arc_objective section when the brief has no covering arc (arc-less volume)', async () => {
    const brief = { id: 1n, projectId: 1n, chapter: 5, body: 'Chapter body.', contextRefs: [], arcKey: null };
    const dbOverrides = {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: null, contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => brief) },
        chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => null) },
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

    expect(pack.sections.some(s => s.key === 'arc_objective')).toBe(false);
  });
});

describe('ContextAssembler.forChapter — stable/volatile split', () => {
  const brief = { id: 1n, projectId: 1n, chapter: 5, body: 'Chapter body.', contextRefs: ['entity:mira'], arcKey: 'arc1' };
  const arc = { arcKey: 'arc1', volumeKey: 'v1', objective: 'ARC_OBJECTIVE_MARKER', escalation: '', hook: '' };
  const volume = { volumeKey: 'v1', ordinal: 1, objective: 'VOLUME_OBJECTIVE_MARKER', conflict: '' };
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
        arcs: { findFirst: mock(async () => arc), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => ({ state: { lastBeat: 'CONTINUATION_MARKER' } })) },
        entities: { findMany: mock(async () => [entity]) },
        worldFacts: { findMany: mock(async () => []) },
        plotThreads: { findMany: mock(async () => []) },
        mysteries: { findMany: mock(async () => []) },
        contextPacks: { findFirst: mock(async () => null) },
        userFeedback: { findMany: mock(async () => []) },
      },
    };
  }

  it('marks the volume/arc objectives, writing style, and canon cards stable and the per-chapter sections volatile', async () => {
    const assembler = makeAssembler(overrides('PREV_ENDING_MARKER'));
    const pack = await assembler.forChapter(1n, 5, { dryRun: true, budgetTokens: 1_000_000 });

    const segments = Object.fromEntries(pack.sections.map(s => [s.key, s.segment]));
    expect(segments).toMatchObject({
      volume_objective: 'stable',
      arc_objective: 'stable',
      writing_style: 'stable',
      'ref:entity:mira': 'stable',
      prev_ending: 'volatile',
      continuation_state: 'volatile',
      memory: 'volatile',
    });

    for (const marker of ['VOLUME_OBJECTIVE_MARKER', 'ARC_OBJECTIVE_MARKER', 'WRITING_STYLE_MARKER', 'ENTITY_CARD_MARKER']) {
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
        drafts: { findFirst: mock(async () => null) },
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

describe('ContextAssembler — memory budget trimming', () => {
  it('applies budget and excludes sections that would overflow', async () => {
    const dbOverrides = {
      query: {
        projects: {
          findFirst: mock(async () => ({
            id: 1n,
            instructions: 'A'.repeat(5000),
            contentMode: 'standard',
          })),
        },
        briefs: { findFirst: mock(async () => ({ id: 1n, projectId: 1n, chapter: 1, body: 'B'.repeat(5000), contextRefs: [] })) },
        chapters: { findFirst: mock(async () => null), findMany: mock(async () => [{ number: 1, summary: 'A short prior chapter.' }]) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => null) },
        entities: { findMany: mock(async () => []) },
        worldFacts: { findMany: mock(async () => []) },
        plotThreads: { findMany: mock(async () => []) },
        mysteries: { findMany: mock(async () => []) },
        contextPacks: { findFirst: mock(async () => null) },
        userFeedback: { findMany: mock(async () => []) },
      },
    };

    const assembler = makeAssembler(dbOverrides);
    const pack = await assembler.forChapter(1n, 1, { dryRun: true, budgetTokens: 100 });

    // usedTokens may exceed budgetTokens only when the first section is force-included
    // to guarantee a non-empty context pack (at-least-one guarantee in applyBudget).
    expect(pack.sections.length).toBeLessThan(3);
    expect(pack.sections.length).toBeGreaterThan(0);
    expect(pack.omitted.length).toBeGreaterThan(0);
    expect(pack.omitted.every(o => o.reason === 'budget')).toBe(true);
  }, 15_000); // consistently ~5.4s on GitHub Actions' 2-vCPU runners, just over the 5s default — CI-speed headroom, not a functional change
});

describe('ContextAssembler.forRebrand', () => {
  const input = {
    worldNotes: 'Veldram replaces every real nation.',
    directives: 'weave romance in',
    glossarySlice: 'Ye Fan → Evan Vale [character]',
    carryState: '{"activeThreads":"Mira spark"}',
    prevBody: `${'OPENING_MARKER: '.repeat(200)}\n\n${'CLOSING_MARKER: '.repeat(200)}`,
  };

  it('puts world notes and directives in the stable segment and the rest in the volatile tail', async () => {
    const assembler = makeAssembler();
    const pack = await assembler.forRebrand(1n, 5, input);

    expect(pack.purpose).toBe('rebrand');
    const segments = Object.fromEntries(pack.sections.map(s => [s.key, s.segment]));
    expect(segments).toMatchObject({ world_notes: 'stable', directives: 'stable', glossary_slice: 'volatile', carry_state: 'volatile', prev_ending: 'volatile' });
    expect(pack.renderedStable).toContain('Veldram replaces');
    expect(pack.renderedStable).toContain('weave romance in');
    expect(pack.renderedVolatile).toContain('Evan Vale');
  });

  it('keeps the END of the previous converted body and stays byte-identical across chapters with unchanged canon', async () => {
    const assembler = makeAssembler();
    const pack5 = await assembler.forRebrand(1n, 5, input);
    const pack6 = await assembler.forRebrand(1n, 6, { ...input, carryState: '{"activeThreads":"Mira kiss"}' });

    const prevEnding = pack5.sections.find(s => s.key === 'prev_ending');
    expect(prevEnding?.rendered).toContain('CLOSING_MARKER');
    expect(prevEnding?.rendered).not.toContain('OPENING_MARKER');
    // The stable prefix is the provider prompt-cache key — volatile changes must not disturb it.
    expect(pack6.renderedStable).toBe(pack5.renderedStable);
  });

  it('omits directives and carry state sections when absent', async () => {
    const assembler = makeAssembler();
    const pack = await assembler.forRebrand(1n, 1, { ...input, directives: null, carryState: null, prevBody: null });
    expect(pack.sections.map(s => s.key)).toEqual(['world_notes', 'glossary_slice']);
  });
});

describe('ContextAssembler.forRebrandSeed', () => {
  it('renders the overview, extracted entity roster with aliases, and world facts', async () => {
    const dbOverrides = {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, title: 'Shrouded Peaks', premise: 'A cultivator rises.', brief: null, themes: null, instructions: null })) },
        entities: { findMany: mock(async () => [{ name: 'Ye Fan', type: 'character', aliases: [{ alias: 'Yefan' }] }]) },
        worldFacts: { findMany: mock(async () => [{ category: 'geography', key: 'capital', value: 'the Jade Capital' }]) },
        contextPacks: { findFirst: mock(async () => null) },
      },
    };

    const assembler = makeAssembler(dbOverrides);
    const pack = await assembler.forRebrandSeed(1n);

    expect(pack.purpose).toBe('rebrand_seed');
    expect(pack.rendered).toContain('Title: Shrouded Peaks');
    expect(pack.rendered).toContain('Ye Fan (character) — aka Yefan');
    expect(pack.rendered).toContain('geography/capital: the Jade Capital');
  });
});

describe('ContextAssembler.forReforgeOutline', () => {
  it('puts world notes in the stable segment and the glossary slice in the volatile tail', async () => {
    const assembler = makeAssembler();
    const pack = await assembler.forReforgeOutline(1n, 5, { worldNotes: 'Veldram replaces every real nation.', glossarySlice: 'Ye Fan → Evan Vale [character]' });

    expect(pack.purpose).toBe('reforge_outline');
    const segments = Object.fromEntries(pack.sections.map(s => [s.key, s.segment]));
    expect(segments).toMatchObject({ world_notes: 'stable', glossary_slice: 'volatile' });
    expect(pack.renderedStable).toContain('Veldram replaces');
    expect(pack.renderedVolatile).toContain('Evan Vale');
  });

  it('keeps the stable segment byte-identical across chapters even when the volatile glossary slice changes', async () => {
    const assembler = makeAssembler();
    const worldNotes = 'Veldram replaces every real nation.';
    const pack5 = await assembler.forReforgeOutline(1n, 5, { worldNotes, glossarySlice: 'Ye Fan → Evan Vale [character]' });
    const pack6 = await assembler.forReforgeOutline(1n, 6, { worldNotes, glossarySlice: 'Long Aotian → Leo Sky [character]' });
    expect(pack5.renderedStable.length).toBeGreaterThan(0);
    expect(pack6.renderedStable).toBe(pack5.renderedStable);
  });
});

describe('ContextAssembler.forReforge', () => {
  const input = {
    worldNotes: 'Veldram replaces every real nation.',
    directives: 'weave romance in',
    instructions: 'cut the filler tournament arc; raise the prose',
    glossarySlice: 'Ye Fan → Evan Vale [character]',
    carryState: '{"activeThreads":"Mira spark"}',
    prevBody: `${'OPENING_MARKER: '.repeat(200)}\n\n${'CLOSING_MARKER: '.repeat(200)}`,
  };

  it('puts world notes, directives, and author instructions in the stable segment and the rest in the volatile tail', async () => {
    const assembler = makeAssembler();
    const pack = await assembler.forReforge(1n, 5, input);

    expect(pack.purpose).toBe('reforge');
    const segments = Object.fromEntries(pack.sections.map(s => [s.key, s.segment]));
    expect(segments).toMatchObject({
      world_notes: 'stable',
      directives: 'stable',
      instructions: 'stable',
      glossary_slice: 'volatile',
      carry_state: 'volatile',
      prev_ending: 'volatile',
    });
    expect(pack.renderedStable).toContain('cut the filler tournament arc');
    expect(pack.renderedVolatile).toContain('Evan Vale');
  });

  it('keeps the END of the previous reforged body and stays byte-identical across chapters with unchanged canon', async () => {
    const assembler = makeAssembler();
    const pack5 = await assembler.forReforge(1n, 5, input);
    const pack6 = await assembler.forReforge(1n, 6, { ...input, carryState: '{"activeThreads":"Mira kiss"}' });

    const prevEnding = pack5.sections.find(s => s.key === 'prev_ending');
    expect(prevEnding?.rendered).toContain('CLOSING_MARKER');
    expect(prevEnding?.rendered).not.toContain('OPENING_MARKER');
    // The stable prefix is the provider prompt-cache key — volatile changes must not disturb it.
    expect(pack6.renderedStable).toBe(pack5.renderedStable);
  });

  it('omits directives, instructions, and carry state sections when absent', async () => {
    const assembler = makeAssembler();
    const pack = await assembler.forReforge(1n, 1, { ...input, directives: null, instructions: null, carryState: null, prevBody: null });
    expect(pack.sections.map(s => s.key)).toEqual(['world_notes', 'glossary_slice']);
  });

  it('should carry the target word count as a stable section when set', async () => {
    const assembler = makeAssembler();
    const pack = await assembler.forReforge(1n, 5, { ...input, targetWords: 3200 });

    const target = pack.sections.find(s => s.key === 'target_length');
    expect(target?.segment).toBe('stable');
    expect(pack.renderedStable).toContain('## TARGET LENGTH');
    expect(pack.renderedStable).toContain('Target about 3200 words');
    expect(pack.renderedStable).toContain('not a hard wall');
  });

  it('should omit the target-length section when no target word count is set', async () => {
    const assembler = makeAssembler();
    const packUnset = await assembler.forReforge(1n, 5, input);
    const packZero = await assembler.forReforge(1n, 5, { ...input, targetWords: 0 });
    expect(packUnset.sections.map(s => s.key)).not.toContain('target_length');
    expect(packZero.sections.map(s => s.key)).not.toContain('target_length');
  });
});

describe('ContextAssembler.forChapter — knowledge sections', () => {
  const facts = [
    { id: 1n, factKey: 'service_door', text: 'The killer used the service door.', constraintNote: null, terms: ['service door'] },
    { id: 2n, factKey: 'ledger_forgery', text: 'The ledger is a forgery planted by Elias.', constraintNote: 'Elias steers conversation away from the study.', terms: ['forgery'] },
    { id: 3n, factKey: 'motive_debt', text: 'Marlow owed Elias a ruinous gambling debt.', constraintNote: null, terms: ['gambling debt'] },
  ];

  function knowledgeOverrides(brief: unknown) {
    return {
      query: {
        projects: { findFirst: mock(async () => ({ id: 1n, instructions: null, contentMode: 'standard' })) },
        briefs: { findFirst: mock(async () => brief) },
        chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
        drafts: { findFirst: mock(async () => null) },
        entities: { findMany: mock(async () => [{ id: 10n, entityKey: 'amara' }]) },
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

  it('renders hidden constraints for unrevealed facts and omits known_facts when nothing is known', async () => {
    const brief = { chapter: 5, body: 'Boone canvasses the street.', contextRefs: [], knowledgeContract: { pov: ['boone'], learns: [] } };
    const overrides = knowledgeOverrides(brief);
    overrides.query.entities.findMany = mock(async () => []);
    const assembler = makeAssembler(overrides);
    const pack = await assembler.forChapter(1n, 5, { dryRun: true });

    expect(pack.sections.find(s => s.key === 'known_facts')).toBeUndefined();
    const constraints = pack.sections.find(s => s.key === 'hidden_constraints');
    expect(constraints?.rendered).toContain('Elias steers conversation away from the study.');
    expect(constraints?.rendered).not.toContain('forgery');
    expect(pack.rendered).not.toContain('The killer used the service door.');
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
