import { beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';

import { type CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler, ENTITY_CARD_BUDGET, FULL_CAST_MAX, WRITING_STYLE_BUDGET } from '@modules/ai/context/context-assembler.service';
import { countTokens } from '@modules/ai/context/token-budget';
import { DEFAULT_WRITING_INSTRUCTIONS } from '@modules/ai/prompts/authoring-preamble';

const filler = (subject: string, count: number): string =>
  Array.from({ length: count }, (_, i) => `Paragraph ${i}. ${`${subject} walks the quay past tar barrels, coiled rope and gull-picked nets. `.repeat(12)}`).join('\n\n');

const POV_TAIL = 'POV_CARD_LAST_PARAGRAPH';
const DESCRIPTION_TAIL = 'SIDE_CARD_LAST_DESCRIPTION';
const CAUTION = 'SIDE_CARD_CAUTION_MARKER';
const PROHIBITION = 'SIDE_CARD_PROHIBITION_MARKER';

const wren = {
  id: 1n,
  entityKey: 'wren',
  name: 'Wren Aldous',
  type: 'character',
  status: 'active',
  body: `${filler('Wren', 5)}\n\n${POV_TAIL}`,
  notes: null,
  aliases: [{ alias: 'the tallyman' }],
};

const tobin = {
  id: 2n,
  entityKey: 'tobin',
  name: 'Tobin Reyes',
  type: 'character',
  status: 'active',
  body: `${filler('Tobin', 5)}\n\n${DESCRIPTION_TAIL}\n\n## Drafter guidance\n\nKeep his humour dry and brief. ${CAUTION}\n\n**Never:** he never raises his voice at a crew member. ${PROHIBITION}`,
  notes: null,
  aliases: [],
};

const guild = { id: 3n, entityKey: 'harbor_guild', name: 'Harbor Guild', type: 'faction', status: 'active', body: 'Keeps the tide tables.', notes: null, aliases: [] };

const worldFacts = [
  { category: 'harbor_customs', key: 'bell_curfew', value: 'No boat leaves after the third bell.' },
  { category: 'harbor_customs', key: 'tithe_scale', value: 'Every tenth crate goes to the guild.' },
  { category: 'weather', key: 'fog_season', value: 'Fog holds the bay for a month each autumn.' },
];

const volume = { volumeKey: 'volume_tides', ordinal: 2, title: 'The Turning Tide', objective: 'VOLUME_REF_OBJECTIVE' };

const bibleDocs = [
  { section: 'world', slug: 'harbor', body: 'BIBLE_HARBOR_MARKER The harbor is tidal and shallow.' },
  { section: 'world', slug: 'ledger', body: filler('The ledger', 15) },
];

const baseRefs = [
  'entity:wren',
  'entity:tobin',
  'entity:harbor_guild',
  'volume:volume_tides',
  'volume:volume_missing',
  'arc:arc_opening',
  'world_fact:harbor_customs',
  'world_fact:fog_season',
  'world_fact:weather/fog_season',
  'world_fact:harbor_customs/missing',
  'bible_doc:world/harbor',
];

interface FixtureOptions {
  contextRefs?: string[];
  instructions?: string;
  extraEntities?: (typeof guild)[];
  ledger?: Record<string, unknown>[];
}

function chapterOneDb(options: FixtureOptions = {}) {
  const { contextRefs = baseRefs, instructions = 'WRITING_STYLE_MARKER Write close third person.', extraEntities = [], ledger = [] } = options;
  const brief = { chapter: 1, body: 'Wren counts crates.', contextRefs, pov: 'wren', volumeKey: null, knowledgeContract: { pov: ['wren'], learns: [] } };
  const entities = [wren, tobin, guild, ...extraEntities];
  return {
    insert: mock(() => ({ values: mock(() => ({ onConflictDoNothing: mock(() => ({ returning: mock(async () => []) })) })) })),
    query: {
      projects: { findFirst: mock(async () => ({ id: 1n, instructions })) },
      briefs: { findFirst: mock(async () => brief) },
      chapters: { findFirst: mock(async () => null), findMany: mock(async () => []) },
      volumes: { findFirst: mock(async () => null), findMany: mock(async () => [volume]) },
      drafts: { findFirst: mock(async () => null), findMany: mock(async () => []) },
      entities: { findFirst: mock(async () => wren), findMany: mock(async () => entities) },
      worldFacts: { findMany: mock(async () => worldFacts) },
      plotThreads: { findMany: mock(async () => []) },
      mysteries: { findMany: mock(async () => []) },
      bibleDocuments: { findMany: mock(async () => bibleDocs) },
      canonFacts: { findMany: mock(async () => []) },
      characterKnowledge: { findMany: mock(async () => []) },
      characterStates: { findMany: mock(async () => []) },
      entityRelationships: { findMany: mock(async () => []) },
      contextPacks: { findFirst: mock(async () => null) },
      decisionLedgerEntries: { findMany: mock(async () => ledger) },
    },
  };
}

function makeAssembler(db: ReturnType<typeof chapterOneDb>): ContextAssembler {
  const catalog = { render: mock(async () => '') } as unknown as CatalogService;
  return new ContextAssembler({ getPostgresClient: () => db } as never, catalog);
}

describe('ContextAssembler.forChapter — chapter pack assembly', () => {
  beforeAll(() => countTokens('warm'));

  it('should render the POV card uncapped and in authored order', async () => {
    const pack = await makeAssembler(chapterOneDb()).forChapter(1n, 1, { dryRun: true });

    const pov = pack.sections.find(s => s.key === 'ref:entity:wren');
    expect(countTokens(wren.body)).toBeGreaterThan(ENTITY_CARD_BUDGET);
    expect(pov?.rendered).toContain(POV_TAIL);
    expect(pov?.rendered.startsWith('## POV CHARACTER: Wren Aldous')).toBe(true);
    expect(pov?.truncated).toBe(false);
  });

  it('should cap other cards at the entity budget while keeping their guidance and prohibitions', async () => {
    const pack = await makeAssembler(chapterOneDb()).forChapter(1n, 1, { dryRun: true });

    const card = pack.sections.find(s => s.key === 'ref:entity:tobin');
    expect(countTokens(tobin.body)).toBeGreaterThan(ENTITY_CARD_BUDGET);
    expect(card?.truncated).toBe(true);
    expect(card?.rendered).toContain(CAUTION);
    expect(card?.rendered).toContain(PROHIBITION);
    expect(card?.rendered).not.toContain(DESCRIPTION_TAIL);
    expect(card?.rendered.indexOf(CAUTION)).toBeLessThan(card?.rendered.indexOf('Paragraph 0.') ?? -1);
    expect(countTokens(card?.rendered ?? '')).toBeLessThanOrEqual(ENTITY_CARD_BUDGET + 40);
  });

  it('should keep a card that fits the budget in its authored order', async () => {
    const pack = await makeAssembler(chapterOneDb()).forChapter(1n, 1, { dryRun: true });

    const card = pack.sections.find(s => s.key === 'ref:entity:harbor_guild');
    expect(card?.rendered).toBe('## FACTION: Harbor Guild\n\n**Harbor Guild** (faction, active)\nKeeps the tide tables.\nStatus: active');
    expect(card?.truncated).toBe(false);
  });

  it('should head every resolved ref with a readable label instead of its raw key', async () => {
    const pack = await makeAssembler(chapterOneDb()).forChapter(1n, 1, { dryRun: true });

    expect(pack.rendered).not.toMatch(/## REF:/);
    expect(pack.rendered).toContain('## CHARACTER: Tobin Reyes');
    expect(pack.rendered).toContain('## VOLUME: The Turning Tide');
    expect(pack.rendered).toContain('## WORLD FACTS: harbor_customs');
    expect(pack.rendered).toContain('## BIBLE: world/harbor');
  });

  it('should resolve a volume ref to its goal and leave an arc ref unresolved', async () => {
    const pack = await makeAssembler(chapterOneDb()).forChapter(1n, 1, { dryRun: true });

    const section = pack.sections.find(s => s.key === 'ref:volume:volume_tides');
    expect(section?.rendered).toContain('Goal: VOLUME_REF_OBJECTIVE');
    expect(section?.tier).toBe('approved_intent');
    expect(pack.unresolvedRefs).toContain('volume:volume_missing');
    expect(pack.unresolvedRefs).toContain('arc:arc_opening');
  });

  it('should resolve world_fact refs by category, by key, and by category/key', async () => {
    const pack = await makeAssembler(chapterOneDb()).forChapter(1n, 1, { dryRun: true });

    const byCategory = pack.sections.find(s => s.key === 'ref:world_fact:harbor_customs');
    expect(byCategory?.rendered).toContain('bell_curfew: No boat leaves after the third bell.');
    expect(byCategory?.rendered).toContain('tithe_scale: Every tenth crate goes to the guild.');
    expect(pack.sections.find(s => s.key === 'ref:world_fact:fog_season')?.rendered).toContain('weather/fog_season: Fog holds the bay');
    expect(pack.sections.find(s => s.key === 'ref:world_fact:weather/fog_season')?.rendered).toContain('weather/fog_season: Fog holds the bay');
    expect(pack.unresolvedRefs).toContain('world_fact:harbor_customs/missing');
  });

  it('should tell chapter one that the POV cast starts with no ledgered facts', async () => {
    const pack = await makeAssembler(chapterOneDb()).forChapter(1n, 1, { dryRun: true });

    expect(pack.sections.find(s => s.key === 'known_facts')?.rendered).toContain('no ledgered facts');
  });

  it('should keep writing_style when the refs exceed the budget and report what was dropped', async () => {
    const refs = [...baseRefs, 'bible_doc:world/ledger'];
    const pack = await makeAssembler(chapterOneDb({ contextRefs: refs })).forChapter(1n, 1, { dryRun: true, budgetTokens: 3_000 });

    expect(countTokens(bibleDocs[1]!.body)).toBeGreaterThan(3_000 - pack.usedTokens);

    expect(pack.sections.find(s => s.key === 'writing_style')?.rendered).toContain('WRITING_STYLE_MARKER');
    expect(pack.omitted.map(o => o.key)).toContain('ref:bible_doc:world/ledger');
    expect(pack.usedTokens).toBeLessThanOrEqual(3_000);
  });

  it('should resolve a ref listed twice only once', async () => {
    const assembler = makeAssembler(chapterOneDb());
    const { resolved } = await assembler.resolveRefs(1n, ['volume:volume_tides', 'volume:volume_tides']);

    expect(resolved.map(s => s.key)).toEqual(['ref:volume:volume_tides']);
  });

  it('should cap oversized project additions so they cannot claim the whole budget, keeping the default whole', async () => {
    const instructions = `WRITING_STYLE_MARKER\n\n${filler('The narrator', 20)}`;
    const pack = await makeAssembler(chapterOneDb({ instructions })).forChapter(1n, 1, { dryRun: true });

    const style = pack.sections.find(s => s.key === 'writing_style');
    expect(countTokens(instructions)).toBeGreaterThan(WRITING_STYLE_BUDGET);
    expect(style?.truncated).toBe(true);
    expect(style?.rendered).toContain(DEFAULT_WRITING_INSTRUCTIONS);
    expect(style?.rendered).toContain('WRITING_STYLE_MARKER');
    expect(style?.tokens).toBeLessThanOrEqual(WRITING_STYLE_BUDGET + 10);
    expect(pack.sections.some(s => s.key === 'ref:entity:wren')).toBe(true);
  });

  it('should warn with unresolved refs and non-routine omissions on a persisted pack', async () => {
    const extras = Array.from({ length: 3 }, (_, i) => ({
      ...guild,
      id: BigInt(10 + i),
      entityKey: `crew_${i}`,
      name: `Crew ${i}`,
      type: 'character',
      body: filler(`Crew ${i}`, 3),
    }));
    const refs = [...baseRefs, ...extras.map(e => `entity:${e.entityKey}`), 'bible_doc:world/ledger', 'nocolon', 'unknown:thing'];
    const assembler = makeAssembler(chapterOneDb({ contextRefs: refs, extraEntities: extras }));
    const warn = spyOn((assembler as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger, 'warn').mockImplementation(() => undefined);

    const pack = await assembler.forChapter(1n, 1, { budgetTokens: 4_500 });
    const calls = [...warn.mock.calls];
    warn.mockRestore();

    const omittedKeys = pack.omitted.map(o => o.key);
    const routine = omittedKeys.filter(key => key.startsWith('ref:entity:crew_'));
    expect([wren, tobin, guild, ...extras].length).toBeGreaterThan(FULL_CAST_MAX);
    expect(routine).toEqual(['ref:entity:crew_2']);
    expect(calls).toHaveLength(1);
    const [message, payload] = calls[0] as [string, { unresolvedRefs: string[]; omitted: string[] }];
    expect(message).toBe('chapter pack dropped context');
    expect(payload.unresolvedRefs).toEqual(expect.arrayContaining(['volume:volume_missing', 'world_fact:harbor_customs/missing', 'nocolon', 'unknown:thing']));
    expect(payload.omitted).toContain('ref:bible_doc:world/ledger');
    for (const key of routine) expect(payload.omitted).not.toContain(key);
  });

  it('should not warn for a dry-run pack', async () => {
    const assembler = makeAssembler(chapterOneDb());
    const warn = spyOn((assembler as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger, 'warn').mockImplementation(() => undefined);

    await assembler.forChapter(1n, 1, { dryRun: true });
    const calls = [...warn.mock.calls];
    warn.mockRestore();

    expect(calls).toEqual([]);
  });

  const decisions = [
    {
      kind: 'decision',
      topic: 'protagonist',
      statement: 'Wren trusts ledgers over people.',
      writerLine: 'WRITER_LINE_MARKER Wren checks the numbers before she answers anyone.',
    },
    { kind: 'direction', topic: 'taste', statement: 'DIRECTION_MARKER keep it quiet', writerLine: null },
    { kind: 'system', topic: 'cast', statement: 'Tobin is thirty.', writerLine: 'Tobin jokes when the crew is scared.' },
  ].map(decision => ({ why: null, rejectedAlternatives: [], decidedBy: 'author', ...decision }));

  it('should carry the writer lines of active decisions directly ahead of the brief', async () => {
    const pack = await makeAssembler(chapterOneDb({ ledger: decisions })).forChapter(1n, 1, { dryRun: true });

    const section = pack.sections.find(s => s.key === 'writer_lines');
    expect(section?.rendered).toBe(
      '## AUTHOR DECISIONS FOR THE WRITER\n\n- WRITER_LINE_MARKER Wren checks the numbers before she answers anyone.\n- Tobin jokes when the crew is scared.',
    );
    expect(section?.segment).toBe('volatile');
    expect(pack.renderedVolatile.endsWith(section?.rendered ?? '')).toBe(true);
    expect(pack.rendered).not.toContain('DIRECTION_MARKER');
  });

  it('should keep the writer lines when the refs exceed the budget', async () => {
    const refs = [...baseRefs, 'bible_doc:world/ledger'];
    const pack = await makeAssembler(chapterOneDb({ contextRefs: refs, ledger: decisions })).forChapter(1n, 1, { dryRun: true, budgetTokens: 3_000 });

    expect(pack.omitted.map(o => o.key)).toContain('ref:bible_doc:world/ledger');
    expect(pack.sections.find(s => s.key === 'writer_lines')?.rendered).toContain('WRITER_LINE_MARKER');
  });

  it('should add no writer-lines section without a decision that carries one', async () => {
    const pack = await makeAssembler(chapterOneDb()).forChapter(1n, 1, { dryRun: true });

    expect(pack.sections.some(s => s.key === 'writer_lines')).toBe(false);
  });
});
