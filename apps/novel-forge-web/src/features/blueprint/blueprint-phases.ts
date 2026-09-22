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

/**
 * Where `/blueprint` sends the author: the current phase's first unfinished applicable step, then the
 * first unfinished step of any other unlocked phase. Null once every reachable step is done — the state a
 * Blueprint whose later phases are still being built ends in, and what the shell shows a message for
 * instead of a step that would only repeat itself.
 */
export function blueprintEntryStep(phases: BlueprintPhaseProgressResponse[]): string | null {
  const reachable = phases.filter(phase => phase.status !== 'locked');
  const current = reachable.find(phase => phase.status === 'current');
  const ordered = current ? [current, ...reachable.filter(phase => phase !== current)] : reachable;
  for (const phase of ordered) {
    const next = applicableSteps(phase).find(step => !step.done);
    if (next) return next.key;
  }
  return null;
}
