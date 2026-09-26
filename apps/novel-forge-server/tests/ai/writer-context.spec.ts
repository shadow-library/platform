import { beforeAll, describe, expect, it, mock } from 'bun:test';

import { type CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { applyBudget, countTokens, truncateAtParagraph, truncateAtParagraphTail } from '@modules/ai/context/token-budget';
import { assertWriterContextFits, type CompletedVolume, renderCompletedVolumes, WRITER_SECTION_CAPS } from '@modules/ai/context/writer-context';
import { emptyPolicy } from '@modules/plugins/plugin-policy.service';

type Row = Record<string, unknown>;

interface Fixture {
  brief?: Row;
  facts?: Row[];
  volumes?: Row[];
  currentVolume?: Row;
  finalized?: Row[];
  plannedBriefs?: Row[];
  bibleDocs?: Row[];
  entities?: Row[];
  characterKnowledge?: Row[];
  prevDraft?: Row;
}

const BRIEF: Row = { chapter: 5, body: 'Ines crosses the salt flats at night.', contextRefs: [], pov: null, volumeKey: null, knowledgeContract: null };

const sentence = (subject: string, count: number): string => `${subject} walks the causeway past the drying racks and the brine pans. `.repeat(count);

function writerDb(fixture: Fixture = {}) {
  const brief = { ...BRIEF, ...fixture.brief };
  const entities = fixture.entities ?? [];
  const none = mock(async () => []);
  return {
    insert: mock(() => ({ values: mock(() => ({ onConflictDoNothing: mock(() => ({ returning: mock(async () => []) })) })) })),
    query: {
      projects: { findFirst: mock(async () => ({ id: 1n, instructions: null, ending: null, endingQuestion: null })) },
      briefs: { findFirst: mock(async () => brief), findMany: mock(async () => fixture.plannedBriefs ?? []) },
      chapters: { findFirst: mock(async () => null), findMany: mock(async () => fixture.finalized ?? []) },
      volumes: { findFirst: mock(async () => fixture.currentVolume ?? null), findMany: mock(async () => fixture.volumes ?? []) },
      drafts: { findFirst: mock(async () => fixture.prevDraft ?? null), findMany: none },
      entities: { findFirst: mock(async () => entities[0] ?? null), findMany: mock(async () => entities) },
      worldFacts: { findMany: none },
      plotThreads: { findMany: none },
      mysteries: { findMany: none },
      bibleDocuments: { findMany: mock(async () => fixture.bibleDocs ?? []) },
      canonFacts: { findMany: mock(async () => fixture.facts ?? []) },
      characterKnowledge: { findMany: mock(async () => fixture.characterKnowledge ?? []) },
      characterStates: { findMany: none },
      entityRelationships: { findMany: none },
      decisionLedgerEntries: { findMany: none },
      milestones: { findMany: none },
      contextPacks: { findFirst: mock(async () => null) },
    },
  };
}

function assembler(fixture: Fixture = {}): ContextAssembler {
  const catalog = { render: mock(async () => '') } as unknown as CatalogService;
  return new ContextAssembler({ getPostgresClient: () => writerDb(fixture) } as never, catalog);
}

const HUGE = 1_000_000;

async function requiredTokens(fixture: Fixture): Promise<number> {
  const pack = await assembler(fixture).forChapter(1n, 5, { dryRun: true, budgetTokens: HUGE });
  const planTokens = HUGE - pack.budgetTokens;
  return planTokens + pack.sections.filter(section => section.required).reduce((sum, section) => sum + section.tokens, 0);
}

const oren = { id: 2n, entityKey: 'oren', name: 'Oren Vale', type: 'character', status: 'active', body: sentence('Oren', 40), notes: null, aliases: [] };
const guild = { id: 3n, entityKey: 'salt_guild', name: 'Salt Guild', type: 'faction', status: 'active', body: sentence('The guild', 40), notes: null, aliases: [] };
const saltPage = { section: 'world', slug: 'salt-flats', body: 'The salt flats flood at the spring tide.' };

const UNRESTRICTED_READER = emptyPolicy('permissive');

describe('ContextAssembler.forChapter — optional material', () => {
  beforeAll(() => countTokens('warm'));

  it('should give the plan-cited page the budget before an extra entity sheet that renders ahead of it, and record the cut sheet', async () => {
    const fixture: Fixture = { brief: { contextRefs: ['entity:salt_guild', 'bible_doc:world/salt-flats'] }, entities: [guild], bibleDocs: [saltPage] };
    const reserved = await requiredTokens(fixture);
    const full = await assembler(fixture).forChapter(1n, 5, { dryRun: true, budgetTokens: HUGE });
    const card = full.sections.find(section => section.key === 'ref:entity:salt_guild');
    const keys = full.sections.map(section => section.key);
    expect(keys.indexOf('ref:entity:salt_guild')).toBeLessThan(keys.indexOf('ref:bible_doc:world/salt-flats'));

    const pack = await assembler(fixture).forChapter(1n, 5, { dryRun: true, budgetTokens: reserved + (card?.tokens ?? 0) + 10 });

    expect(pack.sections.some(section => section.key === 'ref:bible_doc:world/salt-flats')).toBe(true);
    expect(pack.omitted).toEqual([{ key: 'ref:entity:salt_guild', reason: 'budget', tokens: card?.tokens }]);
    expect(pack.sections.find(section => section.key === 'writing_style')?.required).toBe(true);
  });

  it('should reserve a character the plan cites, cut to its limit', async () => {
    const pack = await assembler({ brief: { contextRefs: ['entity:oren', 'entity:salt_guild'] }, entities: [oren, guild] }).forChapter(1n, 5, { dryRun: true });

    const card = pack.sections.find(section => section.key === 'ref:entity:oren');
    expect(card?.required).toBe(true);
    expect(card?.tokens).toBeLessThanOrEqual(WRITER_SECTION_CAPS.castCard);
    expect(pack.sections.find(section => section.key === 'ref:entity:salt_guild')?.required).toBeUndefined();
  });

  it('should record a cited page cut for budget with its size, keeping every required section', async () => {
    const bigPage = { section: 'world', slug: 'salt-flats', body: sentence('The warden', 120) };
    const fixture: Fixture = { brief: { contextRefs: ['bible_doc:world/salt-flats'] }, bibleDocs: [bigPage] };
    const reserved = await requiredTokens(fixture);

    const pack = await assembler(fixture).forChapter(1n, 5, { dryRun: true, budgetTokens: reserved + 50 });

    expect(pack.omitted).toHaveLength(1);
    expect(pack.omitted[0]).toMatchObject({ key: 'ref:bible_doc:world/salt-flats', reason: 'budget' });
    expect(pack.omitted[0]?.tokens).toBeGreaterThan(50);
    expect(pack.usedTokens).toBeLessThanOrEqual(pack.budgetTokens);
  });
});

describe('ContextAssembler.forChapter — required material', () => {
  const rule = { id: 1n, factKey: 'salt_binds', text: 'Salt binds a spoken oath for a year and a day.', revealChapter: 1, unlock: null, terms: null, source: 'manual' };
  const secret = {
    id: 2n,
    factKey: 'warden_drowned',
    text: 'The warden drowned his brother in the brine pans.',
    revealChapter: 9,
    unlock: null,
    terms: ['drowned'],
    source: 'manual',
  };

  it('should always carry the open canon to the writer without a knowledge contract, once, and never a locked fact', async () => {
    const pack = await assembler({ brief: { contextRefs: ['fact:salt_binds'] }, facts: [rule, secret] }).forChapter(1n, 5, { dryRun: true });

    const openCanon = pack.sections.find(section => section.key === 'open_canon');
    expect(openCanon?.rendered).toBe('## BOOK RULES (OPEN CANON)\n\n- [salt_binds] Salt binds a spoken oath for a year and a day.');
    expect(openCanon?.required).toBe(true);
    expect(openCanon?.segment).toBe('stable');
    expect(pack.sections.some(section => section.key === 'ref:fact:salt_binds')).toBe(false);
    expect(pack.rendered).not.toContain('brine pans');
  });

  it("should leave open canon inside what the point-of-view cast knows under a knowledge contract, and reserve every cast member's sheet", async () => {
    const ines = { id: 10n, entityKey: 'ines', name: 'Ines', type: 'character', status: 'active', body: 'Ines keeps the tide book.', notes: null, aliases: [] };
    const fixture: Fixture = { brief: { pov: 'ines', knowledgeContract: { pov: ['ines', 'oren'], learns: [] } }, facts: [rule], entities: [ines, oren] };

    const pack = await assembler(fixture).forChapter(1n, 5, { dryRun: true });

    expect(pack.sections.some(section => section.key === 'open_canon')).toBe(false);
    expect(pack.sections.find(section => section.key === 'known_facts')?.rendered).toContain('Salt binds a spoken oath');
    expect(pack.sections.find(section => section.key === 'ref:entity:ines')?.required).toBe(true);
    expect(pack.sections.find(section => section.key === 'ref:entity:oren')?.required).toBe(true);
  });

  it('should cut open canon past its limit, rules about the chapter cast first, and record each cut instead of failing', async () => {
    const rules = Array.from({ length: 60 }, (_, i) => ({ ...rule, id: BigInt(100 + i), factKey: `rule_${i}`, text: sentence(`Rule ${i}`, 3), subjects: null }));
    const aboutInes = { ...rule, id: 99n, factKey: 'rule_ines', text: 'Ines may never cross running water.', subjects: ['ines'] };
    expect(countTokens(rules.map(r => `- [${r.factKey}] ${r.text}`).join('\n'))).toBeGreaterThan(WRITER_SECTION_CAPS.openCanon);

    const pack = await assembler({ brief: { pov: 'ines' }, facts: [...rules, aboutInes] }).forChapter(1n, 5, { dryRun: true, enforceWriterReservations: true });

    const openCanon = pack.sections.find(section => section.key === 'open_canon');
    expect(openCanon?.tokens).toBeLessThanOrEqual(WRITER_SECTION_CAPS.openCanon);
    expect(openCanon?.rendered).toContain('- [rule_ines] Ines may never cross running water.');
    const keptKeys = (openCanon?.rendered.match(/^- \[([^\]]+)\]/gm) ?? []).map(line => line.slice(3, -1));
    expect(keptKeys).toEqual([...keptKeys].sort((left, right) => left.localeCompare(right)));
    const cut = pack.omitted.filter(entry => entry.key.startsWith('fact:rule_'));
    expect(cut.length).toBeGreaterThan(0);
    expect(cut.every(entry => (entry.tokens ?? 0) > 0 && !openCanon?.rendered.includes(`[${entry.key.slice('fact:'.length)}]`))).toBe(true);
  });

  it('should fail a writing call naming the section that takes the required material over the budget', async () => {
    const failure = assembler({ facts: [rule] }).forChapter(1n, 5, { dryRun: true, budgetTokens: 60, enforceWriterReservations: true });

    await expect(failure).rejects.toMatchObject({ code: 'CTX_002' });
    await expect(failure).rejects.toThrow(
      /^The writer's required material does not fit — with the style guide the required material reaches [\d,]+ tokens, [\d,]+ over the writer's 60-token budget \(largest: the style guide/,
    );
  });

  it('should give a reader of the pack everything it can hold without failing, however far over the budget', async () => {
    const pack = await assembler({ facts: [rule] }).forChapter(1n, 5, { dryRun: true, budgetTokens: 60 });

    expect(pack.sections.find(section => section.key === 'writing_style')).toBeDefined();
    expect(pack.sections.find(section => section.key === 'open_canon')).toBeDefined();
  });

  it("should never fail a writing call on what the cast has learned: the chapter's subjects and the latest facts stay, the rest are recorded as cut", async () => {
    const ines = { id: 10n, entityKey: 'ines', name: 'Ines', type: 'character', status: 'active', body: 'Ines keeps the tide book.', notes: null, aliases: [] };
    const learned = Array.from({ length: 200 }, (_, i) => ({
      id: BigInt(1000 + i),
      factKey: `learned_${i}`,
      text: sentence(`Fact ${i}`, 2),
      revealChapter: null,
      unlock: null,
      terms: null,
      subjects: i === 0 ? ['ines'] : null,
      source: 'manual',
    }));
    const ledger = learned.map((fact, i) => ({ factId: fact.id, entityId: 10n, learnedInChapter: 1 + (i % 4) }));
    const fixture: Fixture = { brief: { pov: 'ines', knowledgeContract: { pov: ['ines'], learns: [] } }, facts: learned, entities: [ines], characterKnowledge: ledger };

    const pack = await assembler(fixture).forChapter(1n, 5, { dryRun: true, enforceWriterReservations: true });

    const known = pack.sections.find(section => section.key === 'known_facts');
    expect(known?.tokens).toBeLessThanOrEqual(WRITER_SECTION_CAPS.knownFacts);
    expect(known?.rendered).toContain('[learned_0]');
    expect(known?.rendered).toContain('[learned_3]');
    const cut = pack.omitted.map(entry => entry.key);
    expect(cut).toContain('fact:learned_4');
    expect(cut.every(key => key.startsWith('fact:learned_'))).toBe(true);
    expect(pack.omitted.every(entry => (entry.tokens ?? 0) > 0)).toBe(true);
  });
});

describe('ContextAssembler.forChapter — stability and bounds', () => {
  const rule = (key: string, subjects: string[] | null): Row => ({
    id: BigInt(key.length),
    factKey: key,
    text: `Rule ${key} holds.`,
    revealChapter: 1,
    unlock: null,
    terms: null,
    subjects,
    source: 'manual',
  });
  const character = (key: string, i: number): Row => ({
    id: BigInt(20 + i),
    entityKey: key,
    name: `Crew ${i}`,
    type: 'character',
    status: 'active',
    body: sentence(`Crew ${i}`, 30),
    notes: null,
    aliases: [],
  });

  it('should render open canon byte for byte the same for chapters with different casts when every rule fits', async () => {
    const facts = [rule('a_tide', ['oren']), rule('b_salt', ['ines']), rule('c_oath', null)];

    const inesPack = await assembler({ brief: { pov: 'ines' }, facts }).forChapter(1n, 5, { dryRun: true });
    const orenPack = await assembler({ brief: { pov: 'oren' }, facts }).forChapter(1n, 5, { dryRun: true });

    const rendered = (pack: typeof inesPack) => pack.sections.find(section => section.key === 'open_canon')?.rendered;
    expect(rendered(inesPack)).toBe(rendered(orenPack));
    expect(rendered(inesPack)).toBe('## BOOK RULES (OPEN CANON)\n\n- [a_tide] Rule a_tide holds.\n- [b_salt] Rule b_salt holds.\n- [c_oath] Rule c_oath holds.');
  });

  it('should require only the first five characters the plan cites, letting later ones compete and recording them when cut', async () => {
    const crew = Array.from({ length: 7 }, (_, i) => character(`crew_${i}`, i));
    const fixture: Fixture = { brief: { contextRefs: crew.map(member => `entity:${member.entityKey}`) }, entities: crew };
    const reserved = await requiredTokens(fixture);

    const pack = await assembler(fixture).forChapter(1n, 5, { dryRun: true, budgetTokens: reserved + 10 });

    const required = pack.sections.filter(section => section.key.startsWith('ref:entity:crew_') && section.required).map(section => section.key);
    expect(required).toEqual(['ref:entity:crew_0', 'ref:entity:crew_1', 'ref:entity:crew_2', 'ref:entity:crew_3', 'ref:entity:crew_4']);
    expect(pack.omitted.map(entry => entry.key)).toEqual(['ref:entity:crew_5', 'ref:entity:crew_6']);
  });

  it('should point at the plan and the characters it names when they take most of an over-budget reservation', async () => {
    const crew = Array.from({ length: 5 }, (_, i) => character(`crew_${i}`, i));
    const fixture: Fixture = { brief: { body: sentence('The plan', 60), contextRefs: crew.map(member => `entity:${member.entityKey}`) }, entities: crew };
    const reserved = await requiredTokens(fixture);

    const failure = assembler(fixture).forChapter(1n, 5, { dryRun: true, budgetTokens: reserved - 100, enforceWriterReservations: true });

    await expect(failure).rejects.toThrow(
      /does not fit — the chapter plan and the characters it names take [\d,]+ of the [\d,]+ tokens the required material needs, 100 over the writer's [\d,]+-token budget — shorten the plan or name fewer characters in it\.$/,
    );
  });

  it('should fit an isolated predecessor state into an unrestricted reader’s previous ending by whole entries, never by a cut inside its JSON', async () => {
    const state = { conflict: sentence('The quarrel', 200), lastAction: 'Ines seals the ledger.' };
    const isolated = (value: unknown): Fixture => ({ prevDraft: { chapter: 4, body: null, summary: 'Four ends at the weir.', state: value, isolated: true, staleReason: null } });

    for (const [value, expected] of [
      [state, { lastAction: 'Ines seals the ledger.' }],
      [['The weir holds.', sentence('A long list item', 200)], ['The weir holds.']],
    ] as const) {
      const pack = await assembler(isolated(value)).forChapter(1n, 5, { dryRun: true, enforceWriterReservations: true, policy: UNRESTRICTED_READER });
      const ending = pack.sections.find(section => section.key === 'prev_ending');
      expect(ending?.truncated).toBe(false);
      expect(ending?.tokens).toBeLessThanOrEqual(WRITER_SECTION_CAPS.prevEnding);
      expect(JSON.parse(ending?.rendered.split('\nState: ')[1] ?? '')).toEqual(expected);
    }
  });
});

describe('ContextAssembler.forChapter — earlier volumes', () => {
  const volume = (ordinal: number, state = 'active'): Row => ({ volumeKey: `v${ordinal}`, ordinal, title: `Tide ${ordinal}`, objective: `Goal of tide ${ordinal}.`, state });
  const finalized = Array.from({ length: 11 }, (_, i) => ({
    number: i + 1,
    summary: `Chapter ${i + 1} settles the matter of tide ${i < 3 ? 1 : i < 7 ? 2 : 3}. It leaves a mark.`,
    volumeKey: i < 3 || i === 7 ? 'v1' : null,
    status: 'done',
  }));
  const plannedBriefs = finalized.slice(3).map(row => ({ chapter: row.number, volumeKey: row.number <= 7 ? 'v2' : 'v3' }));

  it("should summarise each volume before the brief's own from its finalized chapters, and nothing later", async () => {
    const fixture: Fixture = {
      brief: { chapter: 12, volumeKey: 'v3' },
      volumes: [volume(1, 'goal_met'), volume(2), volume(3), volume(4, 'goal_met')],
      currentVolume: volume(3),
      finalized,
      plannedBriefs,
    };

    const pack = await assembler(fixture).forChapter(1n, 12, { dryRun: true });

    const section = pack.sections.find(s => s.key === 'completed_volumes');
    expect(section?.required).toBe(true);
    expect(section?.sourceRefs).toEqual(['volume:v1', 'volume:v2']);
    expect(section?.rendered).toContain('**Volume 1: Tide 1** (chapters 1–3)');
    expect(section?.rendered).toContain('Where it left things: Chapter 3 settles the matter of tide 1. It leaves a mark.');
    expect(section?.rendered).toContain('**Volume 2: Tide 2** (chapters 4–7)');
    expect(section?.rendered).toContain('Late turns: ch 5: Chapter 5 settles the matter of tide 2. ch 6: Chapter 6 settles the matter of tide 2.');
    expect(section?.rendered).not.toContain('Tide 4');
    expect(section?.rendered).not.toContain('tide 3');
    expect(section?.rendered).not.toContain('Chapter 8');
    expect(pack.sections.find(s => s.key === 'volume_objective')?.rendered).toContain('Goal of tide 3.');
  });
});

describe('ContextAssembler.forChapter — continuation state over its limit', () => {
  it('should drop whole entries, the largest first, and keep the state valid JSON', async () => {
    const state = { lastAction: 'Ines seals the ledger.', conflict: sentence('The quarrel', 200), establishedFacts: ['The causeway floods at dusk.'] };

    const pack = await assembler({ prevDraft: { chapter: 4, body: null, summary: 'Four.', state, isolated: false, staleReason: null } }).forChapter(1n, 5, {
      dryRun: true,
      enforceWriterReservations: true,
    });

    const section = pack.sections.find(s => s.key === 'continuation_state');
    expect(section?.tokens).toBeLessThanOrEqual(WRITER_SECTION_CAPS.continuationState);
    const carried = JSON.parse(section?.rendered.split('\n\n').slice(1).join('\n\n') ?? '') as Record<string, unknown>;
    expect(carried).toEqual({ lastAction: 'Ines seals the ledger.', establishedFacts: ['The causeway floods at dusk.'] });
  });
});

describe('truncation of a script written without spaces', () => {
  const text = '灯塔守护者在潮水退去之前点亮了最后一盏灯。'.repeat(12);

  it('should cut by character from the front or the back instead of returning nothing', () => {
    const head = truncateAtParagraph(text, 30);
    const tail = truncateAtParagraphTail(text, 30);

    expect(head.text.length).toBeGreaterThan(0);
    expect(countTokens(head.text)).toBeLessThanOrEqual(30);
    expect(text.startsWith(head.text)).toBe(true);
    expect(tail.text.length).toBeGreaterThan(0);
    expect(countTokens(tail.text)).toBeLessThanOrEqual(30);
    expect(text.endsWith(tail.text)).toBe(true);
  });

  it('should keep an earlier-volume closing summary in such a script within its limit', () => {
    const rendered = renderCompletedVolumes([{ ordinal: 1, title: '潮', goal: null, chapters: [{ number: 1, summary: text }] }], 1_000);

    expect(rendered).toContain('Where it left things: 灯塔守护者');
    expect(countTokens(rendered ?? '')).toBeLessThanOrEqual(200);
  });
});

describe('renderCompletedVolumes', () => {
  const longVolume = (ordinal: number): CompletedVolume => ({
    ordinal,
    title: `Tide ${ordinal}`,
    goal: sentence('The goal', 10),
    chapters: Array.from({ length: 4 }, (_, i) => ({ number: ordinal * 10 + i, summary: sentence(`Chapter ${ordinal * 10 + i}`, 10) })),
  });

  it('should cap every volume and keep the newest when they cannot all fit, saying how many it left out', () => {
    const rendered = renderCompletedVolumes(
      Array.from({ length: 6 }, (_, i) => longVolume(i + 1)),
      800,
    );

    expect(countTokens(rendered ?? '')).toBeLessThanOrEqual(820);
    expect(rendered).toMatch(/^\(\d+ earlier volumes not shown\)/);
    expect(rendered).toContain('**Volume 6: Tide 6**');
    expect(rendered).not.toContain('**Volume 1: Tide 1**');
    const blocks = (rendered ?? '').split('\n\n').slice(1);
    for (const block of blocks) expect(countTokens(block)).toBeLessThanOrEqual(400);
  });

  it('should describe a one-chapter volume by its closing summary alone and skip a volume without finalized chapters', () => {
    const rendered = renderCompletedVolumes(
      [
        { ordinal: 1, title: 'Tide 1', goal: null, chapters: [{ number: 1, summary: 'The oath is sworn.' }] },
        { ordinal: 2, title: 'Tide 2', goal: 'Break the oath.', chapters: [] },
      ],
      1_000,
    );

    expect(rendered).toBe('**Volume 1: Tide 1** (chapter 1)\nWhere it left things: The oath is sworn.');
  });
});

describe('assertWriterContextFits', () => {
  it('should pass silently when every section is within its limit and the budget', () => {
    expect(() =>
      assertWriterContextFits(
        [
          { name: 'the chapter plan', tokens: 400, cap: 6_000 },
          { name: 'the style guide', tokens: 600, cap: 4_100 },
        ],
        1_000,
      ),
    ).not.toThrow();
  });

  it('should name the section that crosses the budget, the overage and the largest sections', () => {
    const reservations = [
      { name: 'the chapter plan', tokens: 1_500, cap: 6_000 },
      { name: 'what the point-of-view cast knows', tokens: 3_900, cap: 4_000 },
      { name: 'the style guide', tokens: 1_200, cap: 4_100 },
    ];

    expect(() => assertWriterContextFits(reservations, 6_000)).toThrow(
      "The writer's required material does not fit — with the style guide the required material reaches 6,600 tokens, 600 over the writer's 6,000-token budget " +
        '(largest: what the point-of-view cast knows 3,900, the chapter plan 1,500); shorten the largest and try again.',
    );
  });
});

describe('applyBudget — priority', () => {
  it('should let a lower priority claim the budget first while the survivors keep their list order', () => {
    const sections = [
      { key: 'card', tokens: 30, priority: 3 },
      { key: 'page', tokens: 20, priority: 1 },
      { key: 'style', tokens: 50, required: true },
      { key: 'state', tokens: 10, priority: 2 },
    ];

    const { fitting, omitted } = applyBudget(sections, 85);

    expect(fitting.map(section => section.key)).toEqual(['page', 'style', 'state']);
    expect(omitted).toEqual([{ key: 'card', reason: 'budget', tokens: 30 }]);
  });
});
