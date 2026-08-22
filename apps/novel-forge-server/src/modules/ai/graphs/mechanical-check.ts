import {
  computeCrossChapterRepeatedNgrams,
  computeDialogueTagMetrics,
  computeStockPhraseCounts,
  countWords,
  WORD_TARGET_MAX,
  WORD_TARGET_MIN,
} from '../../eval/deterministic-metrics';
import { type JudgeFinding } from '../schemas';

// The generation prompt tells the model to treat 1,800–2,600 words as "a guide, not a hard wall", so the
// target band alone can only be advisory. These wider bounds are the structural floor/ceiling underneath
// that guidance — ~600 words of slack on each side, past which the draft is a truncation or a runaway
// rather than a chapter that ran long.
export const WORD_COUNT_HARD_MIN = 1200;
export const WORD_COUNT_HARD_MAX = 3200;

// Short paragraphs repeat legitimately (a shouted name, a one-line refrain); at 20+ words a verbatim
// repeat is a generation defect, not a stylistic echo.
export const DUPLICATE_PARAGRAPH_MIN_WORDS = 20;

// Share of this chapter's 5–8-grams that also appear in the prior window. Ordinary prose reuses names,
// places and stock connectives, so a few percent is normal; 5% means whole clauses are being recycled.
export const CROSS_CHAPTER_NGRAM_RATE_MAX = 0.05;

// The stock-phrase list is ~20 of the most overused reactions; more than five hits in one chapter means
// the draft is leaning on them as its default beat.
export const STOCK_PHRASE_MAX = 5;

// A dialogue-heavy chapter runs ~15 tags per 1,000 words; past 25 the tags are crowding the prose.
export const DIALOGUE_TAGS_PER_1000_MAX = 25;

// Rate is only meaningful once there are enough tags to rate; below this the denominator is noise.
export const DIALOGUE_TAG_RATE_MIN_SAMPLE = 10;

// "Said" should carry most attributions; a majority of exotic alternatives is the classic said-bookism tell.
export const SAID_ALTERNATIVE_RATE_MAX = 0.5;

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
 * Deterministic mechanical checks over a finished draft (D32). Hard findings are structural defects that
 * must ride the repair ladder; soft findings are prose-quality signals that surface at review without
 * blocking. `priorBodies` is the raw text of the last ~10 finished chapters, newest first — an empty array
 * simply skips the cross-chapter comparison.
 */
export function checkDraftMechanics(body: string, priorBodies: string[] = []): JudgeFinding[] {
  const findings: JudgeFinding[] = [];
  const words = countWords(body);

  if (words < WORD_COUNT_HARD_MIN) findings.push({ severity: 'hard', text: `mechanical: draft is ${words} words, below the ${WORD_COUNT_HARD_MIN}-word floor` });
  else if (words > WORD_COUNT_HARD_MAX) findings.push({ severity: 'hard', text: `mechanical: draft is ${words} words, above the ${WORD_COUNT_HARD_MAX}-word ceiling` });
  else if (words < WORD_TARGET_MIN) findings.push({ severity: 'soft', text: `mechanical: draft is ${words} words, under the ${WORD_TARGET_MIN}–${WORD_TARGET_MAX} target band` });
  else if (words > WORD_TARGET_MAX) findings.push({ severity: 'soft', text: `mechanical: draft is ${words} words, over the ${WORD_TARGET_MIN}–${WORD_TARGET_MAX} target band` });

  for (const paragraph of findDuplicatedParagraphs(body)) {
    findings.push({ severity: 'hard', text: `mechanical: a paragraph is repeated verbatim — "${excerpt(paragraph)}"` });
  }

  if (priorBodies.length > 0) {
    const ngramRate = computeCrossChapterRepeatedNgrams(body, priorBodies).overallRepeatedRate;
    if (ngramRate > CROSS_CHAPTER_NGRAM_RATE_MAX) {
      findings.push({
        severity: 'soft',
        text: `mechanical: ${(ngramRate * 100).toFixed(1)}% of 5–8-word phrases also appear in the previous ${priorBodies.length} chapter(s)`,
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
    findings.push({ severity: 'soft', text: `mechanical: ${stockPhrases.total} stock phrases (${worst})` });
  }

  const tags = computeDialogueTagMetrics(body);
  if (tags.tagsPer1000Words > DIALOGUE_TAGS_PER_1000_MAX) {
    findings.push({ severity: 'soft', text: `mechanical: ${tags.tagsPer1000Words.toFixed(1)} dialogue tags per 1,000 words` });
  }
  if (tags.totalTags >= DIALOGUE_TAG_RATE_MIN_SAMPLE && tags.saidAlternativeRate > SAID_ALTERNATIVE_RATE_MAX) {
    findings.push({ severity: 'soft', text: `mechanical: ${(tags.saidAlternativeRate * 100).toFixed(0)}% of dialogue tags avoid "said"/"asked"` });
  }

  return findings;
}
