import { beforeAll, describe, expect, it } from 'bun:test';

import { type CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler, NOVEL_CHAT_HISTORY_ALLOWANCE } from '@modules/ai/context/context-assembler.service';
import {
  ENDING_PLANNER_ONLY_LABEL,
  ENDING_QUESTION_PLANNER_ONLY_LABEL,
  LATER_VOLUME_GOAL_LABEL,
  nextChapterNumber,
  NOVEL_CHAT_PACK_FLOOR,
  NOVEL_CHAT_REQUEST_BUDGET,
  NOVEL_CHAT_SECTION_CAPS,
  renderHandoff,
  renderNotebook,
  renderNovelStory,
  renderProgress,
  renderPromises,
  renderVolumeGoals,
} from '@modules/ai/context/novel-chat-context';
import { type AssembledPack } from '@modules/ai/context/sections';
import { countTokens } from '@modules/ai/context/token-budget';
import { AUTHOR_BRIEF_TOPIC } from '@modules/ledger/ledger-sections';
import { type ProgressItem } from '@server/common';

type Rows = Record<string, Record<string, unknown>[]>;

function chatDb(rows: Rows, project: Record<string, unknown> | null) {
  const table = (name: string) => ({
    findFirst: async () => (name === 'projects' ? project : (rows[name]?.[0] ?? null)),
    findMany: async () => rows[name] ?? [],
  });
  return {
    query: new Proxy({} as Record<string, ReturnType<typeof table>>, { get: (_, name: string) => table(name) }),
    $count: async () => 0,
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }) }),
  };
}

function assembler(rows: Rows, project: Record<string, unknown> | null = STORY): ContextAssembler {
  const db = chatDb(rows, project);
  return new ContextAssembler({ getPostgresClient: () => db } as never, { render: async () => '' } as unknown as CatalogService);
}

const PROMPT_TOKENS = 4_000;

const STORY = {
  id: 1n,
  title: 'The Lamp Keeper',
  premise: 'A keeper trades memories to keep a harbour lamp alight.',
  brief: null,
  themes: ['memory', 'duty'],
  theme: 'What we owe the people who forget us.',
  endingQuestion: 'Will the harbour stay lit?',
  ending: 'The keeper lets the lamp go dark.',
  readerPromise: 'A slow-burn mystery with a cost.',
  protagonistKey: 'mira',
  opposition: 'The tide court.',
  instructions: null,
  storyCurrentChapter: 2,
};

function ledgerEntry(statement: string, decidedBy: 'author' | 'system', kind = 'decision', topic = 'cast.mira'): Record<string, unknown> {
  return { kind, topic, statement, why: null, rejectedAlternatives: [], writerLine: null, decidedBy };
}

function section(pack: AssembledPack, key: string): string {
  return pack.sections.find(candidate => candidate.key === key)?.rendered ?? '';
}

describe('renderNovelStory', () => {
  it('should label the ending and the ending question planner-only', () => {
    const story = renderNovelStory({ ...STORY, authorInstructions: null });

    expect(story).toContain(`${ENDING_PLANNER_ONLY_LABEL}: The keeper lets the lamp go dark.`);
    expect(story).toContain(`${ENDING_QUESTION_PLANNER_ONLY_LABEL}: Will the harbour stay lit?`);
    expect(story).toContain('Premise: A keeper trades memories');
  });

  it('should say the ending is undecided when the author has not set one', () => {
    expect(renderNovelStory({ ...STORY, ending: null, authorInstructions: null })).toContain(`${ENDING_PLANNER_ONLY_LABEL}: undecided for now`);
  });

  it('should cut a long premise to its own limit and still render every other field', () => {
    const story = renderNovelStory({ ...STORY, premise: 'The harbour wakes. '.repeat(1_000), authorInstructions: 'Close third person.' });

    expect(story).toContain('[…]');
    expect(countTokens(story)).toBeLessThan(2_000);
    for (const line of [
      'What it is about underneath: What we owe',
      'What the reader is promised:',
      'Protagonist: mira',
      'Opposition: The tide court.',
      'Author instructions: Close third person.',
    ]) {
      expect(story).toContain(line);
    }
    expect(story).toContain(`${ENDING_PLANNER_ONLY_LABEL}: The keeper lets the lamp go dark.`);
  });
});

