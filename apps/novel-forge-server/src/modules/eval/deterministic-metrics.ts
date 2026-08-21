// Track 2 (harness-final-recommendation.md §14) deterministic prose metrics — pure, synchronous
// functions over already-fetched chapter/draft text. No DB, no LLM: everything here is re-derivable
// from prose alone, which is the point (D32/D33 — mechanical properties need no model judgment).
//
// Definitions, so a future reader can trust the numbers without re-reading the code:
// - Word count: whitespace-split tokens, matches the target band from `generation.prompt.ts` (1,800–2,600).
// - Sentence-length band: 6–22 words per sentence, the band named in `authoring-preamble.ts`'s
//   `DEFAULT_WRITING_INSTRUCTIONS` ("Keep most sentences between roughly 6 and 22 words").
// - "Longest-run monotony": the longest run of consecutive sentences that all fall OUTSIDE the 6–22
//   band (either direction — a run of all-short or all-long sentences, or an alternating mix of both,
//   still counts as monotonous because neither hits the target register). This is one reasonable
//   operationalization of "monotony", not the only one — see the module doc comment on §14 for context.
// - N-gram repetition: word n-grams (n = 5..8 inclusive), case-insensitive, built from tokens with pure
//   punctuation stripped (a token that is only punctuation after stripping is dropped, so n-grams never
//   span a sentence purely on punctuation noise). Within-chapter rate = ngrams occurring 2+ times in the
//   same chapter, as a share of all ngram occurrences. Cross-chapter rate = this chapter's ngrams that
//   also occur anywhere in the prior-chapters window, as a share of this chapter's ngram occurrences.
// - Stock-reaction phrases: a fixed ~20-item starting list (see STOCK_PHRASES) of overused web-novel/LLM
//   stock reactions and clichés, sourced from the report's §13 examples plus common LLM-prose tells. This
//   is a starting point, not exhaustive — extend it as evaluation runs surface more offenders.
// - Dialogue-tag density / said-alternative rate: a "tag" is a verb from SAID_ALTERNATIVE_VERBS or the
//   words "said"/"asked" immediately following a closing quotation mark (optionally after an attribution
//   name). Said-alternative rate = alternative-verb tags / all tags.
// - Contraction rate in dialogue: restricted to text between double quotes; contracted vs. expanded forms
//   from the fixed CONTRACTION_PAIRS list. Rate = contracted / (contracted + expanded).
// - Ending-mode distribution: tallies `briefs.endingContract.hookType` (or a supplied hook type) across a
//   chapter span; reports the counts and the distinct-type count, per §14's "hook vs closure variety".

export const WORD_TARGET_MIN = 1800;
export const WORD_TARGET_MAX = 2600;

export const SENTENCE_BAND_MIN = 6;
export const SENTENCE_BAND_MAX = 22;

export const NGRAM_SIZES = [5, 6, 7, 8] as const;

export interface StockPhrase {
  label: string;
  pattern: RegExp;
}

