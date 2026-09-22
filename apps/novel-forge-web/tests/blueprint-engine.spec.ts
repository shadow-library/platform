import { describe, expect, it } from 'bun:test';

import { anchorLine, EMPTY_ANCHORED_LINE, readAnchoredLine } from '../src/features/blueprint/anchored-line';
import { lockedDecision, passRoundKey, passRunningLabel } from '../src/features/blueprint/engine-pass';
import {
  buildOppositionSelection,
  editOppositionAnswer,
  EMPTY_OPPOSITION_ANSWER,
  nextOppositionDraft,
  oppositionAnchor,
  type OppositionDraft,
  oppositionDraftFrom,
  parseOppositionRound,
  restoreOppositionDraft,
} from '../src/features/blueprint/opposition-step';
import {
  buildPowerSelection,
  editRung,
  EMPTY_POWER_DRAFT,
  ladderAnchor,
  nextPowerDraft,
  parsePowerRound,
  powerDraftFrom,
  restorePowerDraft,
} from '../src/features/blueprint/power-step';
import {
  buildProtagonistSelection,
  chooseVersion,
  editLead,
  EMPTY_PROTAGONIST_DRAFT,
  nextProtagonistDraft,
  parseProtagonistRound,
  protagonistAnchor,
  type ProtagonistDraft,
  protagonistDraftFrom,
  restoreProtagonistDraft,
} from '../src/features/blueprint/protagonist-step';
import {
  buildWorldSelection,
  chooseCostRule,
  editCostRule,
  editRule,
  nextWorldDraft,
  parseWorldRound,
  restoreWorldDraft,
  type WorldDraft,
  worldDraftFrom,
} from '../src/features/blueprint/world-step';
import { type BlueprintRoundResponse, type LedgerEntryResponse } from '../src/lib/apis';

