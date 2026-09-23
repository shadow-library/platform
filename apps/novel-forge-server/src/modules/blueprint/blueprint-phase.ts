import { type Ledger, schema } from '@server/database';

export const BLUEPRINT_PHASES: readonly Ledger.Phase[] = schema.blueprintPhase.enumValues;

/** The system entry that records the Workspace being opened. It belongs to no phase and is never retired. */
export const GATE_TOPIC = 'gate';

export const BLUEPRINT_PHASE_LABELS: Record<Ledger.Phase, string> = {
  idea: 'Idea',
  heart: 'Heart',
  core: 'Core',
  world: 'World',
  spine: 'Spine',
  volume_one: 'Volume one',
  opening: 'Opening',
};
