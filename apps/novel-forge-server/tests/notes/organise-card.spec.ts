import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { type NotesOrganiseOutput } from '@modules/ai/schemas/notes-organise.schema';
import {
  appliedOrganiseEntries,
  hasOrganiseUndo,
  LEGACY_ORGANISE_RECORD,
  mergeOrganiseOutputs,
  notesSource,
  organiseCandidates,
  organiseCardSelection,
  organiseOptions,
  type OrganiseOptions,
  organiseReceipt,
  type OrganiseRecord,
  organiseRecordFor,
  organiseSummary,
  planOrganise,
  recordOrganiseDecision,
  revertOrganiseDecision,
  wholeOrganiseSelection,
} from '@modules/notes';
import { type ChangeOp } from '@modules/refinement/change-set';
import { type Ledger, type PrimaryTransaction, type Refinement, schema } from '@server/database';

import { ledgerEntry } from '../ledger/ledger-fixtures';

const NOTES = [
  'Ilse carries sealed letters up from the salt mine. She never opens what she carries.',
  'The Lantern Guild owns every letter in the valley.',
  'Maybe the guild began with the first mine foreman.',
  'Her brother left for the coast years ago.',
  'Tide salt lets its user see through fog.',
].join('\n\n');
const brief = ledgerEntry({ id: 2n, topic: 'start.brief', statement: NOTES });
const dialect = new PgDialect();

const ILSE = { name: 'Ilse', type: 'character' as const, summary: 'Ilse carries sealed letters up from the salt mine.', source: 'notes' as const };
const GUILD = { name: 'The Lantern Guild', type: 'faction' as const, summary: 'The Lantern Guild owns every letter in the valley.', source: 'notes' as const };

function output(overrides: Partial<NotesOrganiseOutput> = {}): NotesOrganiseOutput {
  return {
    reading: 'A courier in a salt-mine town.',
    timeline: [{ band: 'opening', event: 'Ilse carries a sealed letter up from the mine', paragraphs: [1] }],
    pages: [
      {
        section: 'project',
        slug: 'cast',
        title: 'Cast',
        sections: [{ heading: 'Ilse', body: ILSE.summary, source: 'notes', quote: 'carries sealed letters up from the salt mine', paragraphs: [1] }],
      },
      {
        section: 'world',
        slug: 'the-lantern-guild',
        title: 'The Lantern Guild',
        sections: [
          { heading: 'What it owns', body: GUILD.summary, source: 'notes', quote: 'owns every letter in the valley', paragraphs: [2] },
          { heading: 'How it began', body: 'Older than the mine, by the look of its seals.', source: 'inferred', paragraphs: [3] },
        ],
      },
    ],
    records: [
      { ...ILSE, quote: 'carries sealed letters up from the salt mine', paragraphs: [1] },
      { ...GUILD, quote: 'owns every letter in the valley', paragraphs: [2] },
    ],
    rules: [
      { rule: 'Ilse never opens what she carries', quote: 'She never opens what she carries', paragraphs: [1] },
      { rule: 'Salt is sacred', quote: 'salt is sacred to everyone', paragraphs: [5] },
    ],
    questions: [{ question: 'How did the guild begin?', why: 'Chapter one names it.', paragraphs: [3] }],
    suggestions: [],
    coachMessage: 'The brother is the least placed.',
    ...overrides,
  };
}

interface Page {
  section: string;
  slug: string;
  body: string;
}

interface Entity {
  entityKey: string;
  type: string;
  name: string;
  body: string | null;
}

/** The Story Bible and the ledger one project holds, which staging reads and applying writes. */
interface World {
  pages: Map<string, Page>;
  entities: Map<string, Entity>;
  ledger: Ledger.Entry[];
  nextId: bigint;
  proposals: { id: bigint; kind: 'organise'; organiseRecord: unknown }[];
}

function world(): World {
  return { pages: new Map(), entities: new Map(), ledger: [brief], nextId: 100n, proposals: [] };
}

const active = (state: World) => state.ledger.filter(entry => entry.supersededAt === null);

