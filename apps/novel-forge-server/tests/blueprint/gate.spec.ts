import { describe, expect, it, mock } from 'bun:test';

import { arcBriefRangeWarning, briefedArc, staleArcWarning, stepsDecidedAfterCheck, unfinishedRequiredSteps } from '@modules/blueprint/gate/gate';
import { BlueprintGateService } from '@modules/blueprint/gate/gate.service';
import { type BlueprintPhaseProgress } from '@modules/blueprint/stage/blueprint-stage';
import { type Ledger, type Plan, schema } from '@server/database';

import { ledgerEntry } from './blueprint-fixtures';

function phase(overrides: Partial<BlueprintPhaseProgress> = {}): BlueprintPhaseProgress {
  return { phase: 'opening', label: 'Opening', status: 'current', steps: [], ...overrides };
}

function step(key: string, overrides: { required?: boolean; applies?: boolean; done?: boolean } = {}) {
  return { key, required: overrides.required ?? true, applies: overrides.applies ?? true, done: overrides.done ?? false };
}

function arc(overrides: Partial<Plan.Arc> = {}): Pick<Plan.Arc, 'arcKey' | 'title' | 'staleReason' | 'chapterStart' | 'chapterEnd'> {
  return { arcKey: 'v1_a1', title: 'The unpaid tithe', staleReason: null, chapterStart: 1, chapterEnd: 4, ...overrides };
}

function briefsEntry(chapters: number[], arcKey = 'v1_a1'): Ledger.Entry {
  return ledgerEntry({
    kind: 'decision',
    phase: 'opening',
    topic: 'briefs',
    stepKey: 'briefs',
    payload: { arcKey, briefs: chapters.map(chapter => ({ chapter, title: `Chapter ${chapter}` })) },
  });
}

describe('unfinishedRequiredSteps', () => {
  it('should name only the required steps that apply and are not done', () => {
    const phases = [
      phase({ phase: 'idea', label: 'Idea', steps: [step('premise', { done: true }), step('taste', { required: false })] }),
      phase({ steps: [step('briefs'), step('power', { applies: false }), step('voice', { required: false })] }),
    ];

    expect(unfinishedRequiredSteps(phases)).toEqual([{ phase: 'opening', phaseLabel: 'Opening', step: 'briefs' }]);
  });

  it('should report nothing for a Blueprint whose every required step is locked', () => {
    expect(unfinishedRequiredSteps([phase({ steps: [step('briefs', { done: true }), step('voice', { required: false })] })])).toEqual([]);
  });
});

describe('stepsDecidedAfterCheck', () => {
  const check = ledgerEntry({ kind: 'decision', topic: 'check', stepKey: 'check', createdAt: new Date(2_000) });

  it('should name every step decided after the check read the design', () => {
    const ledger = [
      ledgerEntry({ kind: 'decision', topic: 'premise', stepKey: 'premise', createdAt: new Date(1_000) }),
      check,
      ledgerEntry({ kind: 'decision', topic: 'voice', stepKey: 'voice', createdAt: new Date(3_000) }),
      ledgerEntry({ kind: 'decision', topic: 'cast', stepKey: 'cast', createdAt: new Date(4_000) }),
    ];

    expect(stepsDecidedAfterCheck(ledger, 'check')).toEqual(['voice', 'cast']);
  });

  it('should ignore the check’s own findings and anything the author wrote by hand', () => {
    const ledger = [
      check,
      ledgerEntry({ kind: 'decision', topic: 'check.cast_count', stepKey: 'check', createdAt: new Date(3_000) }),
      ledgerEntry({ kind: 'direction', topic: 'voice.steer', stepKey: 'voice', createdAt: new Date(3_000) }),
      ledgerEntry({ kind: 'decision', topic: 'theme', stepKey: null, createdAt: new Date(5_000) }),
    ];

    expect(stepsDecidedAfterCheck(ledger, 'check')).toEqual([]);
  });

  it('should count a decision the author withdrew after the check as a change the check never saw', () => {
    const ledger = [
      check,
      ledgerEntry({ kind: 'decision', topic: 'places', stepKey: 'places', createdAt: new Date(1_000), supersededAt: new Date(4_000), withdrawnReason: 'Dropped' }),
    ];

    expect(stepsDecidedAfterCheck(ledger, 'check')).toEqual(['places']);
  });

  it('should ignore the entries a later check lock retired, so re-running it does not flag itself', () => {
    const ledger = [ledgerEntry({ kind: 'decision', topic: 'check', stepKey: 'check', createdAt: new Date(1_000), supersededAt: new Date(2_000) }), check];

    expect(stepsDecidedAfterCheck(ledger, 'check')).toEqual([]);
  });

  it('should read the newest ACTIVE check, not one a re-lock retired', () => {
    const ledger = [
      ledgerEntry({ kind: 'decision', topic: 'voice', stepKey: 'voice', createdAt: new Date(3_000) }),
      ledgerEntry({ kind: 'decision', topic: 'check', stepKey: 'check', createdAt: new Date(4_000), supersededAt: new Date(5_000) }),
      ledgerEntry({ kind: 'decision', topic: 'check', stepKey: 'check', createdAt: new Date(1_000) }),
    ];

    expect(stepsDecidedAfterCheck(ledger, 'check')).toEqual(['voice']);
  });

  it('should say nothing when the check has never run', () => {
    expect(stepsDecidedAfterCheck([ledgerEntry({ kind: 'decision', topic: 'voice', stepKey: 'voice' })], 'check')).toEqual([]);
  });
});

