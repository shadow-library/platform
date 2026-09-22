import { type Ledger, schema } from '@server/database';

export const BLUEPRINT_PHASES: readonly Ledger.Phase[] = schema.blueprintPhase.enumValues;

export const BLUEPRINT_PHASE_LABELS: Record<Ledger.Phase, string> = {
  idea: 'Idea',
  heart: 'Heart',
  core: 'Core',
  world: 'World',
  spine: 'Spine',
  volume_one: 'Volume one',
  opening: 'Opening',
};
