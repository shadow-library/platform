/**
 * The reveal chapter that means "open from the first word": a rule the whole book obeys rather than a truth it withholds. It is the
 * schedule the Blueprint mints world rules and power rungs at, and the only schedule a knowledge contract may not narrow away.
 */
export const OPEN_FROM_CHAPTER = 1;

export function isOpenCanon(revealChapter: number | null): boolean {
  return revealChapter !== null && revealChapter <= OPEN_FROM_CHAPTER;
}