describe('staleArcWarning', () => {
  it('should name every stale arc and send the author back to the arcs step', () => {
    const warning = staleArcWarning([arc(), arc({ arcKey: 'v1_a2', title: 'The reckoning', staleReason: 'volume_changed' })], 'arcs');

    expect(warning).toMatchObject({ kind: 'arc_stale', step: 'arcs' });
    expect(warning?.detail).toContain('The reckoning');
    expect(warning?.detail).toContain('the volume was rewritten');
    expect(warning?.detail).not.toContain('volume_changed');
    expect(warning?.detail).not.toContain('The unpaid tithe');
  });

  it('should stay quiet when no arc is stale', () => {
    expect(staleArcWarning([arc()], 'arcs')).toBeNull();
  });
});

describe('arcBriefRangeWarning', () => {
  it('should stay quiet when the briefs cover arc one exactly', () => {
    expect(arcBriefRangeWarning(arc(), briefedArc([briefsEntry([1, 2, 3, 4])], 'briefs', 'briefs'), 'briefs')).toBeNull();
  });

  it('should report a chapter arc one plans that no brief covers', () => {
    const warning = arcBriefRangeWarning(arc({ chapterEnd: 6 }), briefedArc([briefsEntry([1, 2, 3, 4])], 'briefs', 'briefs'), 'briefs');

    expect(warning).toMatchObject({ kind: 'arc_brief_range', step: 'briefs' });
    expect(warning?.detail).toContain('chapters 1–6');
    expect(warning?.detail).toContain('chapters 1–4');
  });

  it('should report briefs that fall outside arc one’s range', () => {
    expect(arcBriefRangeWarning(arc({ chapterStart: 3, chapterEnd: 4 }), briefedArc([briefsEntry([1, 2, 3, 4])], 'briefs', 'briefs'), 'briefs')).toMatchObject({
      kind: 'arc_brief_range',
    });
  });

  it('should report briefs written for an arc that is no longer arc one, without naming its key', () => {
    const warning = arcBriefRangeWarning(arc({ arcKey: 'v1_a0' }), briefedArc([briefsEntry([1, 2])], 'briefs', 'briefs'), 'briefs');

    expect(warning).toMatchObject({ kind: 'arc_brief_range', step: 'briefs' });
    expect(warning?.detail).not.toContain('v1_a1');
  });

  it('should stay quiet when no briefs are locked yet', () => {
    expect(arcBriefRangeWarning(arc(), briefedArc([], 'briefs', 'briefs'), 'briefs')).toBeNull();
  });
});

interface GateFakeState {
  phases?: BlueprintPhaseProgress[];
  ledger?: Ledger.Entry[];
  arcs?: ReturnType<typeof arc>[];
  briefs?: { chapter: number; staleReason: string | null }[];
}

function fakeGate(state: GateFakeState = {}) {
  const appended: unknown[] = [];
  const db = {
    query: {
      projects: { findFirst: mock(async () => ({ id: 7n, kind: 'new_novel' })) },
      decisionLedgerEntries: { findMany: mock(async () => state.ledger ?? []) },
    },
    select: () => ({ from: (table: unknown) => ({ where: () => ({ orderBy: async () => (table === schema.arcs ? (state.arcs ?? []) : (state.briefs ?? [])) }) }) }),
    transaction: mock(async (run: (tx: unknown) => Promise<unknown>) => run(db)),
  };
  const stage = { progress: mock(async () => ({ stage: 'blueprint', phases: state.phases ?? [] })) };
  const ledger = {
    append: mock(async (_projectId: bigint, entries: unknown[]) => {
      appended.push(...entries);
      return entries.map(entry => ledgerEntry({ ...(entry as Partial<Ledger.Entry>), id: 99n }));
    }),
  };
  const rounds = { lockStep: mock(async () => undefined) };
  const service = new BlueprintGateService({ getPostgresClient: () => db } as never, stage as never, ledger as never, rounds as never);
  return { service, appended, rounds, db };
}

