import { escapeRegExp } from './term-text';

// Terms shorter than this are too collision-prone to match.
const MIN_REVEAL_TERM_LENGTH = 3;

/**
 * A canon fact's give-away term as a whole-word pattern, or null when it is too short to match. A term carrying a
 * capital is a name, matched case-sensitively so "Will" never fires on "will". The planner guard and the writer scrub
 * share it, so a term the guard lets through is exactly a term the scrub withholds.
 */
export function revealTermPattern(term: string, global = false): RegExp | null {
  const trimmed = term.trim();
  if (trimmed.length < MIN_REVEAL_TERM_LENGTH) return null;
  const flags = `${global ? 'g' : ''}${/\p{Lu}/u.test(trimmed) ? 'u' : 'iu'}`;
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(trimmed)}(?![\\p{L}\\p{N}_])`, flags);
}