describe('renderNotebook', () => {
  it('should put the author’s own decisions before the system’s', () => {
    const notebook = renderNotebook([ledgerEntry('The system picked a coastal town.', 'system'), ledgerEntry('Mira is left-handed.', 'author')] as never);

    expect(notebook.indexOf('Mira is left-handed.')).toBeLessThan(notebook.indexOf('The system picked a coastal town.'));
  });

  it('should keep an author correction and the do-not-propose list when the system’s decisions overflow the cap', () => {
    const system = Array.from({ length: 60 }, (_, index) =>
      ledgerEntry(`System decision ${index}: ${'the harbour district keeps its old laws '.repeat(4)}`, 'system', 'decision', `world.${index}`),
    );
    const entries = [
      ...system,
      ledgerEntry('Never a chosen-one prophecy.', 'author', 'rejected', 'tone.prophecy'),
      ledgerEntry('Correction: Mira never learned to swim.', 'author', 'direction', 'cast.mira'),
    ];
    const notebook = renderNotebook(entries as never, 600);

    expect(notebook).toContain("### The author's decisions and directions\n- [cast.mira] Correction: Mira never learned to swim.");
    expect(notebook).toContain('### Do not propose\n- Never a chosen-one prophecy.');
    expect(notebook).toContain('System decision 59');
    expect(notebook).not.toContain('System decision 0:');
    expect(notebook).toMatch(/\(\+\d+ more Notebook entries left out: the oldest in each group\)/);
    expect(countTokens(notebook)).toBeLessThanOrEqual(600);
  });
});

describe('renderNotebook and the progress checklist', () => {
  it('should never show a checklist override as a system decision or in the backlog', () => {
    const notebook = renderNotebook([ledgerEntry('Dismissed from the checklist.', 'system', 'system', 'progress.ending'), ledgerEntry('Mira is left-handed.', 'author')] as never);

    expect(notebook).not.toContain('progress.ending');
    expect(notebook).not.toContain('Dismissed from the checklist.');
  });
});

describe('renderNotebook with one oversized entry', () => {
  it('should cut a line longer than its share of the cap instead of leaving it out', () => {
    const notebook = renderNotebook([ledgerEntry(`Correction: ${'the tide court keeps its ledgers in salt '.repeat(200)}`, 'author', 'direction')] as never, 600);

    expect(notebook).toContain('- [cast.mira] Correction: the tide court');
    expect(notebook).toContain('[…]');
    expect(countTokens(notebook)).toBeLessThanOrEqual(600);
  });
});

function progressItem(overrides: Partial<ProgressItem>): ProgressItem {
  return { key: 'premise', label: 'Premise', why: 'Why it matters.', status: 'open', ...overrides };
}

describe('renderProgress', () => {
  it('should list settled, undecided and open items by label as reference, never as an agenda', () => {
    const rendered = renderProgress([
      progressItem({ key: 'premise', label: 'Premise', status: 'answered' }),
      progressItem({ key: 'ending', label: 'Ending', status: 'undecided' }),
      progressItem({ key: 'theme', label: 'Theme', why: 'What the book is about underneath the plot.' }),
      progressItem({ key: 'opposition', label: 'Opposition', status: 'dismissed' }),
    ]);

    expect(rendered).toContain('reference only; never ask about an open item unless the author raises it or the chapter being planned needs it');
    expect(rendered).toContain('- Settled: Premise');
    expect(rendered).toContain('- Left undecided for now: Ending');
    expect(rendered).toContain('- Not settled yet: Theme');
    expect(rendered).not.toContain('underneath the plot');
    expect(rendered).not.toContain('Opposition');
  });

  it('should return null when every item is dismissed', () => {
    expect(renderProgress([progressItem({ status: 'dismissed' })])).toBeNull();
    expect(renderProgress([])).toBeNull();
  });
});

describe('renderVolumeGoals', () => {
  it('should label the goals of the volumes after the current one planner-only', () => {
    const volumes = [
      { volumeKey: 'v1', ordinal: 1, title: 'Arrival', objective: 'Mira takes the lamp.', state: 'goal_met' },
      { volumeKey: 'v2', ordinal: 2, title: 'Tide', objective: 'The court moves.', state: 'active' },
      { volumeKey: 'v3', ordinal: 3, title: 'Dark', objective: 'The lamp goes out.', state: 'not_started' },
    ];
    const lines = renderVolumeGoals(volumes as never).split('\n');

    expect(lines[0]).toEndWith('Goal: Mira takes the lamp.');
    expect(lines[1]).toEndWith('Goal: The court moves.');
    expect(lines[2]).toEndWith(`${LATER_VOLUME_GOAL_LABEL}: The lamp goes out.`);
  });
});