function storedTx(state: World): PrimaryTransaction {
  return {
    select: (columns: Record<string, unknown>) => ({
      from: () => ({
        where: () => {
          const rows = 'entityKey' in columns ? [...state.entities.values()] : [...state.pages.values()];
          return Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) });
        },
      }),
    }),
  } as unknown as PrimaryTransaction;
}

/** Keeps the ledger rows the record and revert write in the world, reading which rows they meant from the statements' parameters. */
function ledgerExecutor(state: World, proposal: { organiseRecord: unknown }) {
  const params = (where: SQL) => dialect.sqlToQuery(where).params;
  return {
    query: { decisionLedgerEntries: { findMany: async () => active(state) } },
    select: () => ({ from: (table: unknown) => ({ where: async () => (table === schema.refinementProposals ? state.proposals : state.ledger) }) }),
    insert: () => ({
      values: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        const added = (Array.isArray(rows) ? rows : [rows]).map(row => ledgerEntry({ ...(row as Partial<Ledger.Entry>), id: state.nextId++ }));
        state.ledger.push(...added);
        return { returning: async () => added.map(entry => ({ id: entry.id })) };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (where: SQL) => {
          if (table === schema.refinementProposals) return void (proposal.organiseRecord = values['organiseRecord']);
          const [first, ...rest] = params(where);
          if (values['supersededAt'] === null) {
            for (const entry of state.ledger) if (rest.includes(entry.id)) Object.assign(entry, { supersededAt: null, withdrawnReason: null });
            return;
          }
          const entry = state.ledger.find(row => row.id === first && row.supersededAt === null);
          if (entry) Object.assign(entry, values);
        },
      }),
    }),
    delete: () => ({
      where: async (where: SQL) => {
        const ids = params(where).slice(1);
        state.ledger = state.ledger.filter(entry => !ids.includes(entry.id));
      },
    }),
  };
}

interface Staging {
  options: OrganiseOptions;
  applied: { ops: ChangeOp[]; record: OrganiseRecord };
  card: { ops: ChangeOp[]; record: OrganiseRecord };
}

async function stage(state: World, out: NotesOrganiseOutput = output(), mode: Refinement.ChatMode = 'auto'): Promise<Staging> {
  const ledger = active(state);
  const { options } = organiseOptions(out, ledger);
  const plan = await planOrganise(organiseCardSelection(options), { round: { round: 1, options }, ledger, projectId: 7n, tx: storedTx(state) });
  const candidates = organiseCandidates({ plan, options, source: notesSource(NOTES), current: new Map(), mode, passes: 1, ledger });
  const { direct, cards } = candidates.split;
  const receipt = organiseReceipt(candidates, direct, cards);
  return {
    options,
    applied: { ops: direct, record: organiseRecordFor(candidates, direct, 'applied', receipt) },
    card: { ops: cards, record: organiseRecordFor(candidates, cards, 'card', receipt) },
  };
}

function write(state: World, op: ChangeOp): void {
  if (op.op === 'bible_document.upsert') state.pages.set(`${op.section}/${op.slug}`, { section: op.section, slug: op.slug, body: op.body ?? '' });
  if (op.op === 'bible_document.remove') state.pages.delete(`${op.section}/${op.slug}`);
  if (op.op === 'entity.upsert' && op.name !== undefined) state.entities.set(op.entityKey, { entityKey: op.entityKey, type: op.type, name: op.name, body: op.body ?? null });
  if (op.op === 'entity.remove') state.entities.delete(op.entityKey);
}

/** Applies the selected ops as the apply engine would, then records the decision the proposal carries; returns the proposal row. */
async function apply(state: World, staged: { ops: ChangeOp[]; record: OrganiseRecord }, selected = staged.ops.map((_, index) => index)) {
  for (const index of selected) write(state, staged.ops[index] as ChangeOp);
  const proposal = { id: BigInt(state.proposals.length + 1), kind: 'organise' as const, organiseRecord: staged.record as unknown };
  await recordOrganiseDecision(ledgerExecutor(state, proposal) as never, 7n, proposal, selected);
  state.proposals.push(proposal);
  return proposal;
}

const refsOf = (ops: ChangeOp[]) => ops.map(op => ('entityKey' in op ? `entity:${op.entityKey}` : 'slug' in op ? `doc:${op.section}/${op.slug}` : op.op));
const pageBody = (state: World, address: string) => state.pages.get(address)?.body ?? '';

