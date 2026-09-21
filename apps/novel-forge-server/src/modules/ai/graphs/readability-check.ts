import { computeReadabilityMetrics, LONG_SENTENCE_WORDS, type ReadabilityMetrics } from '../../eval/deterministic-metrics';

export const READABILITY_PREFIX = 'readability: ';

// Below this the averages are noise; a draft that short already carries a hard word-count finding.
export const READABILITY_MIN_WORDS = 400;

// House limits for the plain web-novel default. Crossing one never decides anything by itself: it marks the
// number as worth the judge's attention, and the judge weighs it against the project's own writing rules.

// Plain web-novel narration averages 10–15 words a sentence; literary prose runs past 20.
export const AVERAGE_SENTENCE_WORDS_MAX = 20;

// A long sentence now and then is rhythm; one in ten is a register.
export const LONG_SENTENCE_SHARE_MAX = 0.1;

// Dialogue lines and one-to-three-sentence narration paragraphs keep the average well under this.
export const AVERAGE_PARAGRAPH_WORDS_MAX = 70;

// Web fiction reads around grade 5–7; dense literary prose lands at 10 and above.
export const READING_GRADE_MAX = 9;

// Plain, dialogue-led narration scores near zero; one ornate construction every thousand words is already a
// habit. The floor keeps a single flourish in a short draft from counting as a rate.
export const ORNATE_HITS_PER_1000_WORDS_MAX = 1;
export const ORNATE_HITS_MIN = 3;

const FLAGGED_SENTENCES_MAX = 5;
const QUOTE_CHARS_MAX = 400;

export interface FlaggedSentence {
  sentence: string;
  reason: string;
}

export interface ReadabilityEvidence {
  metrics: ReadabilityMetrics;
  /** The house limits this draft crosses, each as "measured (limit)". */
  overLimits: string[];
  /** Ornate constructions first, then the longest sentences. */
  flagged: FlaggedSentence[];
}

function quote(text: string): string {
  return `"${text.length <= QUOTE_CHARS_MAX ? text : `${text.slice(0, QUOTE_CHARS_MAX)}…`}"`;
}

function percent(share: number): string {
  return `${(share * 100).toFixed(0)}%`;
}

function overLimits(metrics: ReadabilityMetrics): string[] {
  const crossed: string[] = [];
  if (metrics.averageSentenceWords > AVERAGE_SENTENCE_WORDS_MAX)
    crossed.push(`average sentence ${metrics.averageSentenceWords.toFixed(1)} words (limit ${AVERAGE_SENTENCE_WORDS_MAX})`);
  if (metrics.longSentenceShare > LONG_SENTENCE_SHARE_MAX)
    crossed.push(`sentences over ${LONG_SENTENCE_WORDS} words ${percent(metrics.longSentenceShare)} (limit ${percent(LONG_SENTENCE_SHARE_MAX)})`);
  if (metrics.averageParagraphWords > AVERAGE_PARAGRAPH_WORDS_MAX)
    crossed.push(`average paragraph ${metrics.averageParagraphWords.toFixed(0)} words (limit ${AVERAGE_PARAGRAPH_WORDS_MAX})`);
  if (metrics.readingGrade > READING_GRADE_MAX) crossed.push(`reading grade ${metrics.readingGrade.toFixed(1)} (limit ${READING_GRADE_MAX})`);
  if (metrics.ornateHits.length >= ORNATE_HITS_MIN && metrics.ornateHitsPer1000Words > ORNATE_HITS_PER_1000_WORDS_MAX)
    crossed.push(`ornate constructions ${metrics.ornateHitsPer1000Words.toFixed(1)} per 1,000 words (limit ${ORNATE_HITS_PER_1000_WORDS_MAX})`);
  return crossed;
}

/** Deterministic readability measurements for the judge to weigh; `null` for a draft too short to measure. */
export function assessReadability(body: string): ReadabilityEvidence | null {
  const metrics = computeReadabilityMetrics(body);
  if (metrics.words < READABILITY_MIN_WORDS) return null;
  const ornate = metrics.ornateHits.map(hit => ({ sentence: hit.sentence, reason: hit.label }));
  const long = metrics.longSentences.map(sentence => ({ sentence, reason: `over ${LONG_SENTENCE_WORDS} words` }));
  return { metrics, overLimits: overLimits(metrics), flagged: [...ornate, ...long].slice(0, FLAGGED_SENTENCES_MAX) };
}

function measurements({ metrics }: ReadabilityEvidence): string {
  return [
    `${metrics.words} words`,
    `average sentence ${metrics.averageSentenceWords.toFixed(1)} words`,
    `sentences over ${LONG_SENTENCE_WORDS} words ${percent(metrics.longSentenceShare)}`,
    `average paragraph ${metrics.averageParagraphWords.toFixed(0)} words`,
    `reading grade ${metrics.readingGrade.toFixed(1)}`,
    `ornate constructions ${metrics.ornateHits.length} (${metrics.ornateHitsPer1000Words.toFixed(1)} per 1,000 words)`,
  ].join(' · ');
}

/** The judge's `## READABILITY EVIDENCE` block. */
export function renderReadabilityEvidence(evidence: ReadabilityEvidence): string {
  const lines = ['## READABILITY EVIDENCE', measurements(evidence), `Over the default's limits: ${evidence.overLimits.join('; ') || 'none'}`];
  if (evidence.flagged.length > 0) lines.push('Flagged sentences:', ...evidence.flagged.map((entry, index) => `${index + 1}. ${quote(entry.sentence)} (${entry.reason})`));
  return lines.join('\n');
}

/** The line kept in the draft's judge note so the author sees the numbers; `null` when nothing crosses a limit. */
export function readabilityNote(evidence: ReadabilityEvidence | null): string | null {
  if (!evidence || evidence.overLimits.length === 0) return null;
  return `[info] ${READABILITY_PREFIX}measured ${measurements(evidence)}; over the default's limits: ${evidence.overLimits.join('; ')}`;
}