describe('renderPromises', () => {
  it('should exclude a dropped promise entirely', () => {
    const threads = [
      {
        threadKey: 'gone',
        status: 'dropped',
        summary: 'Gone',
        openedChapter: 1,
        lastAdvancedChapter: 1,
        payoffWindow: null,
        payoffMilestoneKey: null,
        payoffVolumeKey: null,
        intentionallyOpen: false,
      },
      {
        threadKey: 'plain',
        status: 'open',
        summary: 'Plain',
        openedChapter: 2,
        lastAdvancedChapter: 2,
        payoffWindow: null,
        payoffMilestoneKey: null,
        payoffVolumeKey: null,
        intentionallyOpen: false,
      },
    ];
    const rendered = renderPromises(threads as never, [], 3);

    expect(rendered).not.toContain('gone');
    expect(rendered).toContain('thread:plain');
  });

  it('should list due promises first and those resting on purpose last', () => {
    const threads = [
      { threadKey: 'resting', status: 'open', summary: 'Resting', openedChapter: 1, lastAdvancedChapter: 1, payoffWindow: null, intentionallyOpen: true },
      { threadKey: 'plain', status: 'open', summary: 'Plain', openedChapter: 2, lastAdvancedChapter: 2, payoffWindow: null, intentionallyOpen: false },
      { threadKey: 'debt', status: 'open', summary: 'The debt', openedChapter: 1, lastAdvancedChapter: 1, payoffWindow: 3, intentionallyOpen: false },
    ];
    const lines = renderPromises(threads as never, [], 3).split('\n');

    expect(lines[0]).toStartWith('thread:debt [due]');
    expect(lines[1]).toStartWith('thread:plain [open]');
    expect(lines[2]).toStartWith('thread:resting [dormant on purpose]');
  });

  it('should show what a promise pays off by', () => {
    const threads = [
      {
        threadKey: 'someday',
        status: 'open',
        summary: 'Someday',
        openedChapter: 1,
        lastAdvancedChapter: 1,
        payoffWindow: null,
        payoffMilestoneKey: null,
        payoffVolumeKey: null,
        intentionallyOpen: false,
      },
      {
        threadKey: 'oath',
        status: 'open',
        summary: 'Oath',
        openedChapter: 1,
        lastAdvancedChapter: 1,
        payoffWindow: null,
        payoffMilestoneKey: 'reveal_thief',
        payoffVolumeKey: null,
        intentionallyOpen: false,
      },
    ];
    const lines = renderPromises(threads as never, [], 3).split('\n');

    expect(lines.find(line => line.startsWith('thread:someday'))).toContain('pays off: someday');
    expect(lines.find(line => line.startsWith('thread:oath'))).toContain('pays off: milestone reveal_thief');
  });

  it('should mark a promise due once its payoff milestone is reached', () => {
    const threads = [
      {
        threadKey: 'oath',
        status: 'open',
        summary: 'Oath',
        openedChapter: 1,
        lastAdvancedChapter: 1,
        payoffWindow: null,
        payoffMilestoneKey: 'reveal_thief',
        payoffVolumeKey: null,
        intentionallyOpen: false,
      },
    ];
    const lines = renderPromises(threads as never, [], 3, new Map([['reveal_thief', 'reached']])).split('\n');

    expect(lines[0]).toStartWith('thread:oath [due]');
  });

  it('should mark a promise due once its payoff volume is goal-met', () => {
    const threads = [
      {
        threadKey: 'oath',
        status: 'open',
        summary: 'Oath',
        openedChapter: 1,
        lastAdvancedChapter: 1,
        payoffWindow: null,
        payoffMilestoneKey: null,
        payoffVolumeKey: 'vol_01',
        intentionallyOpen: false,
      },
    ];
    const lines = renderPromises(threads as never, [], 3, undefined, new Map([['vol_01', 'goal_met']])).split('\n');

    expect(lines[0]).toStartWith('thread:oath [due]');
  });

  it('should mark a promise due while its payoff volume is active (P4-41b)', () => {
    const threads = [
      {
        threadKey: 'oath',
        status: 'open',
        summary: 'Oath',
        openedChapter: 1,
        lastAdvancedChapter: 1,
        payoffWindow: null,
        payoffMilestoneKey: null,
        payoffVolumeKey: 'vol_01',
        intentionallyOpen: false,
      },
    ];
    const lines = renderPromises(threads as never, [], 3, undefined, new Map([['vol_01', 'active']])).split('\n');

    expect(lines[0]).toStartWith('thread:oath [due]');
  });

  it('should never mark a payoff milestone or volume due before it is reached or goal-met', () => {
    const threads = [
      {
        threadKey: 'oath',
        status: 'open',
        summary: 'Oath',
        openedChapter: 1,
        lastAdvancedChapter: 1,
        payoffWindow: null,
        payoffMilestoneKey: 'reveal_thief',
        payoffVolumeKey: null,
        intentionallyOpen: false,
      },
    ];
    const lines = renderPromises(threads as never, [], 3, new Map([['reveal_thief', 'planned']])).split('\n');

    expect(lines[0]).toStartWith('thread:oath [open]');
  });
});

