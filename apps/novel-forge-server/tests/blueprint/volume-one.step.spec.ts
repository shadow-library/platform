import { describe, expect, it, mock } from 'bun:test';

import { renderLedger } from '@modules/ai/context/ledger-sections';
import { type BlueprintVolumeOneOutput } from '@modules/ai/schemas/blueprint-volume-one.schema';
import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { type ArcsSelection, arcsStep, tileChapters, VOLUME_PLAN_PAGE } from '@modules/blueprint/steps/arcs.step';
import { CAST_LADDER_TOPIC, type CastSelection, castStep } from '@modules/blueprint/steps/cast.step';
import { PLACES_BACKLOG_TOPIC, PLACES_PAGE, type PlacesSelection, placesStep } from '@modules/blueprint/steps/places.step';
import { CAST_PAGE } from '@modules/blueprint/steps/protagonist.step';
import {
  type ArcsSliceOptions,
  type CastSliceOptions,
  mergeVolumeOneSlices,
  type PlacesSliceOptions,
  type VolumeOneOptions,
  volumeOnePass,
} from '@modules/blueprint/steps/volume-one-pass.step';
import { type ContentOp } from '@modules/refinement/change-set';
import { type Ledger, type Plan, type PrimaryTransaction } from '@server/database';

import { ledgerEntry, pageTx } from './blueprint-fixtures';

function output(overrides: Partial<BlueprintVolumeOneOutput> = {}): BlueprintVolumeOneOutput {
  return {
    cast: {
      members: [
        { name: 'Brannoc', descriptor: 'His master at the lamp house', role: 'mentor', wants: 'To retire without a debt', doesInVolumeOne: 'Signs the licence' },
        { name: 'Lise Hart', descriptor: 'A memory smuggler', role: 'rival', wants: 'The sealed ledger', doesInVolumeOne: 'Sells him the jar', minor: false },
        { name: 'Tomas', descriptor: 'A tithe-house boy', role: 'ally', wants: 'To be taken seriously', doesInVolumeOne: 'Runs the messages', minor: true },
      ],
      later: [{ name: 'The Salt Consul', line: 'Buys the coast a season at a time', volume: 3 }],
      ladder: {
        first: 'Arden',
        second: 'Lise Hart',
        rungs: [
          { name: 'distrust', meaning: 'They each expect to be robbed' },
          { name: 'an uneasy deal', meaning: 'They trade without looking away' },
          { name: 'owes her', meaning: 'He cannot pay what she spent' },
        ],
      },
    },
    places: {
      places: [
        { name: 'The Tithe Quarter', kind: 'place', detail: 'deep', summary: 'Where the lamps are paid for', usedIn: 'arc 1' },
        { name: 'The Hollow Market', kind: 'place', detail: 'deep', summary: 'Memory smugglers trade here', usedIn: 'arc 2' },
        { name: 'The Lamp Office', kind: 'faction', detail: 'deep', summary: 'Runs the tithe' },
        { name: 'The Salt Coast', kind: 'place', detail: 'sketch', summary: 'Somewhere south, later' },
      ],
      backlog: [{ item: 'The history of the first tithe', why: 'No sentence before chapter twenty depends on it' }],
    },
    arcs: {
      volumeTitle: 'Discovery',
      arcs: [
        { title: 'The Round', purpose: 'Show the tithe from inside', turn: 'The jar in his hand is his own memory', chapters: 10, rung: 'distrust' },
        { title: 'Hollow Market', purpose: 'Force him to need the smugglers', turn: 'He owes Lise a favour he cannot name', chapters: 12, rung: 'an uneasy deal' },
        { title: 'The Sealed Ledger', purpose: 'Raise what a memory costs', turn: 'The Office has a file on him', chapters: 8 },
      ],
    },
    coachMessage: 'A cast of three, four places and three arcs.',
    ...overrides,
  };
}

const protagonist = (): Ledger.Entry =>
  ledgerEntry({
    kind: 'decision',
    phase: 'core',
    topic: 'protagonist',
    stepKey: 'protagonist',
    statement: 'Arden — "I must be useful"',
    payload: { leads: [{ name: 'Arden', lie: '"I must be useful"' }] },
    links: { bibleDocuments: [CAST_PAGE], entityKeys: ['arden'] },
  });

