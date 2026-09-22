import { type Ledger } from '@server/database';

import { BLUEPRINT_PHASE_LABELS, BLUEPRINT_PHASES } from '../blueprint-phase';
import { type AnyBlueprintStep, type AnyLockingStep, isLocking } from '../engine/blueprint-step.types';
import { filterLedgerEntries } from '../ledger/ledger-entries';

export const GATE_TOPIC = 'gate';
export const READER_PROMISE_TOPIC = 'promise';

export type BlueprintStage = 'blueprint' | 'workspace';
export type BlueprintPhaseStatus = 'done' | 'current' | 'locked' | 'open';

type StageLedgerEntry = Pick<Ledger.Entry, 'kind' | 'phase' | 'topic' | 'payload'>;

export interface BlueprintStepProgress {
  key: string;
  required: boolean;
  applies: boolean;
  done: boolean;
}

export interface BlueprintPhaseProgress {
  phase: Ledger.Phase;
  label: string;
  status: BlueprintPhaseStatus;
  lockReason?: string;
  steps: BlueprintStepProgress[];
}

export interface StageInputs {
  steps: readonly AnyBlueprintStep[];
  /** Active entries only. */
  ledger: Ledger.Entry[];
  hasBriefs: boolean;
  /** Whether any entry, active or retired, was written by a step's lock. */
  hasStepEntries: boolean;
}

export interface StageDerivation {
  stage: BlueprintStage;
  /** A plan that reached the Workspace without the Blueprint: briefs, and no entry any step's lock wrote. */
  imported: boolean;
  phases: BlueprintPhaseProgress[];
}

export interface ImportContent {
  projectPremise: boolean;
  premiseDocument: boolean;
  readerPromiseDocument: boolean;
  worldDocuments: number;
  plotDocuments: number;
  voiceDocuments: number;
  roleCharacters: number;
  majorCharacters: number;
  volumes: number;
  firstVolumeArcs: number;
  briefs: number;
}

export interface CoverageItem {
  covered: boolean;
  evidence: string;
}

export interface ImportPhaseCoverage extends CoverageItem {
  phase: Ledger.Phase;
  label: string;
  /** Only a missing chapter brief stops generation; every other gap is a recommendation. */
  blocking: boolean;
}

export interface ImportCoverage {
  phases: ImportPhaseCoverage[];
  voice: CoverageItem;
  blocking: boolean;
}

const DECIDED_KINDS: Ledger.Kind[] = ['decision', 'system'];

function isDecided(entry: StageLedgerEntry): boolean {
  return DECIDED_KINDS.includes(entry.kind);
}

/** The reader promise's drivers (T7 writes them as `payload.drivers`); none until the promise is decided. */
export function promiseDrivers(ledger: StageLedgerEntry[]): string[] {
  const promise = [...ledger].reverse().find(entry => entry.topic === READER_PROMISE_TOPIC && isDecided(entry));
  const drivers = (promise?.payload as { drivers?: unknown } | null | undefined)?.drivers;
  return Array.isArray(drivers) ? drivers.filter((driver): driver is string => typeof driver === 'string') : [];
}

export function hasGate(ledger: StageLedgerEntry[]): boolean {
  return ledger.some(entry => entry.kind === 'system' && entry.topic === GATE_TOPIC);
}

export function isStepDone(step: Pick<AnyLockingStep, 'required' | 'completionTopics'>, ledger: StageLedgerEntry[]): boolean {
  if (!step.required) return filterLedgerEntries(ledger, { topics: [...step.completionTopics] }).length > 0;
  const decided = ledger.filter(isDecided);
  return step.completionTopics.every(topic => filterLedgerEntries(decided, { topics: [topic] }).length > 0);
}

function stepProgress(step: AnyLockingStep, ledger: Ledger.Entry[]): BlueprintStepProgress {
  return { key: step.key, required: step.required, applies: step.appliesWhen?.(ledger) ?? true, done: isStepDone(step, ledger) };
}

function isPhaseDone(steps: BlueprintStepProgress[]): boolean {
  const counted = steps.filter(step => step.required && step.applies);
  return counted.length > 0 && counted.every(step => step.done);
}

/**
 * A phase is locked behind the nearest unfinished phase above it, so a phase finished before a revisit stays done and names what it
 * actually waits on. In the Workspace nothing is locked: an unfinished phase is open to reopen.
 */
