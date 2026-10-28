import { proseOnly, splitChapterProse } from '../../eval/chapter-prose';
import {
  computeCrossChapterRepeatedNgrams,
  computeDialogueTagMetrics,
  computeStockPhraseCounts,
  countWords,
  ngrams,
  type ResolvedWordTarget,
  resolveWordTarget,
  tokenizeWords,
} from '../../eval/deterministic-metrics';
import { type JudgeFinding } from '../schemas';

export const MECHANICAL_PREFIX = 'mechanical: ';

// Slack either side of the target band: past these the draft is a truncation or a runaway, not a
// chapter that ran long or short. Applied to the *resolved* (possibly project-overridden) band, so a
// project with a wider target also gets a wider hard wall.
export const WORD_COUNT_HARD_SLACK = 600;

/** Hard truncation/runaway bounds for a resolved word target — `target.min/max ± WORD_COUNT_HARD_SLACK`. */
export function resolveWordCountHardBounds(target: ResolvedWordTarget): { min: number; max: number } {
  return { min: target.min - WORD_COUNT_HARD_SLACK, max: target.max + WORD_COUNT_HARD_SLACK };
}

// Default-band hard bounds — kept as constants since tests and callers with no project in hand reach for
// these directly; a project override goes through `resolveWordCountHardBounds(resolveWordTarget(project))`.
export const WORD_COUNT_HARD_MIN = resolveWordCountHardBounds(resolveWordTarget()).min;
export const WORD_COUNT_HARD_MAX = resolveWordCountHardBounds(resolveWordTarget()).max;

// Short paragraphs repeat legitimately (a shouted name, a one-line refrain); at 20+ words a verbatim
// repeat is a generation defect, not a stylistic echo.
export const DUPLICATE_PARAGRAPH_MIN_WORDS = 20;

// Share of this chapter's 5–8-grams that also appear in the prior window. Ordinary prose reuses names,
// places and stock connectives, so a few percent is normal; 5% means whole clauses are being recycled.
const CROSS_CHAPTER_NGRAM_RATE_MAX = 0.05;

// The stock-phrase list is ~20 of the most overused reactions; more than five hits in one chapter means
// the draft is leaning on them as its default beat.
const STOCK_PHRASE_MAX = 5;

// A dialogue-heavy chapter runs ~15 tags per 1,000 words; past 25 the tags are crowding the prose.
const DIALOGUE_TAGS_PER_1000_MAX = 25;

// Rate is only meaningful once there are enough tags to rate; below this the denominator is noise.
const DIALOGUE_TAG_RATE_MIN_SAMPLE = 10;

// "Said" should carry most attributions; a majority of exotic alternatives is the classic said-bookism tell.
const SAID_ALTERNATIVE_RATE_MAX = 0.5;

// Narration only, so a character's "I'd like a word" never counts. A frame is flagged once it passes both: the rate
// alone would flag a short draft on three hits, the count alone a long one on a normal spread of similes.
const SIMILE_FRAME_PER_1000_MAX = 2;
const SIMILE_FRAME_MIN_COUNT = 5;

export interface SimileFrame {
  label: string;
  pattern: RegExp;
}