// ~20-item starting list — see the module doc comment above. Patterns are case-insensitive and tolerant
// of "his"/"her"/"their" where the report's examples imply a possessive.
export const STOCK_PHRASES: StockPhrase[] = [
  { label: 'narrowed eyes', pattern: /\b(?:eyes narrowed|narrowed (?:his|her|their) eyes)\b/gi },
  { label: 'tightened jaw', pattern: /\b(?:jaw tightened|tightened (?:his|her|their) jaw)\b/gi },
  { label: 'breath hitched', pattern: /\bbreath hitched\b/gi },
  { label: 'mixture of X and Y', pattern: /\ba mixture of \w+ and \w+\b/gi },
  { label: 'heart pounded/pounding', pattern: /\bheart (?:pounded|was pounding|pounding)\b/gi },
  { label: "let out a breath they didn't know", pattern: /\blet out (?:a|the) breath (?:he|she|they) (?:didn't|did not) (?:know|realize)/gi },
  { label: 'eyes widened', pattern: /\beyes widened\b/gi },
  { label: 'voice barely above a whisper', pattern: /\bvoice(?:,)? barely (?:above|more than) a whisper\b/gi },
  { label: 'shiver(s) down (his/her) spine', pattern: /\bshiver(?:s)? (?:ran |went )?down (?:his|her|their) spine\b/gi },
  { label: 'clenched fists', pattern: /\bclenched (?:his|her|their) fist/gi },
  { label: 'stomach dropped', pattern: /\bstomach dropped\b/gi },
  { label: 'blood ran cold', pattern: /\bblood ran cold\b/gi },
  { label: 'time seemed to slow', pattern: /\btime seemed to (?:slow|stop|stand still)\b/gi },
  { label: 'world seemed to stop/freeze', pattern: /\b(?:world|everything) seemed to (?:stop|freeze)\b/gi },
  { label: "couldn't help but", pattern: /\bcouldn't help but\b/gi },
  { label: 'ghost of a smile', pattern: /\b(?:a ghost of a smile|ghost of a smile)\b/gi },
  { label: 'let out a sigh', pattern: /\blet out a (?:heavy |long |quiet )?sigh\b/gi },
  { label: 'eyes flickered', pattern: /\beyes flickered\b/gi },
  { label: 'swallowed hard/the lump', pattern: /\bswallowed (?:hard|the lump in (?:his|her|their) throat)\b/gi },
  { label: 'raised an eyebrow', pattern: /\braised an eyebrow\b/gi },
  { label: 'released a breath', pattern: /\breleased (?:a|the) breath (?:she|he|they) (?:didn't|did not) (?:know|realize) (?:she|he|they) (?:was|were) holding\b/gi },
];

export const SAID_ASKED_VERBS = ['said', 'asked'];

export const SAID_ALTERNATIVE_VERBS = [
  'exclaimed',
  'growled',
  'whispered',
  'shouted',
  'muttered',
  'hissed',
  'snapped',
  'murmured',
  'replied',
  'answered',
  'demanded',
  'insisted',
  'breathed',
  'gasped',
  'sighed',
  'warned',
  'protested',
  'agreed',
  'countered',
  'continued',
  'added',
  'interrupted',
  'laughed',
];

const DIALOGUE_TAG_VERBS = [...SAID_ASKED_VERBS, ...SAID_ALTERNATIVE_VERBS];

// Contracted -> expanded. Matching is whole-word, case-insensitive; the count for a pair is however many
// times either form appears inside quoted dialogue.
export const CONTRACTION_PAIRS: [contracted: string, expanded: string][] = [
  ["don't", 'do not'],
  ["doesn't", 'does not'],
  ["didn't", 'did not'],
  ["can't", 'cannot'],
  ["couldn't", 'could not'],
  ["won't", 'will not'],
  ["wouldn't", 'would not'],
  ["shouldn't", 'should not'],
  ["isn't", 'is not'],
  ["aren't", 'are not'],
  ["wasn't", 'was not'],
  ["weren't", 'were not'],
  ["hasn't", 'has not'],
  ["haven't", 'have not'],
  ["hadn't", 'had not'],
  ["I'm", 'I am'],
  ["you're", 'you are'],
  ["he's", 'he is'],
  ["she's", 'she is'],
  ["it's", 'it is'],
  ["we're", 'we are'],
  ["they're", 'they are'],
  ["I've", 'I have'],
  ["you've", 'you have'],
  ["we've", 'we have'],
  ["they've", 'they have'],
  ["I'll", 'I will'],
  ["you'll", 'you will'],
  ["he'll", 'he will'],
  ["she'll", 'she will'],
  ["we'll", 'we will'],
  ["they'll", 'they will'],
  ["that's", 'that is'],
  ["there's", 'there is'],
  ["let's", 'let us'],
];

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export interface WordCountReport {
  chapter: number;
  words: number;
  inTarget: boolean;
}

export interface WordCountSummary {
  chapters: WordCountReport[];
  count: number;
  inTargetCount: number;
  inTargetRate: number;
  min: number;
  max: number;
  mean: number;
  median: number;
}

export function computeWordCountDistribution(chapters: { chapter: number; body: string }[]): WordCountSummary {
  const reports = chapters.map(c => {
    const words = countWords(c.body);
    return { chapter: c.chapter, words, inTarget: words >= WORD_TARGET_MIN && words <= WORD_TARGET_MAX };
  });
  const counts = reports.map(r => r.words).sort((a, b) => a - b);
  const count = counts.length;
  const mid = Math.floor(count / 2);
  const median = count === 0 ? 0 : count % 2 === 0 ? ((counts[mid - 1] ?? 0) + (counts[mid] ?? 0)) / 2 : (counts[mid] ?? 0);
  return {
    chapters: reports,
    count,
    inTargetCount: reports.filter(r => r.inTarget).length,
    inTargetRate: count === 0 ? 0 : reports.filter(r => r.inTarget).length / count,
    min: count === 0 ? 0 : (counts[0] ?? 0),
    max: count === 0 ? 0 : (counts[count - 1] ?? 0),
    mean: count === 0 ? 0 : counts.reduce((a, b) => a + b, 0) / count,
    median,
  };
}

// Splits on sentence-ending punctuation followed by whitespace or end-of-string, keeping the terminator
// with the sentence. Deliberately naive (no abbreviation/ellipsis handling) — good enough for a
// distributional metric, not a linguistic parser.
export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g);
  return (matches ?? []).map(s => s.trim()).filter(Boolean);
}

export interface SentenceLengthMetrics {
  sentenceCount: number;
  bandCount: number;
  bandRate: number;
  longestMonotonyRun: number;
  lengths: number[];
}

export function computeSentenceLengthMetrics(body: string): SentenceLengthMetrics {
  const sentences = splitSentences(body);
  const lengths = sentences.map(s => countWords(s));
  const inBand = lengths.map(n => n >= SENTENCE_BAND_MIN && n <= SENTENCE_BAND_MAX);

  let longestRun = 0;
  let currentRun = 0;
  for (const ok of inBand) {
    if (ok) {
      currentRun = 0;
    } else {
      currentRun++;
      longestRun = Math.max(longestRun, currentRun);
    }
  }

  return {
    sentenceCount: sentences.length,
    bandCount: inBand.filter(Boolean).length,
    bandRate: sentences.length === 0 ? 0 : inBand.filter(Boolean).length / sentences.length,
    longestMonotonyRun: longestRun,
    lengths,
  };
}

// Lowercases and strips a token down to alphanumerics/apostrophes; a token that becomes empty (i.e. was
// pure punctuation) is dropped rather than kept as an empty string, per the module doc comment.
export function tokenizeWords(text: string): string[] {
  const raw = text.toLowerCase().split(/\s+/);
  const tokens: string[] = [];
  for (const word of raw) {
    const cleaned = word.replace(/[^a-z0-9']+/g, '');
    if (cleaned) tokens.push(cleaned);
  }
  return tokens;
}

export function ngrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return [];
  const result: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) result.push(tokens.slice(i, i + n).join(' '));
  return result;
}

export interface NgramSizeStat {
  n: number;
  totalOccurrences: number;
  repeatedOccurrences: number;
  repeatedRate: number;
}

export interface NgramReport {
  sizes: NgramSizeStat[];
  overallRepeatedRate: number;
}

/** Repeated n-grams within a single chapter's own text, for each configured size. */
export function computeWithinChapterRepeatedNgrams(body: string, sizes: readonly number[] = NGRAM_SIZES): NgramReport {
  const tokens = tokenizeWords(body);
  const sizeStats: NgramSizeStat[] = sizes.map(n => {
    const grams = ngrams(tokens, n);
    const counts = new Map<string, number>();
    for (const g of grams) counts.set(g, (counts.get(g) ?? 0) + 1);
    const repeatedOccurrences = grams.filter(g => (counts.get(g) ?? 0) >= 2).length;
    return { n, totalOccurrences: grams.length, repeatedOccurrences, repeatedRate: grams.length === 0 ? 0 : repeatedOccurrences / grams.length };
  });
  const totalOcc = sizeStats.reduce((a, s) => a + s.totalOccurrences, 0);
  const totalRep = sizeStats.reduce((a, s) => a + s.repeatedOccurrences, 0);
  return { sizes: sizeStats, overallRepeatedRate: totalOcc === 0 ? 0 : totalRep / totalOcc };
}

/** Share of this chapter's n-grams that also appear anywhere in the prior-chapters window (~10 chapters). */
export function computeCrossChapterRepeatedNgrams(body: string, priorBodies: string[], sizes: readonly number[] = NGRAM_SIZES): NgramReport {
  const tokens = tokenizeWords(body);
  const priorTokensBySize = new Map<number, Set<string>>();
  for (const n of sizes) {
    const set = new Set<string>();
    for (const prior of priorBodies) for (const g of ngrams(tokenizeWords(prior), n)) set.add(g);
    priorTokensBySize.set(n, set);
  }

  const sizeStats: NgramSizeStat[] = sizes.map(n => {
    const grams = ngrams(tokens, n);
    const priorSet = priorTokensBySize.get(n) ?? new Set<string>();
    const repeatedOccurrences = grams.filter(g => priorSet.has(g)).length;
    return { n, totalOccurrences: grams.length, repeatedOccurrences, repeatedRate: grams.length === 0 ? 0 : repeatedOccurrences / grams.length };
  });
  const totalOcc = sizeStats.reduce((a, s) => a + s.totalOccurrences, 0);
  const totalRep = sizeStats.reduce((a, s) => a + s.repeatedOccurrences, 0);
  return { sizes: sizeStats, overallRepeatedRate: totalOcc === 0 ? 0 : totalRep / totalOcc };
}

export interface StockPhraseHit {
  label: string;
  count: number;
}

export interface StockPhraseReport {
  hits: StockPhraseHit[];
  total: number;
}

export function computeStockPhraseCounts(body: string, phrases: StockPhrase[] = STOCK_PHRASES): StockPhraseReport {
  const hits = phrases.map(p => {
    const matches = body.match(p.pattern);
    return { label: p.label, count: matches ? matches.length : 0 };
  });
  return { hits, total: hits.reduce((a, h) => a + h.count, 0) };
}

export interface DialogueTagMetrics {
  totalTags: number;
  saidAskedCount: number;
  alternativeCount: number;
  saidAlternativeRate: number;
  tagsPer1000Words: number;
}

const DIALOGUE_TAG_PATTERN = new RegExp(`["”]\\s*,?\\s*(?:[A-Z][a-z]+(?:\\s[A-Z][a-z]+)?\\s)?(${DIALOGUE_TAG_VERBS.join('|')})\\b`, 'gi');

export function computeDialogueTagMetrics(body: string): DialogueTagMetrics {
  const matches = [...body.matchAll(DIALOGUE_TAG_PATTERN)];
  const alternativeSet = new Set(SAID_ALTERNATIVE_VERBS.map(v => v.toLowerCase()));
  let saidAskedCount = 0;
  let alternativeCount = 0;
  for (const m of matches) {
    const verb = (m[1] ?? '').toLowerCase();
    if (alternativeSet.has(verb)) alternativeCount++;
    else saidAskedCount++;
  }
  const totalTags = matches.length;
  const words = countWords(body);
  return {
    totalTags,
    saidAskedCount,
    alternativeCount,
    saidAlternativeRate: totalTags === 0 ? 0 : alternativeCount / totalTags,
    tagsPer1000Words: words === 0 ? 0 : (totalTags / words) * 1000,
  };
}

export interface ContractionRateReport {
  contracted: number;
  expanded: number;
  rate: number;
}

function extractQuotedSpans(body: string): string {
  const matches = body.match(/["“]([^"”]*)["”]/g) ?? [];
  return matches.join(' ');
}

export function computeDialogueContractionRate(body: string, pairs: [string, string][] = CONTRACTION_PAIRS): ContractionRateReport {
  const dialogue = extractQuotedSpans(body);
  let contracted = 0;
  let expanded = 0;
  for (const [contractedForm, expandedForm] of pairs) {
    const contractedPattern = new RegExp(`\\b${contractedForm.replace(/'/g, "['’]")}\\b`, 'gi');
    const expandedPattern = new RegExp(`\\b${expandedForm}\\b`, 'gi');
    contracted += (dialogue.match(contractedPattern) ?? []).length;
    expanded += (dialogue.match(expandedPattern) ?? []).length;
  }
  return { contracted, expanded, rate: contracted + expanded === 0 ? 0 : contracted / (contracted + expanded) };
}

export interface EndingModeDistribution {
  counts: Record<string, number>;
  distinctCount: number;
  total: number;
}

export function computeEndingModeDistribution(entries: { chapter: number; hookType: string | null }[]): EndingModeDistribution {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    if (!e.hookType) continue;
    counts[e.hookType] = (counts[e.hookType] ?? 0) + 1;
  }
  return { counts, distinctCount: Object.keys(counts).length, total: entries.filter(e => e.hookType).length };
}

export interface ChapterMetricsInput {
  chapter: number;
  body: string;
  hookType?: string | null;
}

export interface ChapterMetricsReport {
  chapter: number;
  words: number;
  inWordTarget: boolean;
  sentence: SentenceLengthMetrics;
  withinChapterNgrams: NgramReport;
  crossChapterNgrams: NgramReport;
  stockPhrases: StockPhraseReport;
  dialogueTags: DialogueTagMetrics;
  contractionRate: ContractionRateReport;
  hookType: string | null;
}

/** Computes every per-chapter metric for one chapter, given the prior-chapters window for cross-chapter n-gram comparison. */
export function computeChapterMetrics(input: ChapterMetricsInput, priorBodies: string[]): ChapterMetricsReport {
  const words = countWords(input.body);
  return {
    chapter: input.chapter,
    words,
    inWordTarget: words >= WORD_TARGET_MIN && words <= WORD_TARGET_MAX,
    sentence: computeSentenceLengthMetrics(input.body),
    withinChapterNgrams: computeWithinChapterRepeatedNgrams(input.body),
    crossChapterNgrams: computeCrossChapterRepeatedNgrams(input.body, priorBodies),
    stockPhrases: computeStockPhraseCounts(input.body),
    dialogueTags: computeDialogueTagMetrics(input.body),
    contractionRate: computeDialogueContractionRate(input.body),
    hookType: input.hookType ?? null,
  };
}

export interface DeterministicMetricsReport {
  chapters: ChapterMetricsReport[];
  wordCountSummary: WordCountSummary;
  endingModeDistribution: EndingModeDistribution;
}

/**
 * Computes the full Track-2 report for a chapter span. `priorWindowSize` controls how many chapters
 * immediately before the span (fetched by the caller and passed in `priorBodiesByChapter`) count toward
 * each chapter's cross-chapter n-gram comparison — the report recommends "prior ~10 chapters".
 */
export function computeDeterministicMetricsReport(chapters: ChapterMetricsInput[], priorBodiesByChapter: Map<number, string[]>): DeterministicMetricsReport {
  const chapterReports = chapters.map(c => computeChapterMetrics(c, priorBodiesByChapter.get(c.chapter) ?? []));
  return {
    chapters: chapterReports,
    wordCountSummary: computeWordCountDistribution(chapters.map(c => ({ chapter: c.chapter, body: c.body }))),
    endingModeDistribution: computeEndingModeDistribution(chapters.map(c => ({ chapter: c.chapter, hookType: c.hookType ?? null }))),
  };
}