describe('organiseRound provenance', () => {
  it('should keep a quote only where the server finds it in the notes, stated rather than hedged', () => {
    const hedged = output({
      pages: [
        {
          section: 'world',
          slug: 'guild',
          title: 'Guild',
          sections: [
            { heading: 'Origin', body: 'The guild began with the first mine foreman.', source: 'notes', quote: 'the guild began with the first mine foreman', paragraphs: [3] },
          ],
        },
      ],
    });
    const round = organiseOptions(output(), [brief]).options;

    expect(round.records.map(record => record.quote)).toEqual(['carries sealed letters up from the salt mine', 'owns every letter in the valley']);
    expect(round.rules.map(rule => rule.quote)).toEqual(['She never opens what she carries', undefined]);
    expect(organiseOptions(hedged, [brief]).options.pages[0]?.sections[0]?.quote).toBeUndefined();
  });

  it('should list as unused every paragraph nothing backed by the notes draws on, an inferred section counting for nothing', () => {
    const round = organiseOptions(output(), [brief]).options;

    expect(round.paragraphs).toBe(5);
    expect(round.unusedParagraphs).toEqual([4, 5]);
  });

  it('should count a cited paragraph only when the entry shares its words, and always the one its quote sits in', () => {
    const cited = output({ records: [{ ...ILSE, summary: 'A courier.', quote: 'Tide salt lets its user see', paragraphs: [0, 2, 9] }] });

    expect(organiseOptions(cited, [brief]).options.records[0]?.paragraphs).toEqual([5]);
  });

  it('should make a record two passes both name one record, whatever type each gave it', () => {
    const first = output();
    const second = output({ records: [{ ...ILSE, type: 'concept', quote: undefined, paragraphs: [1] }] });

    const records = organiseOptions(mergeOrganiseOutputs([first, second]), [brief]).options.records;

    expect(records.filter(record => record.name === 'Ilse')).toEqual([expect.objectContaining({ type: 'character', quote: 'carries sealed letters up from the salt mine' })]);
  });
});

describe('organiseCandidates', () => {
  it('should apply at once what quotes the notes, with the quote on it, and leave the rest on the card', async () => {
    const staged = await stage(world());

    expect(refsOf(staged.applied.ops)).toEqual(['entity:ilse', 'entity:the_lantern_guild', 'doc:project/cast', 'doc:world/the-lantern-guild']);
    expect(staged.applied.ops[0]).toMatchObject({ quote: 'carries sealed letters up from the salt mine', rationale: 'From your notes (¶1).' });
    expect(staged.card.record.ops.map(op => [op.ref, op.label])).toEqual([
      ['doc:world/the-lantern-guild', 'suggested'],
      ['doc:project/timeline', 'planner_only'],
      ['doc:project/open-questions', 'planner_only'],
      [`rule:${staged.card.record.ops[3]?.ref.slice('rule:'.length)}`, 'rule'],
    ]);
  });

  it('should turn a quote-less entry into a card, taking the page that relies on it along', async () => {
    const quoteless = output({
      records: [
        { ...ILSE, paragraphs: [1] },
        { ...GUILD, quote: 'owns every letter in the valley', paragraphs: [2] },
      ],
    });
    const staged = await stage(world(), quoteless);

    expect(refsOf(staged.applied.ops)).not.toContain('entity:ilse');
    expect(staged.card.record.ops.filter(op => op.ref === 'entity:ilse' || op.ref === 'doc:project/cast').map(op => op.label)).toEqual(['suggested', 'suggested']);
    expect(staged.card.ops.find(op => op.op === 'entity.upsert' && op.entityKey === 'ilse')).toMatchObject({ rationale: 'Suggested — not in your notes.' });
    expect(staged.card.ops.find(op => op.op === 'entity.upsert' && op.entityKey === 'ilse')).not.toHaveProperty('quote');
  });

  it('should hold an entry to the words of the paragraphs it cites, not of the whole notes', async () => {
    const borrowed = output({
      records: [
        {
          ...ILSE,
          summary: 'Ilse carries sealed letters up from the salt mine; tide salt lets its user see through fog.',
          quote: 'carries sealed letters up from the salt mine',
          paragraphs: [1],
        },
        GUILD,
      ],
    });
    const staged = await stage(world(), borrowed);

    expect(staged.card.record.ops.find(op => op.ref === 'entity:ilse')).toMatchObject({ label: 'suggested', reason: 'novel_content' });
  });

  it('should offer a mixed page as its notes-backed half, applied, and the whole page on the card', async () => {
    const staged = await stage(world());
    const half = staged.applied.ops.find(op => op.op === 'bible_document.upsert' && op.slug === 'the-lantern-guild') as { body?: string };
    const whole = staged.card.ops.find(op => op.op === 'bible_document.upsert' && op.slug === 'the-lantern-guild') as { body?: string };

    expect(half.body).toContain('## What it owns');
    expect(half.body).not.toContain('How it began');
    expect(whole.body).toContain('## How it began');
  });

  it('should keep every op a card in a chat that lands nothing on its own', async () => {
    const staged = await stage(world(), output(), 'manual');

    expect(staged.applied.ops).toEqual([]);
    expect(staged.card.record.mixed).toEqual([{ page: 'world/the-lantern-guild', notesOnly: 3, whole: 4 }]);
  });

  it('should count a page offered in halves once, skip records it only touches, and name what the notes still hold unused', async () => {
    const staged = await stage(world());
    const receipt = staged.card.record.receipt;

    expect(receipt).toMatchObject({ notesDigest: staged.options.notesDigest, paragraphs: 5, unusedParagraphs: [4, 5], fromNotes: 4, suggested: 0, rules: 1 });
    expect(organiseSummary(receipt)).toBe('Your notes, organised: 4 from your notes, 0 suggested, 1 rule · not used yet: 2 paragraphs (¶4, ¶5)');
  });
});

