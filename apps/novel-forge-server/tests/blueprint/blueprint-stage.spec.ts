import { describe, expect, it, mock } from 'bun:test';

import { blueprintStep, BlueprintStepRegistry } from '@modules/blueprint/engine/blueprint-step.registry';
import { type AnyBlueprintStep } from '@modules/blueprint/engine/blueprint-step.types';
import { deriveBlueprintStage, type ImportContent, importCoverage, isStepDone } from '@modules/blueprint/stage/blueprint-stage';
import { BlueprintStageService } from '@modules/blueprint/stage/blueprint-stage.service';
import { promiseDrivers } from '@modules/blueprint/stage/promise-tailoring';
import { startStep } from '@modules/blueprint/steps/start.step';
import { type Ledger } from '@server/database';

import { engineCoreScreen, enginePass, engineWorldScreen, ledgerEntry } from './blueprint-fixtures';

function screen(key: string, phase: Ledger.Phase, completionTopics: string[], extra: Partial<typeof startStep> = {}): AnyBlueprintStep {
  return blueprintStep({ ...startStep, key, phase, required: true, completionTopics, ...extra });
}

const drivesProgression = (ledger: Ledger.Entry[]): boolean => promiseDrivers(ledger).includes('progression');

const STEPS = [
  blueprintStep(startStep),
  screen('premise', 'idea', ['premise']),
  screen('promise', 'heart', ['promise']),
  screen('protagonist', 'core', ['protagonist']),
  screen('world_rules', 'world', ['world.rules']),
  screen('power_ladder', 'world', ['world.power'], { appliesWhen: drivesProgression }),
];

function decision(topic: string, overrides: Partial<Ledger.Entry> = {}): Ledger.Entry {
  return ledgerEntry({ kind: 'decision', topic, stepKey: topic, payload: null, ...overrides });
}

function derive(ledger: Ledger.Entry[], flags: { hasBriefs?: boolean; hasStepEntries?: boolean } = {}) {
  return deriveBlueprintStage({ steps: STEPS, ledger, hasBriefs: flags.hasBriefs ?? false, hasStepEntries: flags.hasStepEntries ?? ledger.length > 0 });
}

function statuses(ledger: Ledger.Entry[], flags?: { hasBriefs?: boolean; hasStepEntries?: boolean }): string[] {
  return derive(ledger, flags).phases.map(phase => `${phase.phase}:${phase.status}`);
}

describe('deriveBlueprintStage phases', () => {
  it('should open a fresh project on Idea with every later phase locked behind the one above it', () => {
    const derived = derive([]);

    expect(derived.stage).toBe('blueprint');
    expect(derived.phases.map(phase => phase.label)).toEqual(['Idea', 'Heart', 'Core', 'World', 'Spine', 'Volume one', 'Opening']);
    expect(derived.phases[0]?.status).toBe('current');
    expect(derived.phases[0]?.lockReason).toBeUndefined();
    expect(derived.phases[1]).toMatchObject({ status: 'locked', lockReason: 'Opens when Idea is complete' });
    expect(derived.phases[6]).toMatchObject({ status: 'locked', lockReason: 'Opens when Volume one is complete' });
  });

  it('should list each phase’s screens with whether they are required, apply and are done', () => {
    const idea = derive([ledgerEntry({ kind: 'direction', topic: 'start' })]).phases[0];
    expect(idea?.steps).toEqual([
      { key: 'start', required: false, applies: true, done: true },
      { key: 'premise', required: true, applies: true, done: false },
    ]);
  });

  it('should finish a phase only through active decision or system entries on every completion topic', () => {
    expect(statuses([ledgerEntry({ kind: 'direction', topic: 'premise' })]).slice(0, 2)).toEqual(['idea:current', 'heart:locked']);
    expect(statuses([decision('premise')]).slice(0, 3)).toEqual(['idea:done', 'heart:current', 'core:locked']);
    expect(statuses([decision('premise', { kind: 'system', decidedBy: 'system' })])[0]).toBe('idea:done');
  });

  it('should never finish a phase through an optional step, nor a phase with no required step yet', () => {
    const optionalOnly = deriveBlueprintStage({ steps: [blueprintStep(startStep)], ledger: [ledgerEntry()], hasBriefs: false, hasStepEntries: true });
    expect(optionalOnly.phases[0]).toMatchObject({ status: 'current', steps: [{ key: 'start', done: true }] });

    const spine = derive([decision('premise'), decision('promise'), decision('protagonist'), decision('world.rules')]).phases[4];
    expect(spine).toMatchObject({ phase: 'spine', status: 'current', steps: [] });
  });

  it('should keep a phase done after an unfinished one, and lock the rest behind the nearest unfinished phase above', () => {
    const derived = derive([decision('premise'), decision('protagonist')]);

    expect(derived.phases.slice(0, 4).map(phase => `${phase.phase}:${phase.status}`)).toEqual(['idea:done', 'heart:current', 'core:done', 'world:locked']);
    expect(derived.phases[3]?.lockReason).toBe('Opens when Heart is complete');
  });

  it('should skip a step whose appliesWhen says the novel does not call for it', () => {
    const settled = [decision('premise'), decision('protagonist'), decision('world.rules')];
    const quiet = derive([...settled, decision('promise', { payload: { drivers: ['slice_of_life'] } })]).phases[3];
    const progression = derive([...settled, decision('promise', { payload: { drivers: ['progression'] } })]).phases[3];

    expect(quiet).toMatchObject({
      status: 'done',
      steps: [
        { key: 'world_rules', applies: true },
        { key: 'power_ladder', applies: false, done: false },
      ],
    });
    expect(progression).toMatchObject({ status: 'current', steps: [{ key: 'world_rules' }, { key: 'power_ladder', applies: true, done: false }] });
  });
});

