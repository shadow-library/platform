import { type OppositionKind } from '@shadow-library/sdk';

/** Which kinds put a named someone on the page, and so materialise an entity of their own. Policy, not vocabulary: the kinds themselves live in the SDK. */
export const OPPOSITION_ENTITY_KINDS: Record<OppositionKind, 'character' | 'faction' | null> = {
  person: 'character',
  system: 'faction',
  nature: null,
  self: null,
  slice: null,
};