describe('appliedOrganiseEntries', () => {
  it('should record what applies at once as the app’s, and the card’s rules only when the author keeps them', async () => {
    const staged = await stage(world());
    const rule = staged.card.record.ops.findIndex(op => op.label === 'rule');

    expect(appliedOrganiseEntries(staged.applied.record, [0, 1, 2, 3], [brief]).map(entry => [entry.topic, entry.decidedBy])).toEqual([['organise', 'system']]);
    expect(appliedOrganiseEntries(staged.card.record, [1], [brief]).map(entry => [entry.topic, entry.decidedBy])).toEqual([['organise', 'author']]);
    expect(appliedOrganiseEntries(staged.card.record, [1, rule], [brief]).map(entry => entry.topic)).toEqual(['organise', 'organise.rules']);
  });

  it('should adopt a suggestion only when the whole page carrying it is applied', async () => {
    const suggested = output({ suggestions: [{ page: 'world/the-lantern-guild', section: 'How it began', text: 'The first foreman founded it.', why: 'A face.' }] });
    const staged = await stage(world(), suggested);
    const whole = staged.card.record.ops.findIndex(op => op.ref === 'doc:world/the-lantern-guild');
    const adopted = (selected: number[]) => appliedOrganiseEntries(staged.card.record, selected, [brief]).filter(entry => entry.topic === 'organise.accepted');

    expect(adopted([1])).toEqual([]);
    expect(adopted([whole]).map(entry => entry.statement)).toEqual(['The first foreman founded it.']);
  });
});

