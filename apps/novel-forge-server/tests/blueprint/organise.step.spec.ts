import { describe, expect, it } from 'bun:test';
import { textDigest } from '@shadow-library/sdk';

import { blueprintOrganisePrompt } from '@modules/ai/prompts/blueprint-organise.prompt';
import { type BlueprintOrganiseOutput, BlueprintOrganiseSchema, organiseOutputIssues } from '@modules/ai/schemas/blueprint-organise.schema';
import { parseSchema } from '@modules/ai/schemas/validate';
import { BLUEPRINT_CHANGE_OPS } from '@modules/blueprint/engine/blueprint-step.service';
import { type LockPlan, type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { organisedTimelineInput } from '@modules/blueprint/steps/organised-timeline';
import { BLUEPRINT_STEPS } from '@modules/blueprint/steps/blueprint-steps';
import { type OrganiseSelection, organiseStep } from '@modules/blueprint/steps/organise.step';
import { type OrganiseOptions } from '@modules/blueprint/steps/organise-round';
import { premiseStep } from '@modules/blueprint/steps/premise.step';
import { type ContentOp, validateChangeSet } from '@modules/refinement/change-set';
import { type Ledger, type PrimaryTransaction } from '@server/database';

import { ledgerEntry } from './blueprint-fixtures';

const NOTES = Array.from({ length: 620 }, (_, index) => (index % 12 === 0 ? 'Ilse carries sealed letters up from the salt mine.' : 'word')).join(' ');
const brief = ledgerEntry({ id: 2n, kind: 'direction', topic: 'start.brief', statement: NOTES, payload: null });

function output(overrides: Partial<BlueprintOrganiseOutput> = {}): BlueprintOrganiseOutput {
  return {
    reading: 'A courier in a salt-mine town learns who owns the letters she carries.',
    timeline: [
      { band: 'opening', event: 'Ilse carries a sealed letter up from the mine' },
      { band: 'later', event: 'The Lantern Guild turns out to own the mine' },
      { band: 'ending', event: 'Ilse burns the guild ledger' },
      { band: 'unplaced', event: 'Ilse meets her brother again' },
    ],
    pages: [
      { section: 'project', slug: 'cast', title: 'Cast', sections: [{ heading: 'Ilse', body: 'A courier who never opens what she carries.', source: 'notes' }] },
      {
        section: 'world',
        slug: 'The Lantern Guild',
        title: 'The Lantern Guild',
        sections: [
          { heading: 'What it wants', body: 'Every letter in the valley passes through its hands.', source: 'notes' },
          { heading: 'How it began', body: 'Older than the mine, by the look of its seals.', source: 'inferred' },
        ],
      },
      { section: 'power', slug: 'tide-salt', title: 'Tide salt', sections: [{ heading: 'The cost', body: 'Every use costs a memory.', source: 'notes' }] },
    ],
    records: [
      { name: 'Ilse', type: 'character', summary: 'A courier who never opens what she carries.', source: 'notes' },
      { name: 'The Lantern Guild', type: 'faction', summary: 'Every letter in the valley passes through its hands.', source: 'notes' },
      { name: 'Tide salt', type: 'power_rule', summary: 'Every use costs a memory.', source: 'notes' },
    ],
    rules: [{ rule: 'Ilse never opens a letter she carries' }],
    questions: [{ question: 'Who sent the first letter?', why: 'Chapter one opens on it.' }],
    suggestions: [
      { page: 'world/the-lantern-guild', section: 'How it began', text: 'The guild was founded by the first mine foreman.', why: 'Gives the guild a face in chapter one.' },
      { page: 'world/nowhere', section: 'Anything', text: 'A page the round never wrote.', why: 'It has nowhere to go.' },
    ],
    coachMessage: 'Your notes are clear on the opening; the brother is the least placed.',
    ...overrides,
  };
}

function options(ledger: Ledger.Entry[] = [brief], out: BlueprintOrganiseOutput = output()): OrganiseOptions {
  return organiseStep.toRound(out, { previous: null, input: null, focus: null, ledger }).options;
}

function selection(overrides: Partial<OrganiseSelection> = {}): OrganiseSelection {
  return {
    sections: ['p1s1', 'p2s1', 'p3s1'],
    records: ['e1', 'e2', 'e3'],
    timeline: [
      { optionId: 't1', band: 'opening' },
      { optionId: 't2', band: 'later' },
      { optionId: 't3', band: 'ending' },
      { optionId: 't4', band: 'unplaced' },
    ],
    rules: ['r1'],
    questions: ['q1'],
    suggestions: [],
    ...overrides,
  };
}

interface Stored {
  pages?: { section: string; slug: string; body: string }[];
  entities?: { entityKey: string; type: string; name?: string; body?: string | null }[];
}

/** Answers the three reads a lock makes — pages, the records it names, and the records of a kind — from what the test says is stored. */
function storedTx(stored: Stored = {}): PrimaryTransaction {
  return {
    select: (columns: Record<string, unknown>) => ({
      from: () => ({
        where: () => {
          const rows = 'entityKey' in columns ? (stored.entities ?? []) : (stored.pages ?? []);
          return Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) });
        },
      }),
    }),
  } as unknown as PrimaryTransaction;
}