export function blueprintPhases(steps: readonly AnyBlueprintStep[], ledger: Ledger.Entry[], stage: BlueprintStage): BlueprintPhaseProgress[] {
  const screens = steps.filter(isLocking);
  let unfinished: Ledger.Phase | null = null;
  return BLUEPRINT_PHASES.map(phase => {
    const progress = screens.filter(step => step.phase === phase).map(step => stepProgress(step, ledger));
    const base = { phase, label: BLUEPRINT_PHASE_LABELS[phase], steps: progress };
    if (isPhaseDone(progress)) return { ...base, status: 'done' };
    if (stage === 'workspace') return { ...base, status: 'open' };

    const blocker = unfinished;
    unfinished = phase;
    if (blocker === null) return { ...base, status: 'current' };
    return { ...base, status: 'locked', lockReason: `Opens when ${BLUEPRINT_PHASE_LABELS[blocker]} is complete` };
  });
}

export function deriveBlueprintStage(inputs: StageInputs): StageDerivation {
  const imported = inputs.hasBriefs && !inputs.hasStepEntries;
  const stage: BlueprintStage = imported || hasGate(inputs.ledger) ? 'workspace' : 'blueprint';
  return { stage, imported, phases: blueprintPhases(inputs.steps, inputs.ledger, stage) };
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function covered(evidence: string): CoverageItem {
  return { covered: true, evidence };
}

function missing(evidence: string): CoverageItem {
  return { covered: false, evidence };
}

function ideaCoverage(content: ImportContent): CoverageItem {
  if (content.premiseDocument) return covered('Premise page');
  if (content.projectPremise) return covered("The project's premise");
  return missing('No premise yet');
}

function heartCoverage(content: ImportContent): CoverageItem {
  return content.readerPromiseDocument ? covered('Reader promise page') : missing('No reader promise page');
}

function coreCoverage(content: ImportContent): CoverageItem {
  if (content.roleCharacters > 0) return covered(`${count(content.roleCharacters, 'character')} named as protagonist or antagonist`);
  if (content.majorCharacters > 0) return covered(`${count(content.majorCharacters, 'major character')}, none named as protagonist or antagonist`);
  return missing('No protagonist, antagonist or major character');
}

function worldCoverage(content: ImportContent): CoverageItem {
  return content.worldDocuments > 0 ? covered(count(content.worldDocuments, 'world or power page')) : missing('No world or power pages');
}

function spineCoverage(content: ImportContent): CoverageItem {
  if (content.volumes > 0) return covered(`${count(content.volumes, 'volume')} planned`);
  if (content.plotDocuments > 0) return covered(count(content.plotDocuments, 'plot page'));
  return missing('No volumes or plot pages');
}

function volumeOneCoverage(content: ImportContent): CoverageItem {
  if (content.firstVolumeArcs > 0) return covered(`${count(content.firstVolumeArcs, 'arc')} in the first volume`);
  return missing(content.volumes > 0 ? 'The first volume has no arcs' : 'No volumes yet');
}

function openingCoverage(content: ImportContent): CoverageItem {
  return content.briefs > 0 ? covered(count(content.briefs, 'chapter brief')) : missing('No chapter briefs, so no chapter can be generated');
}

const PHASE_COVERAGE: Record<Ledger.Phase, (content: ImportContent) => CoverageItem> = {
  idea: ideaCoverage,
  heart: heartCoverage,
  core: coreCoverage,
  world: worldCoverage,
  spine: spineCoverage,
  volume_one: volumeOneCoverage,
  opening: openingCoverage,
};

/** What an imported plan already settles, phase by phase, read from its content rather than a ledger it never had. */
export function importCoverage(content: ImportContent): ImportCoverage {
  const phases = BLUEPRINT_PHASES.map(phase => {
    const item = PHASE_COVERAGE[phase](content);
    return { phase, label: BLUEPRINT_PHASE_LABELS[phase], ...item, blocking: phase === 'opening' && !item.covered };
  });
  const voice = content.voiceDocuments > 0 ? covered('Voice or pacing and tone page') : missing('No voice or pacing and tone page; chapters use the default style');
  return { phases, voice, blocking: phases.some(phase => phase.blocking) };
}
