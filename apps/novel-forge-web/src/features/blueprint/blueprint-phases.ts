import { type BlueprintPhase, type BlueprintPhaseProgressResponse, type BlueprintStepProgressResponse } from '@/lib/apis';

export const BLUEPRINT_PHASE_COUNT = 7;

export type BlueprintAltitude = 'The novel' | 'The engine' | 'The shape' | 'Up close';

/**
 * The altitude a phase sits at. It is presentation, not data — the server orders the phases and the
 * altitudes only say where the run is cut, so a phase never appears in two of them.
 */
const PHASE_ALTITUDE: Record<BlueprintPhase, BlueprintAltitude> = {
  idea: 'The novel',
  heart: 'The novel',
  core: 'The engine',
  world: 'The engine',
  spine: 'The shape',
  volume_one: 'Up close',
  opening: 'Up close',
};

export const BLUEPRINT_PHASE_LABELS: Record<BlueprintPhase, string> = {
  idea: 'Idea',
  heart: 'Heart',
  core: 'Core',
  world: 'World',
  spine: 'Spine',
  volume_one: 'Volume one',
  opening: 'Opening',
};

export function blueprintAltitude(phase: BlueprintPhase): BlueprintAltitude {
  return PHASE_ALTITUDE[phase];
}

export function blueprintPhaseLabel(phase: BlueprintPhase): string {
  return BLUEPRINT_PHASE_LABELS[phase];
}

export interface BlueprintAltitudeGroup {
  altitude: BlueprintAltitude;
  phases: BlueprintPhaseProgressResponse[];
}

/** The phases in the order the server sent them, cut where the altitude changes. */
export function groupPhasesByAltitude(phases: BlueprintPhaseProgressResponse[]): BlueprintAltitudeGroup[] {
  const groups: BlueprintAltitudeGroup[] = [];
  for (const phase of phases) {
    const altitude = blueprintAltitude(phase.phase);
    const current = groups.at(-1);
    if (current?.altitude === altitude) current.phases.push(phase);
    else groups.push({ altitude, phases: [phase] });
  }
  return groups;
}

/** A step the reader promise rules out is not a step the author can open — it never holds its phase back either. */
export function applicableSteps(phase: BlueprintPhaseProgressResponse): BlueprintStepProgressResponse[] {
  return phase.steps.filter(step => step.applies);
}

export function findPhaseOfStep(phases: BlueprintPhaseProgressResponse[], stepKey: string): BlueprintPhaseProgressResponse | null {
  return phases.find(phase => phase.steps.some(step => step.key === stepKey)) ?? null;
}

/** 1-based position for the "Phase N of 7" header; 0 when the phase is not in the list. */
export function phasePosition(phases: BlueprintPhaseProgressResponse[], phase: BlueprintPhase): number {
  return phases.findIndex(candidate => candidate.phase === phase) + 1;
}

export type BlueprintEntry = { kind: 'gate' } | { kind: 'step'; step: string } | { kind: 'unreachable' };

/** Every required step the novel actually needs; an optional one the author skipped never holds the Blueprint open. */
export function requiredSteps(phase: BlueprintPhaseProgressResponse): BlueprintStepProgressResponse[] {
  return phase.steps.filter(step => step.applies && step.required);
}

/**
 * The same test the server makes a phase `done` by, phase for phase: a phase with no required step that
 * applies has not been settled, it has nothing to settle yet, so it can never carry the Blueprint to
 * the gate on its own.
 */
export function blueprintComplete(phases: BlueprintPhaseProgressResponse[]): boolean {
  return (
    phases.length > 0 &&
    phases.every(phase => {
      const counted = requiredSteps(phase);
      return counted.length > 0 && counted.every(step => step.done);
    })
  );
}

/**
 * Where `/blueprint` sends the author: the gate once every required step that applies is done, then the
 * current phase's first unfinished applicable step, then the first unfinished step of any other unlocked
 * phase. `unreachable` is what is left when only a locked phase still has a step — the state a Blueprint
 * whose later phases are still being built ends in.
 */
export function blueprintEntry(phases: BlueprintPhaseProgressResponse[]): BlueprintEntry {
  if (blueprintComplete(phases)) return { kind: 'gate' };
  const step = firstUnfinishedStep(phases);
  return step != null ? { kind: 'step', step } : { kind: 'unreachable' };
}

/** The current phase's first unfinished applicable step, then any other unlocked phase's. */
function firstUnfinishedStep(phases: BlueprintPhaseProgressResponse[]): string | null {
  const reachable = phases.filter(phase => phase.status !== 'locked');
  const current = reachable.find(phase => phase.status === 'current');
  const ordered = current ? [current, ...reachable.filter(phase => phase !== current)] : reachable;
  for (const phase of ordered) {
    const next = applicableSteps(phase).find(step => !step.done);
    if (next) return next.key;
  }
  return null;
}

/**
 * Where "Keep refining" goes from the gate: whatever the author has not settled yet — an optional step they
 * skipped is exactly what "refine" means here — and failing that the last step they could have locked,
 * which is where they just were. Null only when the Blueprint offers no step at all.
 */
export function keepRefiningStep(phases: BlueprintPhaseProgressResponse[]): string | null {
  const unfinished = firstUnfinishedStep(phases);
  if (unfinished != null) return unfinished;
  for (const phase of [...phases].reverse()) {
    const last = applicableSteps(phase).at(-1);
    if (last) return last.key;
  }
  return null;
}