function entry(overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id: '1',
    projectId: '7',
    kind: 'decision',
    phase: 'core',
    topic: 'protagonist',
    statement: 'Arden — "I must be useful"',
    why: 'From the premise.',
    rejectedAlternatives: [],
    writerLine: 'Every scene shows him making himself needed.',
    decidedBy: 'author',
    stepKey: 'protagonist',
    payload: null,
    links: {},
    supersedesId: null,
    supersededAt: null,
    withdrawnReason: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function round(overrides: Partial<BlueprintRoundResponse> = {}): BlueprintRoundResponse {
  return {
    id: 'r1',
    stepKey: 'engine',
    round: 1,
    status: 'ready',
    jobId: null,
    steer: null,
    nudges: [],
    keepAsDirection: false,
    feedback: [],
    input: null,
    focus: null,
    options: null,
    coachMessage: null,
    error: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const CRUCIBLE = { wound: 'Left at the harbour', want: 'A licence', need: 'To be wanted when useless', change: 'From useful to chosen' };

const PROTAGONIST_OPTIONS = {
  leads: [{ id: 'l1', name: 'Arden', descriptor: '17, lamp apprentice' }],
  versions: [
    { id: 'pv1', leadId: 'l1', lie: '"I must be useful"', ...CRUCIBLE, chapterOne: 'Runs the round early' },
    { id: 'pv2', leadId: 'l1', lie: '"Nobody stays"', ...CRUCIBLE, chapterOne: 'Leaves first' },
  ],
};

const OPPOSITION_OPTIONS = {
  preselected: 'person',
  why: 'The promise runs on intrigue.',
  forms: [
    {
      id: 'op_person',
      kind: 'person',
      label: 'A person',
      name: 'Warden Sel',
      summary: 'Rations the oil',
      argument: 'The coast eats what it is not fed.',
      wants: 'A lit coast',
      neverWill: 'Burn her own ration',
    },
    {
      id: 'op_slice',
      kind: 'slice',
      label: 'Nothing: slice of life',
      name: 'The lamp house',
      summary: 'A year of small light',
      goals: ['Keep the kitchen open'],
      rhythm: 'Seasons',
      stakes: 'A regular stops coming',
      returnsFor: 'Comfort',
    },
  ],
};

const WORLD_OPTIONS = {
  summary: 'A coast that pays for its light',
  costRules: [
    { id: 'cr1', rule: 'Every lit hour costs a named memory', why: 'It makes power personal', writerLine: 'Name the memory' },
    { id: 'cr2', rule: 'Every lit hour costs a year of sight', why: 'It makes power visible', writerLine: 'Show the dimming eyes' },
  ],
  rules: [{ id: 'wr1', rule: 'A lamp lit unpaid burns the keeper', why: 'Keeps the cost' }],
  honoured: ['Lifespan cost'],
};

const POWER_OPTIONS = {
  rungs: [
    { id: 'rg1', name: 'Taper', buys: 'One room of light', cost: 'An hour' },
    { id: 'rg2', name: 'Beacon', buys: 'A harbour of light', cost: 'A day' },
  ],
  note: 'Arden opens at Taper',
};

describe('readAnchoredLine', () => {
  it('should hide a line the answer has moved out from under, and keep one written for it', () => {
    const line = anchorLine('Every scene shows him making himself needed.', 'a lie');

    expect(readAnchoredLine(line, 'a lie')).toEqual({ text: 'Every scene shows him making himself needed.', stale: false });
    expect(readAnchoredLine(line, 'another lie')).toEqual({ text: '', stale: true });
    expect(readAnchoredLine(EMPTY_ANCHORED_LINE, 'another lie')).toEqual({ text: '', stale: false });
  });
});

describe('passRunningLabel', () => {
  it('should say a sibling screen is being reworked rather than claim this one is', () => {
    expect(passRunningLabel(round({ focus: 'world' }), 'protagonist', 'Own label')).toBe('Reworking another part of this pass…');
    expect(passRunningLabel(round({ focus: 'protagonist' }), 'protagonist', 'Own label')).toBe('Own label');
    expect(passRunningLabel(round(), 'protagonist', 'Own label')).toBe('Own label');
  });

  it('should rebuild round-derived state when a pending round turns ready, not on the id alone', () => {
    expect(passRoundKey(round())).toBe('r1:pending');
    expect(passRoundKey(round({ options: POWER_OPTIONS }))).toBe('r1:ready');
    expect(passRoundKey(null)).toBe('none');
  });

  it('should read the newest decision of a topic and nothing else', () => {
    const entries = [entry({ id: '1' }), entry({ id: '2' }), entry({ id: '3', kind: 'direction' })];
    expect(lockedDecision(entries, 'protagonist')?.id).toBe('2');
    expect(lockedDecision(entries, 'opposition')).toBeNull();
  });
});

describe('protagonist-step', () => {
  it('should read the leads and their versions, and nothing from a shape it does not know', () => {
    const parsed = parseProtagonistRound(round({ options: PROTAGONIST_OPTIONS }));
    expect(parsed.versions.map(version => version.id)).toEqual(['pv1', 'pv2']);
    expect(parseProtagonistRound(round({ options: { versions: 'nonsense' } }))).toEqual({ leads: [], versions: [] });
  });

  it('should drop the version the draft came from once the lie is rewritten, and keep it for any other edit', () => {
    const parsed = parseProtagonistRound(round({ options: PROTAGONIST_OPTIONS }));
    const chosen = chooseVersion(parsed.versions[0]!, parsed.leads[0]);

    expect(chosen.optionId).toBe('pv1');
    expect(editLead(chosen, { wound: 'Left at the gate' }).optionId).toBe('pv1');
    expect(editLead(chosen, { lie: '"I am owed"' }).optionId).toBeUndefined();
  });

  it('should refuse to build a selection until every part and the writer line belong to the lie on screen', () => {
    const parsed = parseProtagonistRound(round({ options: PROTAGONIST_OPTIONS }));
    const lead = chooseVersion(parsed.versions[0]!, parsed.leads[0]);
    const anchor = protagonistAnchor({ l1: lead });

    expect(buildProtagonistSelection(EMPTY_PROTAGONIST_DRAFT)).toBeNull();
    expect(buildProtagonistSelection({ ...EMPTY_PROTAGONIST_DRAFT, leads: { l1: lead } })).toBeNull();

    const draft: ProtagonistDraft = { leads: { l1: lead }, why: EMPTY_ANCHORED_LINE, writerLine: anchorLine('Show him volunteering.', anchor) };
    expect(buildProtagonistSelection(draft)).toMatchObject({ leads: [{ optionId: 'pv1', name: 'Arden', lie: '"I must be useful"' }], writerLine: 'Show him volunteering.' });

    const rewritten = { ...draft, leads: { l1: editLead(lead, { lie: '"I am owed"' }) } };
    expect(buildProtagonistSelection(rewritten)).toBeNull();
  });

  it('should resolve the version a lead came from against the round on screen, and drop it when the lie is gone', () => {
    const parsed = parseProtagonistRound(round({ options: PROTAGONIST_OPTIONS }));
    const draft: ProtagonistDraft = { ...protagonistDraftFrom(), leads: { l1: chooseVersion(parsed.versions[0]!, parsed.leads[0]) } };

    // The ids are round-local: pv1 now names a card the author never chose, and their lie is what pv2 carries.
    const renumbered = parseProtagonistRound(
      round({
        options: {
          ...PROTAGONIST_OPTIONS,
          versions: [
            { ...PROTAGONIST_OPTIONS.versions[0]!, id: 'pv1', lie: '"Something new"' },
            { ...PROTAGONIST_OPTIONS.versions[1]!, id: 'pv2', lie: '"I must be useful"' },
          ],
        },
      }),
    );
    expect(nextProtagonistDraft(draft, renumbered).leads['l1']?.optionId).toBe('pv2');

    const rewritten = parseProtagonistRound(round({ options: { ...PROTAGONIST_OPTIONS, versions: [{ ...PROTAGONIST_OPTIONS.versions[0]!, lie: '"Something else"' }] } }));
    expect(nextProtagonistDraft(draft, rewritten).leads['l1']?.optionId).toBeUndefined();
    expect(nextProtagonistDraft(draft, rewritten).leads['l1']?.lie).toBe('"I must be useful"');
  });

  it('should read the locked lead back without its round-local version id', () => {
    const decided = entry({ payload: { leads: [{ name: 'Arden', descriptor: '17', lie: '"I must be useful"', ...CRUCIBLE, chapterOne: 'Runs early', optionId: 'pv1' }] } });
    const restored = restoreProtagonistDraft([decided]);

    expect(restored?.leads['l1']).toMatchObject({ name: 'Arden', lie: '"I must be useful"' });
    expect(restored?.leads['l1']?.optionId).toBeUndefined();
    expect(readAnchoredLine(restored!.writerLine, protagonistAnchor(restored!.leads)).stale).toBe(false);
    expect(restoreProtagonistDraft([])).toBeNull();
  });
});

describe('opposition-step', () => {
  it('should fill every kind in from the round so the switcher lands on an answer', () => {
    const parsed = parseOppositionRound(round({ options: OPPOSITION_OPTIONS }));
    const draft = oppositionDraftFrom(parsed);

    expect(draft.kind).toBe('person');
    expect(draft.answers.person).toMatchObject({ optionId: 'op_person', name: 'Warden Sel', neverWill: 'Burn her own ration' });
    expect(draft.answers.slice).toMatchObject({ goals: ['Keep the kitchen open'], returnsFor: 'Comfort' });
  });

  it('should let a new round replace the kinds the author never touched and keep the one they wrote', () => {
    const parsed = parseOppositionRound(round({ options: OPPOSITION_OPTIONS }));
    const offered = oppositionDraftFrom(parsed);
    const mine: OppositionDraft = { ...offered, kind: 'slice', answers: { ...offered.answers, person: { ...EMPTY_OPPOSITION_ANSWER, name: 'Mine', summary: 'Mine' } } };
    const reworked = parseOppositionRound(
      round({ options: { ...OPPOSITION_OPTIONS, forms: OPPOSITION_OPTIONS.forms.map(form => ({ ...form, summary: `${form.summary}, reworked` })) } }),
    );

    const next = nextOppositionDraft(mine, offered, reworked);

    expect(next.kind).toBe('slice');
    expect(next.answers.person?.name).toBe('Mine');
    expect(next.answers.slice?.summary).toBe('A year of small light, reworked');
  });

  it('should require a name for a person and a small goal for slice of life', () => {
    const parsed = parseOppositionRound(round({ options: OPPOSITION_OPTIONS }));
    const base = oppositionDraftFrom(parsed);
    const line = (draft: OppositionDraft): OppositionDraft => ({
      ...draft,
      writerLine: anchorLine('It is never wrong in its own scenes.', oppositionAnchor(draft.kind, draft.answers[draft.kind!])),
    });

    expect(buildOppositionSelection(line(base))).toMatchObject({ kind: 'person', name: 'Warden Sel', argument: 'The coast eats what it is not fed.' });

    const unnamed = { ...base, answers: { ...base.answers, person: editOppositionAnswer(base.answers.person!, { name: ' ' }) } };
    expect(buildOppositionSelection(line(unnamed))).toBeNull();

    const slice = { ...base, kind: 'slice' as const };
    expect(buildOppositionSelection(line(slice))).toMatchObject({ kind: 'slice', goals: ['Keep the kitchen open'] });

    const goalless = { ...slice, answers: { ...slice.answers, slice: editOppositionAnswer(slice.answers.slice!, { goals: [] }) } };
    expect(buildOppositionSelection(line(goalless))).toBeNull();
  });

  it('should drop the form the answer came from once its line is rewritten, and refuse a selection with no writer line', () => {
    const parsed = parseOppositionRound(round({ options: OPPOSITION_OPTIONS }));
    const base = oppositionDraftFrom(parsed);

    expect(editOppositionAnswer(base.answers.person!, { wants: 'Something else' }).optionId).toBe('op_person');
    expect(editOppositionAnswer(base.answers.person!, { summary: 'Something else' }).optionId).toBeUndefined();
    expect(buildOppositionSelection(base)).toBeNull();
  });

  it('should require the price of winning before slice-of-life’s twin, the protagonist’s own lie, can be locked', () => {
    const parsed = parseOppositionRound(round({ options: OPPOSITION_OPTIONS }));
    const base = oppositionDraftFrom(parsed);
    const self: OppositionDraft = {
      ...base,
      kind: 'self',
      answers: { ...base.answers, self: { ...EMPTY_OPPOSITION_ANSWER, summary: 'His own lie opposes him' } },
    };
    const line = (draft: OppositionDraft): OppositionDraft => ({
      ...draft,
      writerLine: anchorLine('Every win costs him a friend.', oppositionAnchor(draft.kind, draft.answers[draft.kind!])),
    });

    expect(buildOppositionSelection(line(self))).toBeNull();

    const priced = { ...self, answers: { ...self.answers, self: { ...self.answers.self!, costOfWinning: 'Every win that makes him useful costs him a friend' } } };
    expect(buildOppositionSelection(line(priced))).toMatchObject({ kind: 'self', costOfWinning: 'Every win that makes him useful costs him a friend' });
  });

  it('should read the whole locked answer back, not only its kind', () => {
    const decided = entry({
      topic: 'opposition',
      stepKey: 'opposition',
      payload: { kind: 'slice', summary: 'A year of small light', goals: ['Keep the kitchen open'], rhythm: 'Seasons' },
    });
    const restored = restoreOppositionDraft([decided]);

    expect(restored?.kind).toBe('slice');
    expect(restored?.answers.slice).toMatchObject({ summary: 'A year of small light', goals: ['Keep the kitchen open'] });
    expect(restoreOppositionDraft([entry({ topic: 'opposition', payload: { kind: 'nonsense' } })])).toBeNull();
  });
});

describe('world-step', () => {
  it('should read the cost rules, the rules and what the coach worked around', () => {
    const parsed = parseWorldRound(round({ options: WORLD_OPTIONS }));
    expect(parsed.costRules.map(cost => cost.id)).toEqual(['cr1', 'cr2']);
    expect(parsed.honoured).toEqual(['Lifespan cost']);
    expect(parsed.society).toBeNull();
  });

  it('should anchor the cost lines to the rule they were written for', () => {
    const parsed = parseWorldRound(round({ options: WORLD_OPTIONS }));
    const cost = chooseCostRule(parsed.costRules[0]!);

    expect(readAnchoredLine(cost.writerLine, cost.rule).text).toBe('Name the memory');
    const rewritten = editCostRule(cost, 'Every lit hour costs a friendship');
    expect(rewritten.optionId).toBeUndefined();
    expect(readAnchoredLine(rewritten.writerLine, rewritten.rule)).toEqual({ text: '', stale: true });
  });

  it('should drop an emptied rule and forget the option a reworded one came from', () => {
    const rules = [
      { optionId: 'wr1', rule: 'A', why: '' },
      { optionId: 'wr2', rule: 'B', why: '' },
    ];

    expect(editRule(rules, 1, { rule: 'B two' })[1]).toEqual({ rule: 'B two', why: '' });
    expect(editRule(rules, 0, { rule: '' })).toEqual([{ optionId: undefined, rule: '', why: '' }, rules[1]!]);
    expect(editRule(rules, 1, { why: 'because' })[1]?.optionId).toBe('wr2');
  });

  it('should take a new round’s rules while the author has not touched them, and keep the ones they wrote', () => {
    const parsed = parseWorldRound(round({ options: WORLD_OPTIONS }));
    const offered = worldDraftFrom(parsed);
    const reworked = parseWorldRound(
      round({
        options: {
          ...WORLD_OPTIONS,
          summary: 'A coast that pays twice',
          costRules: [
            { ...WORLD_OPTIONS.costRules[1]!, id: 'cr1' },
            { ...WORLD_OPTIONS.costRules[0]!, id: 'cr2' },
          ],
          rules: [{ id: 'wr1', rule: 'A lamp lit unpaid burns the keeper', why: 'Reworded' }],
        },
      }),
    );

    expect(nextWorldDraft(offered, offered, reworked).summary).toBe('A coast that pays twice');

    const mine: WorldDraft = {
      ...offered,
      summary: 'Mine',
      cost: { ...offered.cost, why: anchorLine('Mine', offered.cost.rule) },
      rules: [{ optionId: 'wr1', rule: 'A lamp lit unpaid burns the keeper', why: 'Mine' }],
    };
    const next = nextWorldDraft(mine, offered, reworked);
    expect(next.summary).toBe('Mine');
    expect(next.rules[0]?.why).toBe('Mine');
    // cr1 now names the other cost rule, so the one the author kept follows its text to cr2 instead of keeping a stale id.
    expect(next.cost.optionId).toBe('cr2');
    expect(next.cost.rule).toBe('Every lit hour costs a named memory');
    expect(next.rules[0]?.optionId).toBe('wr1');
  });

  it('should drop the option id of an answer the new round no longer offers', () => {
    const parsed = parseWorldRound(round({ options: WORLD_OPTIONS }));
    const offered = worldDraftFrom(parsed);
    const mine: WorldDraft = { ...offered, cost: { ...offered.cost, why: anchorLine('Mine', offered.cost.rule) }, rules: [{ optionId: 'wr1', rule: 'Mine alone', why: '' }] };
    const without = parseWorldRound(round({ options: { ...WORLD_OPTIONS, costRules: [WORLD_OPTIONS.costRules[1]!], rules: [] } }));

    const next = nextWorldDraft(mine, offered, without);
    expect(next.cost.optionId).toBeUndefined();
    expect(next.cost.rule).toBe('Every lit hour costs a named memory');
    expect(next.rules[0]?.optionId).toBeUndefined();
    expect(next.rules[0]?.rule).toBe('Mine alone');
  });

  it('should refuse a selection until both writer lines belong to what is on screen', () => {
    const parsed = parseWorldRound(round({ options: WORLD_OPTIONS }));
    const base = worldDraftFrom(parsed);

    expect(buildWorldSelection(base)).toBeNull();

    const draft: WorldDraft = { ...base, writerLine: anchorLine('Every use names what it spent.', base.summary) };
    expect(buildWorldSelection(draft)).toMatchObject({
      summary: 'A coast that pays for its light',
      cost: { optionId: 'cr1', writerLine: 'Name the memory' },
      rules: [{ optionId: 'wr1' }],
    });

    expect(buildWorldSelection({ ...draft, summary: 'Something else entirely' })).toBeNull();
    expect(buildWorldSelection({ ...draft, rules: [] })).toBeNull();
  });

  it('should read both of the decisions this screen wrote, so a revisit locks the whole answer', () => {
    const cost = entry({ topic: 'world.cost', stepKey: 'world', statement: 'Every lit hour costs a named memory', why: 'Personal', writerLine: 'Name the memory' });
    const rules = entry({
      topic: 'world.rules',
      stepKey: 'world',
      statement: 'A coast that pays for its light',
      writerLine: 'Every use names what it spent.',
      payload: { rules: [{ rule: 'A lamp lit unpaid burns the keeper', why: 'Keeps the cost' }], society: { order: 'The office licenses keepers', economy: 'Jars are coin' } },
    });
    const restored = restoreWorldDraft([cost, rules]);

    expect(restored?.cost.rule).toBe('Every lit hour costs a named memory');
    expect(restored?.rules).toEqual([{ rule: 'A lamp lit unpaid burns the keeper', why: 'Keeps the cost' }]);
    expect(restored?.society).toEqual({ order: 'The office licenses keepers', economy: 'Jars are coin' });
    expect(buildWorldSelection(restored!)).toMatchObject({ society: { order: 'The office licenses keepers' } });
    expect(restoreWorldDraft([])).toBeNull();
  });
});

describe('power-step', () => {
  it('should build the ladder from the round and name it by its rungs', () => {
    const parsed = parsePowerRound(round({ options: POWER_OPTIONS }));
    const draft = powerDraftFrom(parsed);

    expect(ladderAnchor(draft.rungs)).toBe('Taper → Beacon');
    expect(buildPowerSelection(draft)).toBeNull();
    expect(buildPowerSelection({ ...draft, writerLine: anchorLine('Every rung is paid for on the page.', 'Taper → Beacon') })).toMatchObject({
      rungs: [{ optionId: 'rg1', name: 'Taper' }, { optionId: 'rg2' }],
      note: 'Arden opens at Taper',
    });
  });

  it('should take a new ladder while the author has not touched it, and keep theirs with its ids resolved again', () => {
    const parsed = parsePowerRound(round({ options: POWER_OPTIONS }));
    const offered = powerDraftFrom(parsed);
    const reworked = parsePowerRound(
      round({
        options: {
          rungs: [
            { ...POWER_OPTIONS.rungs[1]!, id: 'rg1' },
            { ...POWER_OPTIONS.rungs[0]!, id: 'rg2' },
          ],
          note: 'Opens at Beacon',
        },
      }),
    );

    expect(nextPowerDraft(offered, offered, reworked).note).toBe('Opens at Beacon');

    const mine = { ...offered, note: 'Mine', rungs: offered.rungs.map(rung => ({ ...rung, cost: `${rung.cost}, paid twice` })) };
    const next = nextPowerDraft(mine, offered, reworked);
    expect(next.note).toBe('Mine');
    expect(next.rungs.map(rung => rung.name)).toEqual(['Taper', 'Beacon']);
    // rg1 names Beacon in the new round, so the author's Taper follows its name to rg2 rather than keeping a stale id.
    expect(next.rungs.map(rung => rung.optionId)).toEqual(['rg2', 'rg1']);
  });

  it('should refuse a ladder of one rung and one with a rung that buys nothing', () => {
    const parsed = parsePowerRound(round({ options: POWER_OPTIONS }));
    const draft = { ...powerDraftFrom(parsed), writerLine: anchorLine('Every rung is paid for.', 'Taper → Beacon') };

    expect(buildPowerSelection({ ...draft, rungs: draft.rungs.slice(0, 1) })).toBeNull();
    expect(buildPowerSelection({ ...draft, rungs: [draft.rungs[0]!, { ...draft.rungs[1]!, buys: ' ' }] })).toBeNull();
    expect(buildPowerSelection(EMPTY_POWER_DRAFT)).toBeNull();
  });

  it('should forget the rung an answer came from once it is renamed, and drop an emptied one', () => {
    const rungs = [
      { optionId: 'rg1', name: 'Taper', buys: 'Light', cost: 'An hour' },
      { optionId: 'rg2', name: 'Beacon', buys: 'More light', cost: 'A day' },
    ];

    expect(editRung(rungs, 0, { cost: 'Two hours' })[0]?.optionId).toBe('rg1');
    expect(editRung(rungs, 0, { name: 'Wick' })[0]?.optionId).toBeUndefined();
    expect(editRung(rungs, 1, { name: '' })).toEqual([rungs[0]!, { optionId: undefined, name: '', buys: 'More light', cost: 'A day' }]);
  });

  it('should read the locked ladder back whole', () => {
    const decided = entry({
      topic: 'world.power',
      stepKey: 'power',
      statement: 'Taper → Beacon',
      payload: { rungs: [{ name: 'Taper', buys: 'Light', cost: 'An hour' }], note: 'Opens at Taper' },
    });
    const restored = restorePowerDraft([decided]);

    expect(restored?.rungs).toEqual([{ name: 'Taper', buys: 'Light', cost: 'An hour' }]);
    expect(restored?.note).toBe('Opens at Taper');
    expect(restorePowerDraft([])).toBeNull();
  });
});