describe('recordOrganiseDecision', () => {
  it('should refuse a card keeping both halves of one page', async () => {
    const staged = await stage(world(), output(), 'manual');

    await expect(apply(world(), staged.card, [3, 4])).rejects.toMatchObject({ code: 'NTS_007' });
  });

  it('should keep a card whole without its notes-backed halves, which the whole pages already hold', async () => {
    const staged = await stage(world(), output(), 'manual');
    const proposal = { id: 1n, kind: 'organise' as const, organiseRecord: staged.card.record, changeSet: staged.card.ops };

    expect(wholeOrganiseSelection(proposal)).toEqual(staged.card.ops.map((_, index) => index).filter(index => index !== 3));
    expect(wholeOrganiseSelection({ ...proposal, organiseRecord: LEGACY_ORGANISE_RECORD })).toBeUndefined();
  });

  it('should skip a legacy card and any other kind, and refuse a new card that lost its record', async () => {
    const state = world();
    const run = (proposal: { kind: Refinement.Kind; organiseRecord: unknown }) =>
      recordOrganiseDecision(ledgerExecutor(state, proposal) as never, 7n, { id: 1n, ...proposal }, [0]);

    await run({ kind: 'organise', organiseRecord: LEGACY_ORGANISE_RECORD });
    await run({ kind: 'hub', organiseRecord: null });
    expect(state.ledger).toEqual([brief]);
    await expect(run({ kind: 'organise', organiseRecord: null })).rejects.toMatchObject({ code: 'NTS_009' });
  });

  it('should let a second run rewrite in place what the first applied, writing no section twice', async () => {
    const state = world();
    const first = await stage(state);
    await apply(state, first.applied);
    await apply(state, first.card);

    const second = await stage(state);

    expect([...second.applied.ops, ...second.card.ops].filter(op => op.op === 'bible_document.upsert')).toEqual([]);
  });

  it('should keep the earlier claim on a rewrite the author declined, so the next run offers it again instead of freezing it', async () => {
    const state = world();
    const first = await stage(state, output({ records: [ILSE, GUILD] }));
    const halves = new Set(first.card.record.mixed.map(pair => pair.notesOnly));
    await apply(
      state,
      first.card,
      first.card.ops.map((_, index) => index).filter(index => !halves.has(index)),
    );
    const reworded = output({
      records: [ILSE, GUILD],
      pages: [
        output().pages[0]!,
        { ...output().pages[1]!, sections: [{ heading: 'What it owns', body: 'Every letter in the valley is the guild’s.', source: 'inferred', paragraphs: [2] }] },
      ],
    });

    const second = await stage(state, reworded);
    const declined = second.card.record.ops.findIndex(op => op.ref === 'doc:world/the-lantern-guild');
    await apply(
      state,
      second.card,
      second.card.ops.map((_, index) => index).filter(index => index !== declined),
    );
    const third = await stage(state, reworded);

    const offered = third.card.ops.find(op => op.op === 'bible_document.upsert' && op.slug === 'the-lantern-guild') as { body?: string } | undefined;
    expect(offered?.body).toContain('Every letter in the valley is the guild’s.');
    expect(offered?.body).not.toContain('— from your notes');
    expect(pageBody(state, 'world/the-lantern-guild')).not.toContain('— from your notes');
  });

  it('should keep the earlier claim on a removal the author declined, so the next run offers it again', async () => {
    const state = world();
    const first = await stage(state);
    await apply(state, first.applied);
    await apply(state, first.card);
    const without = output({ pages: [output().pages[0]!], records: [{ ...ILSE, quote: 'carries sealed letters up from the salt mine', paragraphs: [1] }] });

    const second = await stage(state, without);
    const removal = second.card.record.ops.findIndex(op => op.ref === 'doc:world/the-lantern-guild' && op.label === 'retired');
    expect(removal).toBeGreaterThanOrEqual(0);
    await apply(state, second.applied);
    await apply(
      state,
      second.card,
      second.card.ops.map((_, index) => index).filter(index => index !== removal),
    );
    const third = await stage(state, without);

    expect(third.card.record.ops.filter(op => op.ref === 'doc:world/the-lantern-guild').map(op => op.label)).toEqual(['retired']);
    expect(pageBody(state, 'world/the-lantern-guild')).not.toContain('— from your notes');
  });
});