const gateEntry = ledgerEntry({ kind: 'system', phase: null, topic: 'gate', stepKey: null, decidedBy: 'system' });
const arcsDecision = ledgerEntry({
  kind: 'decision',
  topic: 'arcs',
  stepKey: 'arcs',
  payload: { volumeKey: 'v1', arcs: [{ arcKey: 'v1_a1', ordinal: 1, chapterStart: 1, chapterEnd: 4 }] },
});

describe('BlueprintGateService', () => {
  it('should refuse to open the Workspace while a required step is unfinished', async () => {
    const { service, appended } = fakeGate({ phases: [phase({ steps: [step('briefs')] })] });

    await expect(service.open(7n)).rejects.toMatchObject({ code: 'BPR_009' });
    expect(appended).toEqual([]);
  });

  it('should name the phase rather than the step key when it refuses', async () => {
    const { service } = fakeGate({ phases: [phase({ steps: [step('briefs'), step('check')] })] });

    await expect(service.open(7n)).rejects.toMatchObject({ message: expect.stringContaining('Opening') });
    await expect(service.open(7n)).rejects.not.toMatchObject({ message: expect.stringContaining('briefs') });
  });

  it('should write the gate as a system entry on no phase once every required step is done', async () => {
    const { service, appended } = fakeGate({ phases: [phase({ steps: [step('briefs', { done: true })] })] });

    await service.open(7n);

    expect(appended).toEqual([{ kind: 'system', phase: null, topic: 'gate', statement: expect.any(String), decidedBy: 'system' }]);
  });

  it('should take the gate’s own lock inside one transaction before reading, so two opens cannot both write', async () => {
    const { service, rounds, db } = fakeGate({ phases: [phase({ steps: [step('briefs', { done: true })] })] });

    await service.open(7n);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(rounds.lockStep.mock.calls[0]?.slice(0, 2)).toEqual([7n, 'gate']);
    expect(db.query.decisionLedgerEntries.findMany.mock.calls.length).toBeGreaterThan(0);
  });

  it('should return the gate already written rather than appending a second one', async () => {
    const { service, appended } = fakeGate({ phases: [phase({ steps: [step('briefs', { done: true })] })], ledger: [gateEntry] });

    expect(await service.open(7n)).toMatchObject({ topic: 'gate' });
    expect(appended).toEqual([]);
  });

  it('should report a stale arc and an unrun check as warnings that do not hold the gate shut', async () => {
    const { service } = fakeGate({
      phases: [phase({ steps: [step('briefs', { done: true })] })],
      arcs: [arc({ staleReason: 'volume_changed' })],
      ledger: [
        arcsDecision,
        ledgerEntry({ kind: 'decision', topic: 'check', stepKey: 'check', createdAt: new Date(1_000) }),
        ledgerEntry({ kind: 'decision', topic: 'voice', stepKey: 'voice', createdAt: new Date(2_000) }),
      ],
    });

    const readiness = await service.readiness(7n);

    expect(readiness.ready).toBe(true);
    expect(readiness.warnings.map(warning => warning.kind)).toEqual(['arc_stale', 'check_outdated']);
    expect(readiness.warnings[0]?.detail).not.toContain('volume_changed');
    expect(readiness.warnings[1]?.steps).toEqual(['voice']);
  });

  it('should warn when arc one’s briefs were invalidated by a rewritten arc', async () => {
    const { service } = fakeGate({
      phases: [phase({ steps: [step('briefs', { done: true })] })],
      arcs: [arc()],
      briefs: [
        { chapter: 1, staleReason: null },
        { chapter: 2, staleReason: 'arc_changed' },
      ],
      ledger: [arcsDecision],
    });

    const warning = (await service.readiness(7n)).warnings.find(item => item.kind === 'brief_stale');

    expect(warning).toMatchObject({ step: 'briefs' });
    expect(warning?.detail).toContain('chapter 2');
    expect(warning?.detail).not.toContain('arc_changed');
  });
});
