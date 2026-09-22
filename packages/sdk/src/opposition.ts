/** What can stand in a protagonist's way. Closed vocabulary: the Blueprint prompts offer it, the ledger stores it and the screens switch between its kinds. */

export const OPPOSITION_KINDS = ['person', 'system', 'nature', 'self', 'slice'] as const;

export type OppositionKind = (typeof OPPOSITION_KINDS)[number];

export const OPPOSITION_KIND_LABELS: Record<OppositionKind, string> = {
  person: 'A person',
  system: 'A system',
  nature: 'Nature or fate',
  self: 'Himself',
  slice: 'Nothing: slice of life',
};

export function isOppositionKind(value: unknown): value is OppositionKind {
  return typeof value === 'string' && OPPOSITION_KINDS.includes(value as OppositionKind);
}