const opposition = (): Ledger.Entry =>
  ledgerEntry({
    kind: 'decision',
    phase: 'core',
    topic: 'opposition',
    stepKey: 'opposition',
    statement: 'Warden Sel',
    payload: { kind: 'person', name: 'Warden Sel', entityKey: 'warden_sel' },
    links: { entityKeys: ['warden_sel'] },
  });

const spine = (): Ledger.Entry =>
  ledgerEntry({
    kind: 'decision',
    phase: 'spine',
    topic: 'spine',
    stepKey: 'spine',
    statement: 'Discovery → Choice',
    payload: { movements: [{ volumeKey: 'volume_1', ordinal: 1, title: 'Discovery', summary: 'The stolen tithes', change: 'useful', chapters: 30 }] },
    links: { volumeKeys: ['volume_1'] },
  });

const roundOf = (ledger: Ledger.Entry[] = [], out = output(), previous: VolumeOneOptions | null = null, focus: string | null = null): VolumeOneOptions =>
  volumeOnePass.toRound(out, { previous, input: null, focus, ledger }).options;

function volume(overrides: Partial<Plan.Volume> = {}): Plan.Volume {
  return {
    id: 1n,
    projectId: 7n,
    volumeKey: 'volume_1',
    ordinal: 1,
    title: 'Discovery',
    status: 'approved',
    startChapter: 1,
    endChapter: 30,
    targetChapterCount: 30,
    ...overrides,
  } as Plan.Volume;
}

/** `loadPageBody` reads through `select`; the arcs lock also reads the volume plan through `query`. */
function planTx(page: string | null, volumes: Plan.Volume[]): PrimaryTransaction {
  return { ...pageTx(page), query: { volumes: { findMany: async () => volumes } } } as unknown as PrimaryTransaction;
}

function castSelection(overrides: Partial<CastSelection> = {}): CastSelection {
  return {
    members: [
      { optionId: 'cm1', name: 'Brannoc', descriptor: 'His master at the lamp house', role: 'mentor', wants: 'To retire without a debt', decidedBy: 'author' },
      { optionId: 'cm3', name: 'Tomas', descriptor: 'A tithe-house boy', role: 'ally', decidedBy: 'system' },
    ],
    later: [{ optionId: 'lc1', name: 'The Salt Consul', line: 'Buys the coast a season at a time', volume: 3 }],
    ladder: {
      first: 'Arden',
      second: 'Lise Hart',
      rungs: [
        { optionId: 'lr1', name: 'distrust' },
        { optionId: 'lr2', name: 'an uneasy deal' },
      ],
    },
    writerLine: 'Brannoc is in every chapter Arden works a lamp.',
    ...overrides,
  };
}

function placesSelection(overrides: Partial<PlacesSelection> = {}): PlacesSelection {
  return {
    places: [
      { optionId: 'pl1', name: 'The Tithe Quarter', kind: 'place', detail: 'deep', summary: 'Where the lamps are paid for', usedIn: 'arc 1' },
      { optionId: 'pl3', name: 'The Lamp Office', kind: 'faction', detail: 'sketch', summary: 'Runs the tithe' },
    ],
    backlog: [{ optionId: 'bl1', item: 'The history of the first tithe', why: 'Nothing before chapter twenty needs it' }],
    writerLine: 'Everything in volume one happens within a walk of the Tithe Quarter.',
    ...overrides,
  };
}

function arcsSelection(overrides: Partial<ArcsSelection> = {}): ArcsSelection {
  return {
    arcs: [
      { optionId: 'ac1', title: 'The Round', purpose: 'Show the tithe from inside', turn: 'The jar is his own memory', chapters: 10, rung: 'distrust' },
      { optionId: 'ac2', title: 'Hollow Market', purpose: 'Force him to need the smugglers', turn: 'He owes Lise', chapters: 12 },
      { optionId: 'ac3', title: 'The Sealed Ledger', purpose: 'Raise the price', turn: 'The Office has a file on him', chapters: 8 },
    ],
    writerLine: 'Arc one ends on him claiming the jar.',
    ...overrides,
  };
}