export const SIMILE_FRAMES: SimileFrame[] = [
  { label: 'like a', pattern: /(?<!\b(?:i|you|we|they|would|do|does|did|to|might|may|could|should|will|\w+n['’]t)\s)(?<!['’]d\s)\blike an?\b/gi },
  { label: 'like she was', pattern: /\blike (?:he|she|they|it)(?:['’]d)? (?:was|were|had|could|would|might)\b/gi },
  { label: 'the way a', pattern: /(?<!\b(?:on|by)\s)\bthe way (?:a|an|one|someone|somebody|people|you)\b/gi },
  { label: 'the kind of', pattern: /\bthe (?:kind|sort) of\b/gi },
];

// ‘ opens a quote only at a word start and ’ closes one only before a non-letter, so "don’t" and "’em" stay narration.
const DIALOGUE = /“[^”]*”|"[^"]*"|(?<=^|\s)‘.*?’(?!\p{L})/gu;
const OPEN_QUOTE = /[“"]|(?<=^|\s)‘/u;

function withoutDialogue(paragraph: string): string {
  const unquoted = paragraph.replace(DIALOGUE, ' ');
  const openQuote = unquoted.search(OPEN_QUOTE);
  return openQuote === -1 ? unquoted : unquoted.slice(0, openQuote);
}

export interface SimileFrameOveruse {
  label: string;
  count: number;
  per1000Words: number;
}

/** Comparison frames the narration leans on, measured against all prose words. */
export function findSimileFrameOveruse(body: string): SimileFrameOveruse[] {
  const words = countWords(body);
  if (words === 0) return [];
  const narration = body
    .split(/\n\s*\n/)
    .map(withoutDialogue)
    .join('\n\n');
  return SIMILE_FRAMES.map(frame => {
    const count = narration.match(frame.pattern)?.length ?? 0;
    return { label: frame.label, count, per1000Words: (count / words) * 1000 };
  }).filter(frame => frame.count >= SIMILE_FRAME_MIN_COUNT && frame.per1000Words > SIMILE_FRAME_PER_1000_MAX);
}

// How much of the opening/closing to compare for a boundary echo, and how long a shared run has to be
// before it's unambiguously the same sentence rather than incidental phrase reuse (e.g. a character's
// name and a stock verb landing in both windows by chance).
const BOUNDARY_ECHO_WINDOW_WORDS = 60;
const BOUNDARY_ECHO_NGRAM_SIZE = 6;

/**
 * Detects an opening that repeats the previous chapter's closing (last ~60 words vs first ~60): the model echoed the shown context instead of continuing; a shared run at
 * the seam is never coincidental.
 */
export function findBoundaryEcho(body: string, prevBody: string | undefined): string | null {
  if (!prevBody) return null;
  const opening = tokenizeWords(body).slice(0, BOUNDARY_ECHO_WINDOW_WORDS);
  const closing = tokenizeWords(prevBody).slice(-BOUNDARY_ECHO_WINDOW_WORDS);
  if (opening.length < BOUNDARY_ECHO_NGRAM_SIZE || closing.length < BOUNDARY_ECHO_NGRAM_SIZE) return null;
  const openingGrams = new Set(ngrams(opening, BOUNDARY_ECHO_NGRAM_SIZE));
  const shared = ngrams(closing, BOUNDARY_ECHO_NGRAM_SIZE).find(gram => openingGrams.has(gram));
  return shared ?? null;
}

function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function findDuplicatedParagraphs(body: string, minWords: number = DUPLICATE_PARAGRAPH_MIN_WORDS): string[] {
  const counts = new Map<string, number>();
  for (const paragraph of splitParagraphs(body)) {
    if (countWords(paragraph) < minWords) continue;
    counts.set(paragraph, (counts.get(paragraph) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count >= 2).map(([paragraph]) => paragraph);
}

function excerpt(text: string, length = 80): string {
  return text.length <= length ? text : `${text.slice(0, length)}…`;
}

/**
 * Deterministic checks over a finished draft: hard findings ride the repair ladder, soft ones surface at review. `priorBodies` is the last ~10 finished chapters, newest
 * first; `target` defaults to the application band. Everything but the fence check reads prose only, without system panels and tables.
 */
export function checkDraftMechanics(markdown: string, priorMarkdown: string[] = [], target: ResolvedWordTarget = resolveWordTarget()): JudgeFinding[] {
  const findings: JudgeFinding[] = [];
  const { prose: body, unclosedFence } = splitChapterProse(markdown);
  const priorBodies = priorMarkdown.map(proseOnly);
  const words = countWords(body);
  const { min: hardMin, max: hardMax } = resolveWordCountHardBounds(target);

  if (words < hardMin) findings.push({ severity: 'hard', text: `${MECHANICAL_PREFIX}draft has ${words} words of prose, below the ${hardMin}-word floor` });
  else if (words > hardMax) findings.push({ severity: 'hard', text: `${MECHANICAL_PREFIX}draft has ${words} words of prose, above the ${hardMax}-word ceiling` });
  else if (words < target.min)
    findings.push({ severity: 'soft', text: `${MECHANICAL_PREFIX}draft has ${words} words of prose, under the ${target.min}–${target.max} target band` });
  else if (words > target.max) findings.push({ severity: 'soft', text: `${MECHANICAL_PREFIX}draft has ${words} words of prose, over the ${target.min}–${target.max} target band` });

  if (unclosedFence) {
    findings.push({ severity: 'hard', text: `${MECHANICAL_PREFIX}the fence opened by "${excerpt(unclosedFence)}" is never closed, so the rest of the chapter renders inside it` });
  }

  for (const paragraph of findDuplicatedParagraphs(body)) {
    findings.push({ severity: 'hard', text: `${MECHANICAL_PREFIX}a paragraph is repeated verbatim — "${excerpt(paragraph)}"` });
  }

  const boundaryEcho = findBoundaryEcho(body, priorBodies[0]);
  if (boundaryEcho) {
    findings.push({ severity: 'hard', text: `${MECHANICAL_PREFIX}chapter opens by repeating the previous chapter's ending verbatim — "${excerpt(boundaryEcho)}"` });
  }

  if (priorBodies.length > 0) {
    const ngramRate = computeCrossChapterRepeatedNgrams(body, priorBodies).overallRepeatedRate;
    if (ngramRate > CROSS_CHAPTER_NGRAM_RATE_MAX) {
      findings.push({
        severity: 'soft',
        text: `${MECHANICAL_PREFIX}${(ngramRate * 100).toFixed(1)}% of 5–8-word phrases also appear in the previous ${priorBodies.length} chapter(s)`,
      });
    }
  }

  const stockPhrases = computeStockPhraseCounts(body);
  if (stockPhrases.total > STOCK_PHRASE_MAX) {
    const worst = stockPhrases.hits
      .filter(h => h.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(h => `${h.label} ×${h.count}`)
      .join(', ');
    findings.push({ severity: 'soft', text: `${MECHANICAL_PREFIX}${stockPhrases.total} stock phrases (${worst})` });
  }

  for (const frame of findSimileFrameOveruse(body)) {
    findings.push({
      severity: 'soft',
      text: `${MECHANICAL_PREFIX}the comparison frame "${frame.label}…" appears ${frame.count} times (${frame.per1000Words.toFixed(1)} per 1,000 words) — keep two at most and vary or cut the rest`,
    });
  }

  const tags = computeDialogueTagMetrics(body);
  if (tags.tagsPer1000Words > DIALOGUE_TAGS_PER_1000_MAX) {
    findings.push({ severity: 'soft', text: `${MECHANICAL_PREFIX}${tags.tagsPer1000Words.toFixed(1)} dialogue tags per 1,000 words` });
  }
  if (tags.totalTags >= DIALOGUE_TAG_RATE_MIN_SAMPLE && tags.saidAlternativeRate > SAID_ALTERNATIVE_RATE_MAX) {
    findings.push({ severity: 'soft', text: `${MECHANICAL_PREFIX}${(tags.saidAlternativeRate * 100).toFixed(0)}% of dialogue tags avoid "said"/"asked"` });
  }

  return findings;
}