describe('renderHandoff', () => {
  const chapters = [{ number: 1, title: 'Arrival', status: 'done', summary: 'Mira takes the lamp.', isolated: false }];
  const brief = {
    chapter: 2,
    title: 'The Tide',
    chapterPurpose: 'Show the cost.',
    direction: null,
    body: 'Mira forgets her mother.',
    pov: 'mira',
    scenes: [{ summary: 'The flood', pov: 'mira' }],
    endingContract: null,
    claimedMilestones: ['lamp_rank_1'],
    contentMode: null,
    isEnding: false,
    guidance: null,
    revision: 2,
    staleReason: null,
    writeMode: 'standard',
  };

  it('should give the latest summary and the next chapter’s plan in full', () => {
    const handoff = renderHandoff(chapters as never, [], [brief] as never);

    expect(handoff).toContain('Latest chapter: 1 — Arrival [final]');
    expect(handoff).toContain('AI summary of chapter 1');
    expect(handoff).toContain('Next chapter: 2 — planned, not written yet.');
    expect(handoff).toContain('Mira forgets her mother.');
    expect(handoff).toContain('1. The flood (POV mira)');
    expect(handoff).toContain('This chapter reaches: lamp_rank_1');
  });

  it('should count a draft and a final import as written when finding the next chapter', () => {
    expect(nextChapterNumber(chapters as never, [{ chapter: 2 }])).toBe(3);
    expect(nextChapterNumber([], [])).toBe(1);
  });
});