describe('card retirements', () => {
  const twoRules = output({
    rules: [
      { rule: 'Ilse never opens what she carries', quote: 'She never opens what she carries', paragraphs: [1] },
      { rule: 'The guild owns every letter', quote: 'owns every letter in the valley', paragraphs: [2] },
    ],
  });

  it('should retire only a rule this round offered again and the author declined, and say so on the card', async () => {
    const state = world();
    const first = await stage(state, twoRules);
    await apply(state, first.applied);
    await apply(state, first.card);
    const kept = active(state).filter(entry => entry.topic === 'organise.rules');
    expect(kept.map(entry => entry.statement)).toEqual(['Ilse never opens what she carries', 'The guild owns every letter']);

    const second = await stage(state, output());
    const offered = second.card.record.ops.findIndex(op => op.label === 'rule');
    expect(second.card.record.ops[offered]?.retires).toEqual([String(kept[0]?.id)]);
    expect(second.card.record.receipt.card.find(entry => entry.label === 'rule')?.retires).toEqual([String(kept[0]?.id)]);
    expect(second.card.ops[offered]?.rationale).toContain('declining it takes it out');
    await apply(state, second.applied);
    await apply(
      state,
      second.card,
      second.card.ops.map((_, index) => index).filter(index => index !== offered),
    );

    expect(
      active(state)
        .filter(entry => entry.topic === 'organise.rules')
        .map(entry => entry.statement),
    ).toEqual(['The guild owns every letter']);
  });

  it('should leave a kept rule as it is when the author keeps it again', async () => {
    const state = world();
    const first = await stage(state);
    await apply(state, first.applied);
    await apply(state, first.card);
    const rule = active(state).find(entry => entry.topic === 'organise.rules');

    const second = await stage(state);
    await apply(state, second.applied);
    await apply(state, second.card);

    expect(
      active(state)
        .filter(entry => entry.topic === 'organise.rules')
        .map(entry => entry.id),
    ).toEqual([rule?.id]);
  });
});

describe('revertOrganiseDecision', () => {
  it('should put the ledger back as the apply found it, so a run after the undo writes nothing twice', async () => {
    const state = world();
    const first = await stage(state);
    await apply(state, first.applied);
    const before = structuredClone(active(state));
    const pagesBefore = new Map(state.pages);
    const entitiesBefore = new Map(state.entities);
    const card = await apply(state, first.card);
    expect(active(state).some(entry => entry.topic === 'organise.rules')).toBe(true);

    await revertOrganiseDecision(ledgerExecutor(state, card) as never, 7n, card);
    state.pages = pagesBefore;
    state.entities = entitiesBefore;

    expect(active(state).map(entry => [entry.id, entry.topic])).toEqual(before.map(entry => [entry.id, entry.topic]));
    const again = await stage(state);
    expect(JSON.stringify([...again.applied.ops, ...again.card.ops])).not.toContain('— from your notes');
  });

  it('should refuse to undo an answer a later organise change has since replaced, naming that change', async () => {
    const state = world();
    const first = await stage(state);
    const applied = await apply(state, first.applied);
    await apply(state, first.card);

    await expect(revertOrganiseDecision(ledgerExecutor(state, applied) as never, 7n, applied)).rejects.toMatchObject({ code: 'NTS_010', data: { proposalId: '2' } });
  });

  it('should still undo after the author withdrew a kept rule in the Notebook, leaving that withdrawal as it is', async () => {
    const state = world();
    const first = await stage(state);
    await apply(state, first.applied);
    const decisionBefore = active(state).find(entry => entry.topic === 'organise');
    const card = await apply(state, first.card);
    const rule = active(state).find(entry => entry.topic === 'organise.rules') as Ledger.Entry;
    Object.assign(rule, { supersededAt: new Date(2), withdrawnReason: 'not any more' });

    await revertOrganiseDecision(ledgerExecutor(state, card) as never, 7n, card);

    expect(state.ledger).toContainEqual(expect.objectContaining({ id: rule.id, withdrawnReason: 'not any more' }));
    expect(active(state).find(entry => entry.topic === 'organise')?.id).toBe(decisionBefore?.id);
  });

  it('should undo a card that kept only a rule, which changed no page', async () => {
    const state = world();
    const first = await stage(state);
    await apply(state, first.applied);
    const rule = first.card.record.ops.findIndex(op => op.label === 'rule');
    const card = await apply(state, first.card, [rule]);

    expect(hasOrganiseUndo(card)).toBe(true);
    await revertOrganiseDecision(ledgerExecutor(state, card) as never, 7n, card);

    expect(active(state).some(entry => entry.topic === 'organise.rules')).toBe(false);
    expect(hasOrganiseUndo({ id: 9n, kind: 'organise', organiseRecord: LEGACY_ORGANISE_RECORD })).toBe(false);
  });
});