function materialiseCast(chosen: CastSelection, ledger: Ledger.Entry[] = [], page: string | null = null) {
  const view = (roundOf(ledger).cast ?? null) as CastSliceOptions | null;
  return castStep.materialise(chosen, {
    round: { round: 1, options: view },
    ledger,
    project: { id: 7n },
    tx: pageTx(page),
  } as unknown as MaterialiseContext<CastSliceOptions | null>);
}

function materialisePlaces(chosen: PlacesSelection, ledger: Ledger.Entry[] = [], page: string | null = null) {
  const view = (roundOf(ledger).places ?? null) as PlacesSliceOptions | null;
  return placesStep.materialise(chosen, {
    round: { round: 1, options: view },
    ledger,
    project: { id: 7n },
    tx: pageTx(page),
  } as unknown as MaterialiseContext<PlacesSliceOptions | null>);
}

function materialiseArcs(chosen: ArcsSelection, ledger: Ledger.Entry[] = [], volumes: Plan.Volume[] = [volume()], page: string | null = null) {
  const view = (roundOf(ledger).arcs ?? null) as ArcsSliceOptions | null;
  return arcsStep.materialise(chosen, {
    round: { round: 1, options: view },
    ledger,
    project: { id: 7n },
    tx: planTx(page, volumes),
  } as unknown as MaterialiseContext<ArcsSliceOptions | null>);
}

const bodyOf = (plan: { changeSet?: ContentOp[] }, slug: string): string =>
  (plan.changeSet?.find(op => op.op === 'bible_document.upsert' && op.slug === slug) as { body: string }).body;