describe('deriveBlueprintStage stage', () => {
  it('should move to the Workspace at the gate and leave every unfinished phase open, never locked', () => {
    const derived = derive([decision('premise'), ledgerEntry({ kind: 'system', topic: 'gate', phase: null, decidedBy: 'system' })]);

    expect(derived.stage).toBe('workspace');
    expect(derived.imported).toBe(false);
    expect(derived.phases.slice(0, 3).map(phase => phase.status)).toEqual(['done', 'open', 'open']);
    expect(derived.phases.every(phase => phase.lockReason === undefined)).toBe(true);
  });

  it('should ignore a gate that is only a direction', () => {
    expect(derive([ledgerEntry({ kind: 'direction', topic: 'gate' })]).stage).toBe('blueprint');
  });

  it('should treat chapter briefs with no entry any step wrote as an import in the Workspace', () => {
    expect(derive([], { hasBriefs: true, hasStepEntries: false })).toMatchObject({ stage: 'workspace', imported: true });
    expect(derive([ledgerEntry({ kind: 'direction', topic: 'taste', stepKey: null })], { hasBriefs: true, hasStepEntries: false }).imported).toBe(true);
    expect(derive([], { hasBriefs: true, hasStepEntries: true })).toMatchObject({ stage: 'blueprint', imported: false });
    expect(derive([], { hasBriefs: false, hasStepEntries: false })).toMatchObject({ stage: 'blueprint', imported: false });
  });
});

describe('promiseDrivers', () => {
  it('should read the decided promise’s drivers and nothing else', () => {
    expect(promiseDrivers([])).toEqual([]);
    expect(promiseDrivers([decision('promise', { payload: null })])).toEqual([]);
    expect(promiseDrivers([ledgerEntry({ kind: 'direction', topic: 'promise', payload: { drivers: ['mystery'] } })])).toEqual([]);
    expect(promiseDrivers([decision('promise', { payload: { drivers: ['mystery', 3, 'romance'] } })])).toEqual(['mystery', 'romance']);
  });
});

describe('isStepDone', () => {
  it('should need every completion topic of a required step, and accept a topic prefix', () => {
    const step = { key: 'spine', required: true, completionTopics: ['spine', 'spine.reveals'] };
    expect(isStepDone(step, [decision('spine')])).toBe(false);
    expect(isStepDone(step, [decision('spine'), decision('spine.reveals')])).toBe(true);
    expect(isStepDone({ key: 'check', required: true, completionTopics: ['check.*'] }, [decision('check.timeline')])).toBe(true);
  });

  it('should count an optional step done only by what its own lock wrote', () => {
    const step = { key: 'taste', required: false, completionTopics: ['taste', 'taste.gave_up'] };
    const steering = ledgerEntry({ kind: 'rejected', topic: 'taste', stepKey: null });
    const locked = ledgerEntry({ kind: 'direction', topic: 'taste.gave_up', stepKey: 'taste' });

    expect(isStepDone(step, [steering])).toBe(false);
    expect(isStepDone(step, [ledgerEntry({ kind: 'direction', topic: 'taste', stepKey: 'concepts' })])).toBe(false);
    expect(isStepDone(step, [steering, locked])).toBe(true);
  });
});

describe('BlueprintStepRegistry.applies', () => {
  it('should apply a pass when any screen it feeds applies', () => {
    const never = () => false;
    const registry = new BlueprintStepRegistry([blueprintStep(enginePass), blueprintStep(engineCoreScreen), blueprintStep({ ...engineWorldScreen, appliesWhen: never })]);
    const idle = new BlueprintStepRegistry([
      blueprintStep(enginePass),
      blueprintStep({ ...engineCoreScreen, appliesWhen: never }),
      blueprintStep({ ...engineWorldScreen, appliesWhen: never }),
    ]);

    expect(registry.applies('engine_world', [])).toBe(false);
    expect(registry.applies('engine', [])).toBe(true);
    expect(idle.applies('engine', [])).toBe(false);
  });
});