describe('ContextAssembler.forNovelChat', () => {
  it('should render an author correction before an AI chapter summary', async () => {
    const pack = await assembler({
      decisionLedgerEntries: [ledgerEntry('Correction: Mira never learned to swim.', 'author', 'direction')],
      chapters: [{ number: 1, title: 'Arrival', status: 'done', summary: 'Mira swims out to the lamp.', isolated: false }],
    }).forNovelChat(1n, new Date(0), { promptTokens: PROMPT_TOKENS, requestTokens: 0 });

    const correction = pack.rendered.indexOf('Correction: Mira never learned to swim.');
    const summary = pack.rendered.indexOf('Mira swims out to the lamp.');
    expect(correction).toBeGreaterThan(-1);
    expect(summary).toBeGreaterThan(correction);
  });

  it('should point at the author’s notes without inlining them', async () => {
    const notes = 'First paragraph of notes.\n\nSecond paragraph of notes.';
    const pack = await assembler({ decisionLedgerEntries: [ledgerEntry(notes, 'author', 'decision', AUTHOR_BRIEF_TOPIC)] }).forNovelChat(1n, new Date(0), {
      promptTokens: PROMPT_TOKENS,
      requestTokens: 0,
    });

    expect(section(pack, 'author_notes')).toContain("The author's own notes: 2 paragraphs");
    expect(pack.rendered).not.toContain('Second paragraph of notes.');
  });

  it('should carry the progress checklist as a volatile section that never changes the stable prefix', async () => {
    const opts = { promptTokens: PROMPT_TOKENS, requestTokens: 0 };
    const override = {
      kind: 'system',
      topic: 'progress.first_volume_goal',
      statement: 'Dismissed from the checklist.',
      why: null,
      rejectedAlternatives: [],
      writerLine: null,
      decidedBy: 'system',
      payload: { status: 'dismissed' },
    };
    const withoutOverride = await assembler({}).forNovelChat(1n, new Date(0), opts);
    const withOverride = await assembler({ decisionLedgerEntries: [override] }).forNovelChat(1n, new Date(0), opts);

    const progressSection = withoutOverride.sections.find(candidate => candidate.key === 'progress');
    expect(progressSection?.segment).toBe('volatile');
    expect(section(withoutOverride, 'progress')).toContain('First volume goal');
    expect(section(withOverride, 'progress')).not.toContain('First volume goal');
    expect(withoutOverride.renderedStable).toBe(withOverride.renderedStable);
  });

  it('should give the chat how the latest chapter ends and where it leaves the story, unscrubbed and outside the stable prefix', async () => {
    const pack = await assembler({
      chapters: [
        {
          number: 1,
          title: 'Arrival',
          status: 'done',
          summary: 'Mira takes the lamp.',
          isolated: false,
          content: 'Opening.\n\nMira climbs the stair as the tide turns. The keeper lets the lamp go dark.',
        },
      ],
      drafts: [
        {
          chapter: 1,
          title: 'Arrival',
          reviewStatus: 'approved',
          summary: null,
          isolated: false,
          staleReason: null,
          body: 'draft',
          state: { characterPositions: [{ entityKey: 'mira', location: 'the pier' }] },
        },
      ],
    }).forNovelChat(1n, new Date(0), { promptTokens: PROMPT_TOKENS, requestTokens: 0 });

    expect(section(pack, 'prev_ending')).toContain(STORY.ending);
    expect(section(pack, 'continuation_state')).toContain('"location":"the pier"');
    expect(pack.renderedStable).not.toContain('Mira climbs the stair');
    expect(pack.sections.find(candidate => candidate.key === 'prev_ending')?.tokens).toBeLessThanOrEqual(NOVEL_CHAT_SECTION_CAPS.latestEnding);
  });

  it('should read no chapter ending before anything is written', async () => {
    const pack = await assembler({}).forNovelChat(1n, new Date(0), { promptTokens: PROMPT_TOKENS, requestTokens: 0 });

    expect(pack.sections.map(candidate => candidate.key)).not.toContain('prev_ending');
    expect(pack.sections.map(candidate => candidate.key)).not.toContain('continuation_state');
  });
});

