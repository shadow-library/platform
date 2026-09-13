export const OPENING_CHAPTER_COUNT = 2;
export const SAMPLE_CHAPTER_COUNT = 6;

/**
 * Picks the chapters a seed pass reads: the first `openingCount` (full setup context) plus up to
 * `sampleCount` more spread evenly across whatever remains, so a major character introduced late in
 * a long novel still lands in the seed bible instead of only ever surfacing as a repair-pass discovery.
 */
export function selectSeedSampleChapters(chapterNumbers: number[], openingCount = OPENING_CHAPTER_COUNT, sampleCount = SAMPLE_CHAPTER_COUNT): number[] {
  const opening = chapterNumbers.slice(0, openingCount);
  const rest = chapterNumbers.slice(openingCount);
  if (rest.length === 0 || rest.length <= sampleCount) return [...opening, ...rest];
  if (sampleCount <= 1) return [...opening, ...(rest[0] !== undefined ? [rest[0]] : [])];

  const picked: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const value = rest[Math.round((i * (rest.length - 1)) / (sampleCount - 1))];
    if (value !== undefined && !picked.includes(value)) picked.push(value);
  }
  return [...opening, ...picked];
}