function materialise(chosen: OrganiseSelection, ledger: Ledger.Entry[] = [brief], stored: Stored = {}, offered: OrganiseOptions = options(ledger)): Promise<LockPlan> {
  const context = { round: { round: 1, options: offered, input: null }, ledger, project: { id: 7n }, tx: storedTx(stored) } as unknown as MaterialiseContext<OrganiseOptions>;
  return organiseStep.materialise(chosen, context);
}

const upserted = (plan: LockPlan, address: string): string | undefined =>
  (plan.changeSet?.find(op => op.op === 'bible_document.upsert' && `${op.section}/${op.slug}` === address) as { body?: string } | undefined)?.body;

/** The lock as the ledger will hold it once written, so a second lock can be tested against the first one's own record. */
function lockedAs(plan: LockPlan): Ledger.Entry[] {
  return plan.entries.map((entry, index) =>
    ledgerEntry({ ...entry, id: 50n + BigInt(index), phase: 'idea', stepKey: 'organise', payload: entry.payload ?? null, links: entry.links ?? {} } as Partial<Ledger.Entry>),
  );
}

function storedPages(plan: LockPlan): Stored['pages'] {
  return (plan.changeSet ?? []).flatMap(op => (op.op === 'bible_document.upsert' ? [{ section: op.section, slug: op.slug, body: op.body ?? '' }] : []));
}

/** The records as a lock left them, so the next lock reads back exactly what the last one wrote. */
function storedRecords(plan: LockPlan): NonNullable<Stored['entities']> {
  return (plan.changeSet ?? []).flatMap(op => (op.op === 'entity.upsert' && op.name ? [{ entityKey: op.entityKey, type: op.type, name: op.name, body: op.body ?? null }] : []));
}

describe('blueprintOrganisePrompt', () => {
  it('should keep everything the notes place later on the timeline, and anything undecided an open question', () => {
    expect(blueprintOrganisePrompt.version).toBe('1.2.0');
    expect(blueprintOrganisePrompt.system).toContain('goes ONLY on the timeline, in its band');
    expect(blueprintOrganisePrompt.system).toContain('A secret is never a rule.');
    expect(blueprintOrganisePrompt.system).toContain('is an open question, never a statement on a page, in a record or in a rule');
    expect(blueprintOrganisePrompt.system).toContain('name what you left out in the coach message');
  });

  it('should ask for a repair when the pages hold more sections than the pass may write', () => {
    const page = (index: number) => ({
      section: 'world' as const,
      slug: `page-${index}`,
      title: `Page ${index}`,
      sections: Array.from({ length: 6 }, (_, at) => ({ heading: `H${at}`, body: 'x', source: 'notes' as const })),
    });
    expect(organiseOutputIssues(output({ pages: Array.from({ length: 9 }, (_, index) => page(index)) }))).toEqual([
      'the pages hold 54 sections; keep to 50 in all, keeping what the first chapters need',
    ]);
  });

  it('should be an analytical prompt on the planning pass role that keeps suggestions apart from canon', () => {
    expect(blueprintOrganisePrompt.kind).toBe('analytical');
    expect(blueprintOrganisePrompt.role).toBe('blueprint_pass');
    expect(blueprintOrganisePrompt.system).toContain('Anything you would add is a suggestion, never part of a page, a record or a rule');
    expect(blueprintOrganisePrompt.system).toContain('never move later material into the opening');
  });

  it('should accept a well-formed answer, refuse an unknown band, and ask for a repair when nothing was organised', () => {
    expect(parseSchema(BlueprintOrganiseSchema, output()).success).toBe(true);
    expect(parseSchema(BlueprintOrganiseSchema, output({ timeline: [{ band: 'middle' as never, event: 'x' }] })).success).toBe(false);
    expect(organiseOutputIssues(output())).toEqual([]);
    expect(organiseOutputIssues(output({ pages: [], timeline: [] }))).toHaveLength(1);
  });
});