const EMPTY: ImportContent = {
  projectPremise: false,
  premiseDocument: false,
  readerPromiseDocument: false,
  worldDocuments: 0,
  plotDocuments: 0,
  voiceDocuments: 0,
  roleCharacters: 0,
  majorCharacters: 0,
  volumes: 0,
  firstVolumeArcs: 0,
  briefs: 0,
};

describe('importCoverage', () => {
  it('should cover every phase of a full import and block nothing', () => {
    const coverage = importCoverage({
      ...EMPTY,
      premiseDocument: true,
      readerPromiseDocument: true,
      worldDocuments: 2,
      voiceDocuments: 1,
      roleCharacters: 1,
      volumes: 3,
      firstVolumeArcs: 4,
      briefs: 12,
    });

    expect(coverage.phases.map(phase => `${phase.label}: ${phase.evidence}`)).toEqual([
      'Idea: Premise page',
      'Heart: Reader promise page',
      'Core: 1 character named as protagonist or antagonist',
      'World: 2 world or power pages',
      'Spine: 3 volumes planned',
      'Volume one: 4 arcs in the first volume',
      'Opening: 12 chapter briefs',
    ]);
    expect(coverage.phases.every(phase => phase.covered && !phase.blocking)).toBe(true);
    expect(coverage).toMatchObject({ voice: { covered: true }, blocking: false });
  });

  it('should fall back to the project premise, major characters and plot pages', () => {
    const coverage = importCoverage({ ...EMPTY, projectPremise: true, majorCharacters: 2, plotDocuments: 1, volumes: 0, briefs: 1 });
    const byPhase = new Map(coverage.phases.map(phase => [phase.phase, phase]));

    expect(byPhase.get('idea')).toMatchObject({ covered: true, evidence: "The project's premise" });
    expect(byPhase.get('core')).toMatchObject({ covered: true, evidence: '2 major characters, none named as protagonist or antagonist' });
    expect(byPhase.get('spine')).toMatchObject({ covered: true, evidence: '1 plot page' });
    expect(byPhase.get('volume_one')).toMatchObject({ covered: false, evidence: 'No volumes yet', blocking: false });
  });

  it('should block only on missing chapter briefs and recommend a voice page', () => {
    const coverage = importCoverage({ ...EMPTY, volumes: 1 });

    expect(coverage.phases.filter(phase => phase.blocking).map(phase => phase.phase)).toEqual(['opening']);
    expect(coverage.phases.find(phase => phase.phase === 'volume_one')?.evidence).toBe('The first volume has no arcs');
    expect(coverage.voice.covered).toBe(false);
    expect(coverage.blocking).toBe(true);
  });
});

function fakeStageService(rows: object[], active: Ledger.Entry[] = []) {
  const queue = [...rows];
  const run = mock(() => [queue.shift()]);
  const query = { orderBy: () => query, limit: () => query, then: (resolve: (value: unknown) => void) => resolve(run()) };
  const db = {
    query: { decisionLedgerEntries: { findMany: mock(async () => active) } },
    select: mock(() => ({ from: () => ({ where: () => query }) })),
  };
  const service = new BlueprintStageService({ getPostgresClient: () => db } as never, new BlueprintStepRegistry(STEPS));
  return { service, db, run };
}

describe('BlueprintStageService.progress', () => {
  it('should report null for every kind but an original novel, without reading anything', async () => {
    const { service, db } = fakeStageService([]);

    expect(await service.progress({ id: 7n, kind: 'translation' })).toBeNull();
    expect(await service.progress({ id: 7n, kind: 'source' })).toBeNull();
    expect(db.select).not.toHaveBeenCalled();
    expect(db.query.decisionLedgerEntries.findMany).not.toHaveBeenCalled();
  });

  it('should derive a Blueprint project’s phases without reading its content', async () => {
    const { service, run } = fakeStageService([{ hasBriefs: false, hasStepEntries: true }], [decision('premise')]);

    const progress = await service.progress({ id: 7n, kind: 'new_novel' });

    expect(progress?.stage).toBe('blueprint');
    expect(progress?.phases.slice(0, 2).map(phase => `${phase.phase}:${phase.status}`)).toEqual(['idea:done', 'heart:current']);
    expect(progress?.importCoverage).toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('should add coverage for an import', async () => {
    const { service } = fakeStageService([
      { hasBriefs: true, hasStepEntries: false },
      { ...EMPTY, premiseDocument: 1, briefs: 5 },
    ]);

    const progress = await service.progress({ id: 7n, kind: 'new_novel' });

    expect(progress?.stage).toBe('workspace');
    expect(progress?.importCoverage?.phases[0]).toMatchObject({ phase: 'idea', covered: true, evidence: 'Premise page' });
    expect(progress?.importCoverage?.blocking).toBe(false);
  });
});