describe('ContextAssembler.forNovelChat on a large project', () => {
  const many = (count: number, row: (index: number) => Record<string, unknown>) => Array.from({ length: count }, (_, index) => row(index));
  const long = 'the harbour keeps its lamp '.repeat(60);
  const rows: Rows = {
    decisionLedgerEntries: many(60, index => ledgerEntry(`Decision ${index}: ${long.slice(0, 240)}`, index % 2 ? 'author' : 'system', 'decision', `topic.${index}`)),
    volumes: many(4, index => ({ volumeKey: `v${index}`, ordinal: index, title: `Volume ${index}`, objective: long.slice(0, 200), state: index === 0 ? 'active' : 'not_started' })),
    plotThreads: many(60, index => ({
      threadKey: `thread_${index}`,
      status: 'open',
      summary: long.slice(0, 150),
      openedChapter: 1,
      lastAdvancedChapter: 1,
      payoffWindow: null,
      intentionallyOpen: false,
    })),
    entities: many(200, index => ({ entityKey: `entity_${index}`, name: `Entity ${index}`, type: 'character', significance: index < 20 ? 'major' : 'minor' })),
    bibleDocuments: many(120, index => ({ section: 'lore', slug: `page-${index}`, frontmatter: { title: `Page ${index}` } })),
    canonFacts: many(160, index => ({ factKey: `fact_${index}`, disclosedInChapter: index % 3 ? null : 4 })),
    worldFacts: many(300, index => ({ category: `category_${index % 60}`, key: `key_${index}` })),
    milestones: many(40, index => ({ milestoneKey: `milestone_${index}`, label: `Milestone ${index}`, state: 'open' })),
    chapters: many(60, index => ({ number: index + 1, title: `Chapter ${index + 1}`, status: 'done', summary: long, isolated: false })),
    briefs: [
      {
        chapter: 61,
        title: 'Next',
        chapterPurpose: long,
        direction: long,
        body: long.repeat(3),
        pov: 'mira',
        scenes: [],
        endingContract: null,
        revision: 1,
        writeMode: 'standard',
      },
    ],
  };
  const project = { ...STORY, premise: long.repeat(3) };
  const packs = new Map<string, AssembledPack>();
  const plugin = {
    writerClass: 'standard',
    contextSections: [{ key: 'harbour.tides', title: 'Tide tables', rendered: 'High tide at dusk.', segment: 'stable', minWriterClass: 'standard' }],
  };
  const build = (promptTokens: number, requestTokens: number, policy?: unknown) =>
    assembler(rows, project).forNovelChat(1n, new Date(0), { promptTokens, requestTokens, policy: policy as never });

  beforeAll(async () => {
    packs.set('fresh', await build(PROMPT_TOKENS, 0));
    packs.set('full', await build(PROMPT_TOKENS, NOVEL_CHAT_HISTORY_ALLOWANCE));
    packs.set('huge message', await build(PROMPT_TOKENS, 20_000));
    packs.set('huge prompt', await build(20_000, 0));
    packs.set('plugin fresh', await build(PROMPT_TOKENS, 0, plugin));
    packs.set('plugin full', await build(PROMPT_TOKENS, NOVEL_CHAT_HISTORY_ALLOWANCE, plugin));
  });

  function pack(name: string): AssembledPack {
    const built = packs.get(name);
    if (!built) throw new Error(`no ${name} pack`);
    return built;
  }

  it('should keep a fresh request within budget, and go over at the history ceiling only by the handoff it keeps', () => {
    expect(countTokens(pack('fresh').rendered) + PROMPT_TOKENS).toBeLessThanOrEqual(NOVEL_CHAT_REQUEST_BUDGET);
    const full = countTokens(pack('full').rendered) + PROMPT_TOKENS + NOVEL_CHAT_HISTORY_ALLOWANCE;
    expect(full).toBeLessThanOrEqual(NOVEL_CHAT_REQUEST_BUDGET + NOVEL_CHAT_SECTION_CAPS.handoff);
    for (const name of ['fresh', 'full']) expect(section(pack(name), 'handoff')).toContain('Next chapter: 61 — planned, not written yet.');
    expect(section(pack('fresh'), 'promises')).toMatch(/\(\+\d+ more open promises/);
  });

  it('should keep a trimmed inventory, entities first, with an empty and a full history', () => {
    for (const name of ['fresh', 'full']) {
      const inventory = section(pack(name), 'inventory');
      expect(inventory).toContain('entity_0 — Entity 0 (character, major)');
      expect(inventory).toMatch(/\(\+\d+ more entities — search_lore finds them\)/);
      expect(inventory.indexOf('Characters, places')).toBeLessThan(inventory.indexOf('Story Bible pages'));
    }
  });

  it('should keep the stable prefix byte-identical as the history grows', () => {
    expect(pack('full').renderedStable).toBe(pack('fresh').renderedStable);
    expect(pack('huge message').renderedStable).toBe(pack('fresh').renderedStable);
  });

  it('should carry a plugin section that asks to be stable in the volatile segment, so the prefix still holds', () => {
    expect(pack('plugin full').renderedStable).toBe(pack('plugin fresh').renderedStable);
    expect(pack('plugin fresh').renderedStable).not.toContain('High tide at dusk.');
    expect(pack('plugin fresh').renderedVolatile).toContain('High tide at dusk.');
  });

  it('should keep the handoff and let only the optional volatile sections give way to a long message', () => {
    const squeezed = pack('huge message');

    expect(squeezed.omitted.map(omission => omission.key)).toContain('pipeline_status');
    expect(section(squeezed, 'handoff')).toContain('Next chapter: 61');
    expect(section(squeezed, 'story')).toContain(ENDING_PLANNER_ONLY_LABEL);
  });

  it('should hold the stable sections to the floor, keeping the story and the Notebook, when the prompt leaves no room', () => {
    const floored = pack('huge prompt');
    const stableTokens = floored.sections.filter(candidate => candidate.segment === 'stable').reduce((sum, candidate) => sum + candidate.tokens, 0);

    expect(stableTokens).toBeLessThanOrEqual(NOVEL_CHAT_PACK_FLOOR);
    expect(section(floored, 'story')).toContain('Premise:');
    expect(section(floored, 'notebook')).toContain("### The author's decisions and directions");
  });
});