describe('organiseStep.appliesWhen', () => {
  it('should apply only once the author’s own notes run to six hundred words', () => {
    const words = (count: number) => [ledgerEntry({ topic: 'start.brief', statement: Array.from({ length: count }, () => 'tide').join(' ') })];

    expect(organiseStep.appliesWhen?.(words(599))).toBe(false);
    expect(organiseStep.appliesWhen?.(words(600))).toBe(true);
    expect(organiseStep.appliesWhen?.([])).toBe(false);
  });

  it('should stay reachable once organised, however short the notes have become since', () => {
    const short = ledgerEntry({ topic: 'start.brief', statement: 'A courier and a letter.' });
    const organised = ledgerEntry({ id: 9n, kind: 'decision', topic: 'organise', stepKey: 'organise' });

    expect(organiseStep.appliesWhen?.([short])).toBe(false);
    expect(organiseStep.appliesWhen?.([short, organised])).toBe(true);
  });

  it('should be registered right after the starting point', () => {
    expect(BLUEPRINT_STEPS.map(step => step.key).slice(0, 3)).toEqual(['start', 'organise', 'taste']);
  });
});

describe('organiseStep.toRound', () => {
  it('should number every part, normalise addresses and fingerprint the notes it read', () => {
    const offered = options();

    expect(offered.notesDigest).toBe(textDigest(NOTES));
    expect(offered.pages.map(page => [page.id, page.section, page.slug, page.needs])).toEqual([
      ['p1', 'project', 'cast', ['character']],
      ['p2', 'world', 'the-lantern-guild', ['location', 'concept', 'faction']],
      ['p3', 'power', 'tide-salt', ['power_rule', 'concept']],
    ]);
    expect(offered.pages[1]?.sections.map(section => [section.id, section.source])).toEqual([
      ['p2s1', 'notes'],
      ['p2s2', 'inferred'],
    ]);
    expect(offered.timeline.map(event => event.id)).toEqual(['t1', 't2', 't3', 't4']);
    expect(offered.suggestions).toEqual([
      { id: 's1', pageId: 'p2', section: 'How it began', text: 'The guild was founded by the first mine foreman.', why: 'Gives the guild a face in chapter one.' },
    ]);
  });

  it('should keep the pages the app writes itself out of the model’s hands, and merge two pages at one address', () => {
    const offered = options(
      [brief],
      output({
        pages: [
          { section: 'project', slug: 'premise', title: 'Premise', sections: [{ heading: 'Hook', body: 'A courier who cannot read.', source: 'notes' }] },
          { section: 'world', slug: 'valley', title: 'The valley', sections: [{ heading: 'Weather', body: 'Fog every morning.\n## Seasons\nTwo.', source: 'notes' }] },
          { section: 'world', slug: 'valley', title: 'Valley', sections: [{ heading: 'weather', body: 'Rain after dusk.', source: 'notes' }] },
        ],
      }),
    );

    expect(offered.pages.map(page => `${page.section}/${page.slug}`)).toEqual(['project/premise-notes', 'world/valley']);
    expect(offered.pages[1]?.sections).toEqual([{ id: 'p2s1', heading: 'Weather', body: 'Fog every morning.\n### Seasons\nTwo.\n\nRain after dusk.', source: 'notes' }]);
  });

  it('should move a page no record could back to a prose section, so the lock can always write it', () => {
    const offered = options([brief], output({ records: [{ name: 'Ilse', type: 'character', summary: 'A courier.', source: 'notes' }] }));

    expect(offered.pages.map(page => `${page.section}/${page.slug}`)).toEqual(['project/cast', 'lore/the-lantern-guild', 'lore/tide-salt']);
    expect(offered.pages[1]?.needs).toEqual([]);
    expect(offered.suggestions.map(suggestion => suggestion.pageId)).toEqual(['p2']);
  });

  it('should fold a character’s own page into the cast page, where the character’s record backs it', () => {
    const offered = options(
      [brief],
      output({
        pages: [
          { section: 'project', slug: 'ilse', title: 'Ilse', sections: [{ heading: 'Background', body: 'A courier.', source: 'notes' }] },
          { section: 'project', slug: 'cast', title: 'Cast', sections: [{ heading: 'Everyone else', body: 'Miners.', source: 'notes' }] },
        ],
      }),
    );

    expect(offered.pages.map(page => [page.section, page.slug, page.title, page.needs])).toEqual([['project', 'cast', 'Cast', ['character']]]);
    expect(offered.pages[0]?.sections.map(section => section.heading)).toEqual(['Ilse — Background', 'Everyone else']);
  });

  it('should never offer again a suggestion the author already turned down', () => {
    const ruledOut = ledgerEntry({ id: 3n, kind: 'rejected', topic: 'organise.ruled_out', statement: 'the guild was founded by the first mine foreman.', stepKey: 'organise' });
    expect(options([brief, ruledOut]).suggestions).toEqual([]);
  });

  it('should fail the round when nothing was organised', () => {
    expect(() => options([brief], output({ pages: [], timeline: [] }))).toThrow();
  });
});