describe('volumeOnePass', () => {
  it('should key every slice’s options apart, so the three screens never share an id', () => {
    const ids = volumeOnePass.describeOptions(roundOf()).map(option => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('cm1');
    expect(ids).toContain('pl1');
    expect(ids).toContain('ac1');
  });

  it('should drop a card that re-invents a character the Core phase already locked', () => {
    const base = output().cast as NonNullable<BlueprintVolumeOneOutput['cast']>;
    const reinvented = output({ cast: { ...base, members: [{ name: 'Arden', descriptor: 'again', role: 'hero', wants: 'x', doesInVolumeOne: 'y' }, ...base.members] } });

    const names = roundOf([protagonist()], reinvented).cast?.members.map(member => member.name);

    expect(names).not.toContain('Arden');
    expect(names).toEqual(['Brannoc', 'Lise Hart', 'Tomas']);
  });

  it('should keep every unfocused slice byte for byte when one screen is steered', () => {
    const previous = roundOf();
    const reworked = roundOf(
      [],
      output({ places: { places: [{ name: 'A new quarter', kind: 'place', detail: 'deep', summary: 'somewhere else' }], backlog: [] } }),
      previous,
      'places',
    );

    expect(reworked.cast).toEqual(previous.cast);
    expect(reworked.arcs).toEqual(previous.arcs);
    expect(reworked.places?.places[0]?.name).toBe('A new quarter');
  });

  it('should fall back to the previous slice when the model omits one, and refuse a round with nothing at all', () => {
    const previous = roundOf();
    expect(mergeVolumeOneSlices(previous, {}, null)).toEqual(previous);
    expect(() => volumeOnePass.toRound({ coachMessage: 'nothing' }, { previous: null, input: null, focus: null, ledger: [] })).toThrow();
  });
});

describe('castStep.materialise', () => {
  it('should write one cast decision plus a system entry for every card the author delegated', async () => {
    const plan = await materialiseCast(castSelection());

    expect(plan.entries.map(entry => `${entry.kind}:${entry.topic}`)).toEqual(['decision:cast', 'system:cast', 'decision:cast.ladder']);
    expect(plan.entries[1]).toMatchObject({ statement: 'Tomas — A tithe-house boy', decidedBy: 'system', payload: { optionId: 'tomas' } });
    expect(plan.entries[2]).toMatchObject({ topic: CAST_LADDER_TOPIC, statement: 'Arden and Lise Hart: distrust → an uneasy deal' });
  });

  it('should reuse the protagonist and the opposition rather than writing over their entities', async () => {
    const chosen = castSelection({
      members: [
        ...castSelection().members,
        { name: 'Arden', descriptor: 'the protagonist, already made', decidedBy: 'author' },
        { name: 'Warden Sel', descriptor: 'the opposition', decidedBy: 'author' },
      ],
    });
    const plan = await materialiseCast(chosen, [protagonist(), opposition()]);
    const entities = (plan.changeSet ?? []).filter(op => op.op === 'entity.upsert').map(op => (op as { entityKey: string }).entityKey);

    expect(entities).toEqual(['brannoc', 'tomas']);
    expect(plan.entries[0]?.links?.entityKeys).toEqual(['brannoc', 'tomas']);
    expect((plan.entries[0]?.payload as { members: { name: string; existing: boolean }[] }).members.filter(member => member.existing).map(member => member.name)).toEqual([
      'Arden',
      'Warden Sel',
    ]);
  });

  it('should merge its sections into the cast page without touching the protagonist’s', async () => {
    const body = bodyOf(await materialiseCast(castSelection(), [], '# Cast\n\n## Protagonist\n\n**Arden** — 17, lamp apprentice'), 'cast');

    expect(body).toContain('## Protagonist');
    expect(body).toContain('**Arden** — 17, lamp apprentice');
    expect(body).toContain('## Volume one');
    expect(body).toContain('## Later volumes');
    expect(body).toContain('## Relationship ladder');
  });

  it('should retire every card it answered, so a character handed back to the author loses its system entry', async () => {
    const plan = await materialiseCast(castSelection());
    expect(plan.retires).toEqual(['brannoc', 'tomas']);
  });

  it('should never remove an entity the Core phase has since taken over, even though its own earlier lock made it', async () => {
    // The cast owned "Vela" while the opposition was the protagonist's own lie and had no entity; the opposition is then locked as a
    // person of that name, and the next cast lock drops the card. Its links still claim the key, and the entity is now somebody else's.
    const owned = ledgerEntry({ kind: 'decision', phase: 'volume_one', topic: 'cast', stepKey: 'cast', links: { entityKeys: ['brannoc', 'tomas', 'vela'] } });
    const vela = ledgerEntry({
      kind: 'decision',
      phase: 'core',
      topic: 'opposition',
      stepKey: 'opposition',
      statement: 'Vela',
      payload: { kind: 'person', name: 'Vela', entityKey: 'vela' },
      links: { entityKeys: ['vela'] },
    });
    const plan = await materialiseCast(castSelection(), [vela, owned]);

    expect(plan.changeSet).not.toContainEqual({ op: 'entity.remove', entityKey: 'vela' });
    expect(plan.retires).toContain('vela');
  });

  it('should retire the cards an earlier lock owned as well as this one’s, so a dropped character loses their system entry', async () => {
    const owned = ledgerEntry({ kind: 'decision', phase: 'volume_one', topic: 'cast', stepKey: 'cast', links: { entityKeys: ['brannoc', 'lise_hart'] } });
    const delegated = ledgerEntry({ kind: 'system', phase: 'volume_one', topic: 'cast', stepKey: 'cast', statement: 'Lise Hart — a smuggler', payload: { optionId: 'lise_hart' } });
    const author = castSelection({ members: [castSelection().members[0] as never] });

    const plan = await materialiseCast(author, [owned, delegated]);
    expect(plan.retires).toContain('lise_hart');
    expect(plan.entries.every(entry => entry.kind !== 'system')).toBe(true);
  });

  it('should remove the entity of a character the author dropped on a re-lock', async () => {
    const earlier = ledgerEntry({ kind: 'decision', phase: 'volume_one', topic: 'cast', stepKey: 'cast', links: { entityKeys: ['brannoc', 'tomas', 'lise_hart'] } });
    const plan = await materialiseCast(castSelection(), [earlier]);

    expect(plan.changeSet).toContainEqual({ op: 'entity.remove', entityKey: 'lise_hart' });
    expect(plan.changeSet).not.toContainEqual({ op: 'entity.remove', entityKey: 'brannoc' });
  });

  it('should refuse two cards with the same name, a ladder of one person, and a missing writer line', async () => {
    await expect(materialiseCast(castSelection({ members: [castSelection().members[0] as never, castSelection().members[0] as never] }))).rejects.toMatchObject({
      code: 'BPR_004',
    });
    await expect(materialiseCast(castSelection({ ladder: { first: 'Arden', second: 'arden', rungs: [{ name: 'a' }, { name: 'b' }] } }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialiseCast(castSelection({ writerLine: '  ' }))).rejects.toMatchObject({ code: 'BPR_004' });
  });
});

describe('placesStep.materialise', () => {
  it('should record places as locations and factions as factions, split across the page’s two sections', async () => {
    const plan = await materialisePlaces(placesSelection());
    const entities = (plan.changeSet ?? []).filter(op => op.op === 'entity.upsert');

    expect(entities.map(op => (op as { type: string }).type)).toEqual(['location', 'faction']);
    const body = bodyOf(plan, PLACES_PAGE.slug);
    expect(body).toContain('## Places');
    expect(body).toContain('## Factions');
    expect(body).toContain('*(sketch)*');
  });

  it('should reuse a faction the Core phase already made the opposition rather than writing over it', async () => {
    const chosen = placesSelection({ places: [...placesSelection().places, { name: 'Warden Sel', kind: 'faction', detail: 'sketch', summary: 'the opposition, already made' }] });
    const plan = await materialisePlaces(chosen, [opposition()]);
    const entities = (plan.changeSet ?? []).filter(op => op.op === 'entity.upsert').map(op => (op as { entityKey: string }).entityKey);

    expect(entities).toEqual(['the_tithe_quarter', 'the_lamp_office']);
    expect(plan.entries[0]?.links?.entityKeys).toEqual(['the_tithe_quarter', 'the_lamp_office']);
  });

  it('should write everything deferred as a backlog entry, which never reaches the do-not-propose list', async () => {
    const plan = await materialisePlaces(placesSelection());
    const backlog = plan.entries.filter(entry => entry.kind === 'backlog');

    expect(backlog).toHaveLength(1);
    expect(backlog[0]).toMatchObject({ topic: PLACES_BACKLOG_TOPIC, statement: 'The history of the first tithe', payload: { source: 'coach' } });

    const rendered = renderLedger([
      {
        kind: 'backlog',
        phase: 'volume_one',
        topic: PLACES_BACKLOG_TOPIC,
        statement: 'The history of the first tithe',
        why: null,
        rejectedAlternatives: [],
        writerLine: null,
        decidedBy: 'author',
      },
    ]);
    expect(rendered).toContain('Backlog — not yet');
    expect(rendered).not.toContain('Do not propose');
  });

  it('should not write a backlog entry the notebook already holds', async () => {
    const known = ledgerEntry({ kind: 'backlog', phase: 'volume_one', topic: PLACES_BACKLOG_TOPIC, statement: 'The history of the first tithe', stepKey: 'places' });
    const plan = await materialisePlaces(placesSelection(), [known]);

    expect(plan.entries.filter(entry => entry.kind === 'backlog')).toHaveLength(0);
    expect(plan.entries).toHaveLength(1);
  });

  it('should refuse an answer in which nowhere is detailed', async () => {
    const sketches = placesSelection({ places: placesSelection().places.map(place => ({ ...place, detail: 'sketch' as const })) });
    await expect(materialisePlaces(sketches)).rejects.toMatchObject({ code: 'BPR_004' });
  });
});

describe('arcsStep.materialise', () => {
  it('should tile the arcs across the volume’s own chapter range, exactly', () => {
    expect(tileChapters([10, 12, 8], 1, 30)).toEqual([
      { chapterStart: 1, chapterEnd: 10 },
      { chapterStart: 11, chapterEnd: 22 },
      { chapterStart: 23, chapterEnd: 30 },
    ]);

    const scaled = tileChapters([10, 10, 10], 5, 20);
    expect(scaled[0]?.chapterStart).toBe(5);
    expect(scaled.at(-1)?.chapterEnd).toBe(20);
  });

  it('should refuse a volume that ends before it begins', async () => {
    await expect(materialiseArcs(arcsSelection(), [spine()], [volume({ startChapter: 8, endChapter: 3 })])).rejects.toMatchObject({ code: 'BPR_004' });
  });

  it('should write one arc row per arc, in the volume the spine named, and link only the arcs it made', async () => {
    const plan = await materialiseArcs(arcsSelection(), [spine()]);
    const arcs = (plan.changeSet ?? []).filter(op => op.op === 'arc.upsert');

    expect(plan.entries[0]?.links?.volumeKeys).toBeUndefined();
    expect((plan.entries[0]?.payload as { volumeKey: string }).volumeKey).toBe('volume_1');
    expect(arcs).toHaveLength(3);
    expect(arcs[0]).toMatchObject({ arcKey: 'volume_1_arc_1', volumeKey: 'volume_1', ordinal: 1, chapterStart: 1, chapterEnd: 10, objective: 'Show the tithe from inside' });
    expect(plan.entries[0]).toMatchObject({ topic: 'arcs', statement: 'The Round → Hollow Market → The Sealed Ledger' });
  });

  it('should keep the relationship rung on the arc that lands it', async () => {
    const plan = await materialiseArcs(arcsSelection(), [spine()]);
    const payload = plan.entries[0]?.payload as { arcs: { title: string; rung: string }[] };

    expect(payload.arcs.map(arc => arc.rung)).toEqual(['distrust', '', '']);
    expect(bodyOf(plan, VOLUME_PLAN_PAGE.slug)).toContain('rung: distrust');
  });

  it('should approve the arcs of volume one after the commit', async () => {
    const plan = await materialiseArcs(arcsSelection(), [spine()]);
    const runActions = mock(async () => undefined);

    await plan.afterCommit?.({ projectId: 7n, entries: [], proposal: null, runActions });
    expect(runActions).toHaveBeenCalledWith([{ op: 'action.approve_arcs', volumeKey: 'volume_1' }]);
  });

  it('should surface a failing approval through the lock’s follow-up rather than undoing the arcs', async () => {
    const plan = await materialiseArcs(arcsSelection(), [spine()]);
    const runActions = mock(async () => {
      throw new Error('the arcs do not cover the volume');
    });

    await expect(plan.afterCommit?.({ projectId: 7n, entries: [], proposal: null, runActions })).rejects.toThrow('the arcs do not cover the volume');
    expect(plan.changeSet?.length).toBeGreaterThan(0);
  });

  it('should remove an arc row the author dropped on a re-lock, and leave the rest alone', async () => {
    const earlier = ledgerEntry({
      kind: 'decision',
      phase: 'volume_one',
      topic: 'arcs',
      stepKey: 'arcs',
      links: { arcKeys: ['volume_1_arc_1', 'volume_1_arc_2', 'volume_1_arc_3'], volumeKeys: ['volume_1'] },
    });
    const plan = await materialiseArcs(arcsSelection({ arcs: arcsSelection().arcs.slice(0, 2) }), [spine(), earlier]);

    expect(plan.changeSet).toContainEqual({ op: 'arc.remove', arcKey: 'volume_1_arc_3' });
    // The fixture links a volume, as an entry written before the arcs step stopped doing that would: it must still never be removed.
    expect(plan.changeSet).not.toContainEqual({ op: 'volume.remove', volumeKey: 'volume_1' });
  });

  it('should refuse to break a volume that does not exist, or one too short to hold the arcs', async () => {
    await expect(materialiseArcs(arcsSelection(), [], [])).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialiseArcs(arcsSelection(), [spine()], [volume({ startChapter: 1, endChapter: 2 })])).rejects.toMatchObject({ code: 'BPR_004' });
  });
});