describe('organiseStep.materialise', () => {
  it('should write the kept pages, records, timeline and open questions, and the rules as directions — never a fact or a backlog entry', async () => {
    const plan = await materialise(selection());

    expect(validateChangeSet(structuredClone(plan.changeSet), BLUEPRINT_CHANGE_OPS, { blueprintLock: true })).toEqual([]);
    expect(plan.changeSet?.some(op => op.op.startsWith('fact.'))).toBe(false);
    expect(plan.changeSet).toContainEqual({ op: 'entity.upsert', entityKey: 'ilse', type: 'character', name: 'Ilse', body: 'A courier who never opens what she carries.' });
    expect(plan.changeSet).toContainEqual(expect.objectContaining({ op: 'entity.upsert', entityKey: 'the_lantern_guild', type: 'faction' }));
    expect(upserted(plan, 'project/cast')).toBe('# Cast\n\n## Ilse\n\nA courier who never opens what she carries.');
    expect(upserted(plan, 'world/the-lantern-guild')).not.toContain('How it began');
    expect(upserted(plan, 'project/timeline')).toContain('## The opening\n\n- Ilse carries a sealed letter up from the mine');
    expect(upserted(plan, 'project/timeline')).toContain('## Not yet placed\n\n- Ilse meets her brother again');
    expect(upserted(plan, 'project/open-questions')).toContain('1. **Who sent the first letter?** Chapter one opens on it.');

    expect(plan.entries.map(entry => [entry.kind, entry.topic])).toEqual([
      ['decision', 'organise'],
      ['direction', 'organise.rules'],
    ]);
    expect(plan.entries[0]?.links?.entityKeys).toEqual(['ilse', 'the_lantern_guild', 'tide_salt']);
    expect(plan.entries[0]?.links?.bibleDocuments).toContainEqual({ section: 'project', slug: 'timeline' });
    expect(plan.entries[0]?.statement).toBe("The author's notes are organised into 3 Story Bible pages, 3 records, a timeline of 4 events and 1 open question.");
    expect(plan.replaces).toEqual(['organise', 'organise.rules', 'organise.accepted']);
    expect(plan.entries[0]?.payload).toMatchObject({
      notesDigest: textDigest(NOTES),
      round: 1,
      records: [{ entityKey: 'ilse', name: 'Ilse' }, { entityKey: 'the_lantern_guild' }, { entityKey: 'tide_salt' }],
      answers: {
        sections: { [textDigest('world/the-lantern-guild|how it began')]: false, [textDigest('project/cast|ilse')]: true },
        events: { [textDigest('ilse meets her brother again')]: { kept: true, band: 'unplaced' } },
      },
    });
    expect(plan.entries[1]?.payload).toEqual({ optionId: `rule_${textDigest('ilse never opens a letter she carries')}` });
  });

  it('should keep an event where the author moved it', async () => {
    const plan = await materialise(selection({ timeline: [{ optionId: 't4', band: 'early' }] }));
    expect(upserted(plan, 'project/timeline')).toContain('## Early on\n\n- Ilse meets her brother again');
    expect(upserted(plan, 'project/timeline')).not.toContain('## Not yet placed');
  });

  it('should write an accepted suggestion into its section and record it, keep a rejected one as a standing refusal, and leave an undecided one out', async () => {
    const accepted = await materialise(selection({ sections: ['p1s1', 'p2s1', 'p2s2', 'p3s1'], suggestions: [{ optionId: 's1', verdict: 'accept' }] }));

    expect(upserted(accepted, 'world/the-lantern-guild')).toContain(
      '## How it began\n\nOlder than the mine, by the look of its seals.\n\nThe guild was founded by the first mine foreman.',
    );
    expect(accepted.entries).toContainEqual(
      expect.objectContaining({
        kind: 'direction',
        topic: 'organise.accepted',
        statement: 'The guild was founded by the first mine foreman.',
        payload: { optionId: `suggestion_${textDigest('the guild was founded by the first mine foreman.')}`, page: 'world/the-lantern-guild', section: 'How it began' },
      }),
    );

    const rejected = await materialise(selection({ suggestions: [{ optionId: 's1', verdict: 'reject', reason: ' Too tidy ' }] }));
    expect(rejected.entries).toContainEqual(
      expect.objectContaining({ kind: 'rejected', topic: 'organise.ruled_out', statement: 'The guild was founded by the first mine foreman.', why: 'Too tidy' }),
    );
    expect(upserted(rejected, 'world/the-lantern-guild')).not.toContain('foreman');

    const undecided = await materialise(selection());
    expect(undecided.entries.some(entry => entry.topic === 'organise.accepted' || entry.topic === 'organise.ruled_out')).toBe(false);
  });

  it('should take back its own refusal when the author accepts the suggestion after all', async () => {
    const refusal = ledgerEntry({ id: 40n, kind: 'rejected', topic: 'organise.ruled_out', statement: 'The guild was founded by the first mine foreman.', stepKey: 'organise' });
    const plan = await materialise(selection({ suggestions: [{ optionId: 's1', verdict: 'accept' }] }), [brief, refusal], {}, options([brief]));

    expect(plan.withdraws).toEqual([40n]);
  });

  it('should refuse an accepted suggestion whose page the author left out, a record-bearing page with no record kept, and an empty answer', async () => {
    await expect(materialise(selection({ sections: ['p1s1'], suggestions: [{ optionId: 's1', verdict: 'accept' }] }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection({ records: ['e1', 'e3'] }))).rejects.toThrow('“The Lantern Guild” needs at least one record kept that is a place, an idea or a faction');
    await expect(materialise({ sections: [], records: [], timeline: [], rules: [], questions: [], suggestions: [] })).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection({ records: ['e9'] }))).rejects.toMatchObject({ code: 'BPR_005' });
  });

  it('should write beside a section another step owns rather than over it', async () => {
    const pages = [{ section: 'project', slug: 'cast', body: '# Cast\n\n## Ilse\n\nThe protagonist step wrote this.' }];
    const plan = await materialise(selection(), [brief], { pages });

    expect(upserted(plan, 'project/cast')).toBe(
      '# Cast\n\n## Ilse\n\nThe protagonist step wrote this.\n\n## Ilse — from your notes\n\nA courier who never opens what she carries.',
    );
  });

  it('should re-lock without touching what it no longer owns, and remove only what it made and dropped', async () => {
    const first = await materialise(selection());
    const ledger = [brief, ...lockedAs(first), ledgerEntry({ id: 90n, kind: 'decision', topic: 'protagonist', stepKey: 'protagonist', links: { entityKeys: ['ilse'] } })];
    const castPage = '# Cast\n\n## Ilse\n\nRewritten by the protagonist step.';
    const pages = (storedPages(first) ?? []).map(page => (page.slug === 'cast' ? { ...page, body: castPage } : page));
    const entities = storedRecords(first);

    const plan = await materialise(selection({ sections: ['p1s1', 'p2s1'], records: ['e1', 'e2'] }), ledger, { pages, entities });

    expect(plan.changeSet).toContainEqual({ op: 'entity.upsert', entityKey: 'ilse', type: 'character' });
    expect(plan.changeSet).toContainEqual({ op: 'entity.remove', entityKey: 'tide_salt' });
    expect(plan.changeSet?.some(op => op.op === 'entity.remove' && op.entityKey === 'ilse')).toBe(false);
    expect(plan.changeSet).toContainEqual({ op: 'bible_document.remove', section: 'power', slug: 'tide-salt' });
    expect(upserted(plan, 'project/cast')).toBeUndefined();
    expect(plan.entries[0]?.links?.entityKeys).toEqual(['the_lantern_guild']);
  });

  it('should keep leaving alone a section the author rewrote, lock after lock, rather than writing the notes beside it', async () => {
    const first = await materialise(selection());
    const edited = (storedPages(first) ?? []).map(page => (page.slug === 'cast' ? { ...page, body: '# Cast\n\n## Ilse\n\nThe author’s own words now.' } : page));
    const entities = storedRecords(first);

    const second = await materialise(selection(), [brief, ...lockedAs(first)], { pages: edited, entities });
    const third = await materialise(selection(), [brief, ...lockedAs(second)], { pages: edited, entities });

    expect(upserted(second, 'project/cast')).toBeUndefined();
    expect(upserted(third, 'project/cast')).toBeUndefined();
    expect(third.changeSet?.some(op => op.op === 'bible_document.remove' && op.slug === 'cast')).toBe(false);
  });

  it('should never let a heading inside suggested text split the section it joins', async () => {
    const sneaky = output({
      suggestions: [{ page: 'world/the-lantern-guild', section: 'What it wants', text: 'Ledgers.\n## The secret\nThe guild is the mine.', why: 'x' }],
    });
    const plan = await materialise(selection({ suggestions: [{ optionId: 's1', verdict: 'accept' }] }), [brief], {}, options([brief], sneaky));
    const body = upserted(plan, 'world/the-lantern-guild') ?? '';

    expect(body).toContain('Every letter in the valley passes through its hands.\n\nLedgers.\n### The secret\nThe guild is the mine.');
    expect(body).not.toMatch(/^## The secret/m);
  });

  it('should never rewrite or remove a record the author has edited since it was organised', async () => {
    const first = await materialise(selection());
    const entities = storedRecords(first).map(record => (record.entityKey === 'the_lantern_guild' ? { ...record, body: 'The author’s own words.' } : record));
    const ledger = [brief, ...lockedAs(first)];

    const kept = await materialise(selection(), ledger, { pages: storedPages(first), entities });
    expect(kept.changeSet).toContainEqual({ op: 'entity.upsert', entityKey: 'the_lantern_guild', type: 'faction' });
    expect(kept.entries[0]?.links?.entityKeys).toEqual(['ilse', 'tide_salt']);

    const dropped = await materialise(selection({ sections: ['p1s1', 'p3s1'], records: ['e1', 'e3'] }), ledger, { pages: storedPages(first), entities });
    expect(dropped.changeSet?.some(op => op.op === 'entity.remove' && op.entityKey === 'the_lantern_guild')).toBe(false);
  });

  it('should remember a section the author changed on a page it has dropped, and never write the notes beside it later', async () => {
    const first = await materialise(selection());
    const edited = (storedPages(first) ?? []).map(page => (page.slug === 'cast' ? { ...page, body: '# Cast\n\n## Ilse\n\nThe author’s own words now.' } : page));
    const entities = storedRecords(first);

    const dropped = await materialise(selection({ sections: ['p2s1', 'p3s1'], records: ['e2', 'e3'] }), [brief, ...lockedAs(first)], { pages: edited, entities });
    expect(dropped.changeSet?.some(op => op.op.startsWith('bible_document') && 'slug' in op && op.slug === 'cast')).toBe(false);
    const remembered = (dropped.entries[0]?.payload as { pages: { slug: string; sections: { heading: string }[] }[] }).pages.find(page => page.slug === 'cast');
    expect(remembered?.sections.map(section => section.heading)).toEqual(['Ilse']);

    const back = await materialise(selection(), [brief, ...lockedAs(dropped)], { pages: edited, entities });
    expect(upserted(back, 'project/cast')).toBeUndefined();
  });

  it('should answer each rule by what it says, and retire the rules an earlier lock wrote', async () => {
    const first = await materialise(selection());
    const ledger = [brief, ...lockedAs(first)];
    const plan = await materialise(selection({ rules: [] }), ledger);

    expect(plan.retires).toEqual([`rule_${textDigest('ilse never opens a letter she carries')}`]);
    expect(plan.entries.some(entry => entry.topic === 'organise.rules')).toBe(false);
  });

  it('should refuse to lock with no round to lock from', async () => {
    const context = { round: null, ledger: [brief], project: { id: 7n }, tx: storedTx() } as unknown as MaterialiseContext<OrganiseOptions>;
    await expect(organiseStep.materialise(selection(), context)).rejects.toMatchObject({ code: 'BPR_004' });
  });
});

describe('organisedTimelineInput', () => {
  const timeline = '# Timeline\n\n## The opening\n\n- Ilse carries a sealed letter';
  const organised = ledgerEntry({ id: 5n, kind: 'decision', topic: 'organise', stepKey: 'organise', links: { bibleDocuments: [{ section: 'project', slug: 'timeline' }] } });

  it('should give the steps that read the author’s words the timeline they organised, and nothing before they have', async () => {
    const tx = storedTx({ pages: [{ section: 'project', slug: 'timeline', body: timeline }] });
    const [section] = await organisedTimelineInput({ ledger: [organised], db: tx, projectId: 7n });

    expect(section).toMatchObject({ key: 'organised_timeline', required: true });
    expect(section?.content).toContain('never in the opening');
    expect(section?.content).toContain('- Ilse carries a sealed letter');
    expect(await organisedTimelineInput({ ledger: [], db: {} as never, projectId: 7n })).toEqual([]);
  });

  it('should let the timeline win over the starting point’s later items only while it was organised from the notes as they stand', async () => {
    const tx = storedTx({ pages: [{ section: 'project', slug: 'timeline', body: timeline }] });
    const current = { ...organised, payload: { notesDigest: textDigest(NOTES) } };

    const [fresh] = await organisedTimelineInput({ ledger: [brief, current], db: tx, projectId: 7n });
    expect(fresh?.content).toContain('this timeline wins');

    const rewritten = { ...brief, statement: `${NOTES} A lighthouse too.` };
    const [stale] = await organisedTimelineInput({ ledger: [rewritten, current], db: tx, projectId: 7n });
    expect(stale?.content).toContain('organised from an earlier version of their notes');
    expect(stale?.content).toContain('those win');
  });

  it('should reach the premise beside the author’s own words', async () => {
    const tx = storedTx({ pages: [{ section: 'project', slug: 'timeline', body: timeline }] });
    const sections = await premiseStep.inputs?.({ ledger: [brief, organised], db: tx, projectId: 7n } as never);

    expect(sections?.map(section => section.key)).toEqual(['author_brief', 'organised_timeline']);
  });
});

describe('organiseStep options', () => {
  it('should describe every part the author can keep, under one id each', () => {
    const offered = options();
    const ids = organiseStep.describeOptions(offered).map(option => option.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['p1s1', 'p2s1', 'p2s2', 'p3s1', 'e1', 'e2', 'e3', 't1', 't2', 't3', 't4', 'r1', 'q1', 's1']);
    expect(organiseStep.chosenOptionIds(selection({ suggestions: [{ optionId: 's1', verdict: 'reject' }] }))).toContain('s1');
  });

  it('should hold no op a Blueprint lock may not write', async () => {
    const plan = await materialise(selection());
    const ops = (plan.changeSet ?? []) as ContentOp[];
    expect(ops.every(op => BLUEPRINT_CHANGE_OPS.includes(op.op))).toBe(true);
  });
});
