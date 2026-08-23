// Direct file import of a DI-free type — never the rebrand barrel, whose service imports the AI module.
import { type GlossaryLike } from '../rebrand/residue-scan';

/** The subset of a chapter row the signals need — callers pass DB rows. */
export interface SignalChapter {
  chapter: number;
  title?: string | null;
  body: string;
  wordCount?: number | null;
}

export type SignalCandidateType = 'filler' | 'repetition' | 'pacing_stall' | 'dropped_thread' | 'arc_boundary' | 'quality_outlier';

/**
 * A candidate with evidence, never a verdict (transform design §3.1). The model confirms, rates, and
 * explains these; unconfirmed ones survive into the report at the confidence the detector assigned.
 */
export interface SignalCandidate {
  /** Stable within a digest; the model cites it in `signalRef` so a finding can be traced to its detector. */
  id: string;
  type: SignalCandidateType;
  fromChapter: number;
  toChapter: number;
  severity: number;
  confidence: number;
  label: string;
  detail: string;
  evidence: Record<string, unknown>;
}

/** Deterministic half of the analysis metrics; the model-derived `stallRatio` is folded in by the analysis stage. */
export interface SignalMetrics {
  chapterCount: number;
  medianWords: number;
  madWords: number;
  repetitionRatio: number;
  staticRatio: number;
  arcBoundaryCount: number;
  deadThreadCount: number;
}

export interface AnalysisSignals {
  metrics: SignalMetrics;
  candidates: SignalCandidate[];
}

export interface AnalysisSignalOptions {
  /** Renames are collapsed to their replacement before shingling, so a rename cannot hide a repeat. */
  glossary?: GlossaryLike[];
  /** Shingle width in tokens; wider finds only near-verbatim reuse, narrower drowns in idiom. */
  shingleSize?: number;
  /** Similarity at which two chapters are considered the same scene rewritten. */
  jaccardThreshold?: number;
  /** An entity is a dropped thread when its last mention is this many chapters before the end. */
  deadThreadGap?: number;
  /** Below this many mentions an entity is incidental, not a thread. */
  minMentions?: number;
  /** Consecutive chapters sharing a title stem before the run reads as an arc. */
  minTitleRun?: number;
}

const DEFAULTS = {
  shingleSize: 8,
  jaccardThreshold: 0.18,
  deadThreadGap: 40,
  minMentions: 8,
  minTitleRun: 3,
} as const;

// Corpus document-frequency band for a shingle to generate candidate pairs: 1 is unique text, above 50
// is boilerplate, and both are useless for finding a rewritten scene.
const MIN_DOC_FREQUENCY = 2;
const MAX_DOC_FREQUENCY = 50;

// Only shingles whose hash falls in one modulus class are fingerprinted. Keeping all of them costs ~5.4M
// entries on a 2,000-chapter corpus, which is where both the memory and the inverted-index build time go;
// mod-p sampling estimates the same Jaccard from an eighth of the data.
const SHINGLE_SAMPLE_MODULUS = 8;

const MIN_TERM_LENGTH = 3;
const PADDING_RUN = 3;
const CAST_WINDOW = 5;
const CAST_OVERLAP_FLOOR = 0.25;
const DIALOGUE_FLOOR = 0.15;

const PROPER_NOUN_PATTERN = /\b[A-Z][a-z'’]{2,}(?:\s+[A-Z][a-z'’]{2,})*/g;
const DIALOGUE_PATTERN = /["“”'‘’][^"“”]{2,}?["“”]/g;

// Capitalised sentence openers and titles that would otherwise flood the proper-noun register.
const NON_NAMES = new Set([
  'the',
  'and',
  'but',
  'for',
  'not',
  'his',
  'her',
  'she',
  'they',
  'them',
  'their',
  'this',
  'that',
  'these',
  'those',
  'there',
  'then',
  'when',
  'what',
  'why',
  'how',
  'who',
  'with',
  'was',
  'were',
  'even',
  'just',
  'after',
  'before',
  'once',
  'still',
  'yet',
  'you',
  'your',
  'chapter',
  'part',
  'volume',
  'book',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
]);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2 : (sorted[mid] as number);
}

function hashToken(token: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function glossaryReplacements(glossary: GlossaryLike[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of glossary) {
    const replacement = entry.replacement.toLowerCase();
    for (const term of [entry.sourceName, ...(entry.variants ?? [])]) {
      if (term.length < MIN_TERM_LENGTH) continue;
      map.set(term.toLowerCase(), replacement);
    }
  }
  return map;
}

function tokenize(body: string, renames: Map<string, string>): string[] {
  const tokens: string[] = [];
  for (const raw of body.toLowerCase().split(/[^a-z0-9'’]+/)) {
    if (raw.length === 0) continue;
    tokens.push(renames.get(raw) ?? raw);
  }
  return tokens;
}

function fingerprint(tokens: string[], shingleSize: number): Set<number> {
  const prints = new Set<number>();
  if (tokens.length < shingleSize) return prints;
  const tokenHashes = new Uint32Array(tokens.length);
  for (let i = 0; i < tokens.length; i++) tokenHashes[i] = hashToken(tokens[i] as string);

  for (let i = 0; i + shingleSize <= tokenHashes.length; i++) {
    let hash = 0x811c9dc5;
    for (let j = i; j < i + shingleSize; j++) hash = (Math.imul(hash, 0x01000193) ^ (tokenHashes[j] as number)) >>> 0;
    if (hash % SHINGLE_SAMPLE_MODULUS === 0) prints.add(hash);
  }
  return prints;
}

function shingleTexts(tokens: string[], shingleSize: number, wanted: Set<number>, limit: number): string[] {
  const found: string[] = [];
  for (let i = 0; i + shingleSize <= tokens.length && found.length < limit; i++) {
    let hash = 0x811c9dc5;
    for (let j = i; j < i + shingleSize; j++) hash = (Math.imul(hash, 0x01000193) ^ hashToken(tokens[j] as string)) >>> 0;
    if (!wanted.has(hash)) continue;
    wanted.delete(hash);
    found.push(tokens.slice(i, i + shingleSize).join(' '));
  }
  return found;
}

function findRoot(parent: number[], node: number): number {
  let root = node;
  while ((parent[root] as number) !== root) root = parent[root] as number;
  let cursor = node;
  while ((parent[cursor] as number) !== cursor) {
    const next = parent[cursor] as number;
    parent[cursor] = root;
    cursor = next;
  }
  return root;
}

type SignalSettings = Required<Omit<AnalysisSignalOptions, 'glossary'>>;
type Candidate = Omit<SignalCandidate, 'id'>;

function detectRepetition(chapters: SignalChapter[], tokenized: string[][], options: SignalSettings): { candidates: Candidate[]; repeated: Set<number> } {
  const prints = tokenized.map(tokens => fingerprint(tokens, options.shingleSize));
  const postings = new Map<number, number[]>();
  for (let index = 0; index < prints.length; index++) {
    for (const hash of prints[index] as Set<number>) {
      const list = postings.get(hash);
      if (list) list.push(index);
      else postings.set(hash, [index]);
    }
  }

  const shared = new Map<number, number>();
  for (const list of postings.values()) {
    if (list.length < MIN_DOC_FREQUENCY || list.length > MAX_DOC_FREQUENCY) continue;
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const key = (list[a] as number) * chapters.length + (list[b] as number);
        shared.set(key, (shared.get(key) ?? 0) + 1);
      }
    }
  }

  const parent = chapters.map((_, index) => index);
  const pairs: { a: number; b: number; similarity: number }[] = [];
  for (const [key, count] of shared) {
    const a = Math.floor(key / chapters.length);
    const b = key % chapters.length;
    const union = (prints[a] as Set<number>).size + (prints[b] as Set<number>).size - count;
    const similarity = union > 0 ? count / union : 0;
    if (similarity < options.jaccardThreshold) continue;
    pairs.push({ a, b, similarity });
    const rootA = findRoot(parent, a);
    const rootB = findRoot(parent, b);
    if (rootA !== rootB) parent[rootB] = rootA;
  }

  const clusters = new Map<number, number[]>();
  for (const { a, b } of pairs) {
    for (const member of [a, b]) {
      const root = findRoot(parent, member);
      const list = clusters.get(root);
      if (!list) clusters.set(root, [member]);
      else if (!list.includes(member)) list.push(member);
    }
  }

  const repeated = new Set<number>();
  const candidates: Candidate[] = [];
  for (const members of clusters.values()) {
    members.sort((a, b) => a - b);
    for (const member of members) repeated.add(member);
    const memberChapters = members.map(index => (chapters[index] as SignalChapter).chapter);
    const similarities = pairs.filter(p => members.includes(p.a) && members.includes(p.b)).map(p => p.similarity);
    const peak = Math.max(...similarities);
    const first = members[0] as number;
    const second = members[1] as number;
    const examples = shingleTexts(tokenized[first] as string[], options.shingleSize, new Set(prints[second] as Set<number>), 3);

    candidates.push({
      type: 'repetition',
      fromChapter: memberChapters[0] as number,
      toChapter: memberChapters[memberChapters.length - 1] as number,
      severity: Math.min(5, 2 + Math.floor(members.length / 3)),
      confidence: Math.min(0.9, 0.4 + peak),
      label: `${members.length} chapters reuse the same scene material`,
      detail: `Chapters ${memberChapters.join(', ')} share near-verbatim passages (peak Jaccard ${peak.toFixed(2)}).`,
      evidence: { chapters: memberChapters, peakSimilarity: Number(peak.toFixed(3)), examples },
    });
  }

  return { candidates, repeated };
}

function detectLengthOutliers(chapters: SignalChapter[], words: number[]): { candidates: Candidate[]; medianWords: number; madWords: number } {
  const medianWords = median(words);
  const madWords = median(words.map(w => Math.abs(w - medianWords)));
  const candidates: Candidate[] = [];
  if (medianWords === 0) return { candidates, medianWords, madWords };

  // A corpus of uniformly-sized chapters has a zero MAD, which would make every threshold degenerate.
  const spread = madWords > 0 ? madWords : medianWords * 0.2;
  const shortFloor = medianWords - 2 * spread;
  const giantCeiling = medianWords + 4 * spread;

  let runStart = -1;
  for (let index = 0; index <= chapters.length; index++) {
    const isShort = index < chapters.length && (words[index] as number) < shortFloor;
    if (isShort && runStart === -1) runStart = index;
    if (isShort || runStart === -1) continue;

    const runLength = index - runStart;
    if (runLength >= PADDING_RUN) {
      const from = (chapters[runStart] as SignalChapter).chapter;
      const to = (chapters[index - 1] as SignalChapter).chapter;
      candidates.push({
        type: 'filler',
        fromChapter: from,
        toChapter: to,
        severity: Math.min(5, 1 + Math.floor(runLength / PADDING_RUN)),
        confidence: 0.45,
        label: `${runLength} consecutive short chapters`,
        detail: `Chapters ${from}–${to} run well under the ${Math.round(medianWords)}-word median — the shape of padding.`,
        evidence: { medianWords: Math.round(medianWords), words: words.slice(runStart, index) },
      });
    }
    runStart = -1;
  }

  for (let index = 0; index < chapters.length; index++) {
    if ((words[index] as number) <= giantCeiling) continue;
    const chapter = (chapters[index] as SignalChapter).chapter;
    candidates.push({
      type: 'quality_outlier',
      fromChapter: chapter,
      toChapter: chapter,
      severity: 2,
      confidence: 0.4,
      label: 'chapter is far longer than the corpus median',
      detail: `Chapter ${chapter} holds ${words[index]} words against a ${Math.round(medianWords)}-word median — often an unsplit merge.`,
      evidence: { words: words[index], medianWords: Math.round(medianWords) },
    });
  }

  return { candidates, medianWords, madWords };
}

function properNouns(body: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of body.matchAll(PROPER_NOUN_PATTERN)) {
    const name = match[0];
    if (name.length < MIN_TERM_LENGTH) continue;
    if (NON_NAMES.has(name.toLowerCase())) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function dialogueRatio(body: string): number {
  if (body.length === 0) return 0;
  let spoken = 0;
  for (const match of body.matchAll(DIALOGUE_PATTERN)) spoken += match[0].length;
  return spoken / body.length;
}

function titleStem(title: string | null | undefined): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/^\s*(chapter|ch\.?|part|episode)\s*[0-9ivxlc]+\s*[-:–—.]?\s*/i, '')
    .replace(/\b(part|round|no\.?|#)?\s*[0-9]+\b/g, '')
    .replace(/\b[ivxlc]+\b$/i, '')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const value of a) if (b.has(value)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * The deterministic pre-signals of transform design §3.1 — repetition clusters, length outliers, static
 * chapters, dropped threads, and arc boundaries. Pure and reproducible: the model's job shrinks from
 * "find the repetition" to "explain and rate this repetition", and everything here is free.
 */
export function computeAnalysisSignals(chapters: SignalChapter[], options: AnalysisSignalOptions = {}): AnalysisSignals {
  const settings: SignalSettings = {
    shingleSize: options.shingleSize ?? DEFAULTS.shingleSize,
    jaccardThreshold: options.jaccardThreshold ?? DEFAULTS.jaccardThreshold,
    deadThreadGap: options.deadThreadGap ?? DEFAULTS.deadThreadGap,
    minMentions: options.minMentions ?? DEFAULTS.minMentions,
    minTitleRun: options.minTitleRun ?? DEFAULTS.minTitleRun,
  };
  const ordered = [...chapters].sort((a, b) => a.chapter - b.chapter);
  if (ordered.length === 0) {
    return { metrics: { chapterCount: 0, medianWords: 0, madWords: 0, repetitionRatio: 0, staticRatio: 0, arcBoundaryCount: 0, deadThreadCount: 0 }, candidates: [] };
  }

  const renames = glossaryReplacements(options.glossary ?? []);
  const tokenized = ordered.map(chapter => tokenize(chapter.body, renames));
  const words = ordered.map((chapter, index) => chapter.wordCount ?? (tokenized[index] as string[]).length);

  const repetition = detectRepetition(ordered, tokenized, settings);
  const lengths = detectLengthOutliers(ordered, words);
  const candidates: Candidate[] = [...repetition.candidates, ...lengths.candidates];

  const glossaryNames = new Map<string, string>();
  for (const entry of options.glossary ?? []) {
    for (const term of [entry.sourceName, ...(entry.variants ?? []), entry.replacement]) {
      if (term.length >= MIN_TERM_LENGTH) glossaryNames.set(term.toLowerCase(), entry.replacement);
    }
  }

  const register = new Set<string>();
  const mentions = new Map<string, { total: number; first: number; last: number }>();
  const casts: Set<string>[] = [];
  const staticChapters = new Set<number>();

  for (let index = 0; index < ordered.length; index++) {
    const chapter = ordered[index] as SignalChapter;
    const counts = properNouns(chapter.body);
    const cast = new Set(counts.keys());
    casts.push(cast);

    let introduced = 0;
    for (const [name, count] of counts) {
      if (!register.has(name)) {
        register.add(name);
        introduced++;
      }
      const key = glossaryNames.get(name.toLowerCase()) ?? name;
      const seen = mentions.get(key);
      if (seen) {
        seen.total += count;
        seen.last = chapter.chapter;
      } else mentions.set(key, { total: count, first: chapter.chapter, last: chapter.chapter });
    }

    if (introduced === 0 && dialogueRatio(chapter.body) < DIALOGUE_FLOOR) staticChapters.add(index);
  }

  let stallStart = -1;
  for (let index = 0; index <= ordered.length; index++) {
    const isStatic = staticChapters.has(index);
    if (isStatic && stallStart === -1) stallStart = index;
    if (isStatic || stallStart === -1) continue;
    const from = (ordered[stallStart] as SignalChapter).chapter;
    const to = (ordered[index - 1] as SignalChapter).chapter;
    candidates.push({
      type: 'pacing_stall',
      fromChapter: from,
      toChapter: to,
      severity: Math.min(5, 1 + (index - stallStart)),
      confidence: 0.4,
      label: `${index - stallStart} chapter(s) introduce nothing and barely speak`,
      detail: `Chapters ${from}–${to} add no new named entity and read below the dialogue floor — the recap/monologue stall.`,
      evidence: { chapters: ordered.slice(stallStart, index).map(c => c.chapter) },
    });
    stallStart = -1;
  }

  const lastChapter = (ordered[ordered.length - 1] as SignalChapter).chapter;
  let deadThreadCount = 0;
  for (const [name, span] of mentions) {
    if (span.total < settings.minMentions) continue;
    if (lastChapter - span.last <= settings.deadThreadGap) continue;
    deadThreadCount++;
    candidates.push({
      type: 'dropped_thread',
      fromChapter: span.first,
      toChapter: span.last,
      severity: Math.min(5, 2 + Math.floor(span.total / 20)),
      confidence: 0.5,
      label: `"${name}" is never mentioned again after chapter ${span.last}`,
      detail: `${span.total} mentions between chapters ${span.first} and ${span.last}, then nothing for the remaining ${lastChapter - span.last} chapters.`,
      evidence: { name, mentions: span.total, firstChapter: span.first, lastChapter: span.last },
    });
  }

  const boundaries = new Set<number>();
  let stemStart = 0;
  for (let index = 1; index <= ordered.length; index++) {
    const stem = index < ordered.length ? titleStem((ordered[index] as SignalChapter).title) : ' ';
    if (stem !== '' && stem === titleStem((ordered[stemStart] as SignalChapter).title)) continue;
    const runLength = index - stemStart;
    const stemValue = titleStem((ordered[stemStart] as SignalChapter).title);
    if (stemValue !== '' && runLength >= settings.minTitleRun) {
      const from = (ordered[stemStart] as SignalChapter).chapter;
      const to = (ordered[index - 1] as SignalChapter).chapter;
      boundaries.add(from);
      candidates.push({
        type: 'arc_boundary',
        fromChapter: from,
        toChapter: to,
        severity: 1,
        confidence: 0.6,
        label: `"${stemValue}" runs for ${runLength} chapters`,
        detail: `Chapters ${from}–${to} share a title stem — a self-contained arc by the source's own labelling.`,
        evidence: { stem: stemValue, chapters: runLength },
      });
    }
    stemStart = index;
  }

  for (let index = CAST_WINDOW; index + CAST_WINDOW <= ordered.length; index++) {
    const before = new Set<string>();
    const after = new Set<string>();
    for (let offset = 1; offset <= CAST_WINDOW; offset++) {
      for (const name of casts[index - offset] as Set<string>) before.add(name);
      for (const name of casts[index + offset - 1] as Set<string>) after.add(name);
    }
    if (jaccard(before, after) >= CAST_OVERLAP_FLOOR) continue;
    const chapter = (ordered[index] as SignalChapter).chapter;
    if (boundaries.has(chapter)) continue;
    boundaries.add(chapter);
    candidates.push({
      type: 'arc_boundary',
      fromChapter: chapter,
      toChapter: chapter,
      severity: 1,
      confidence: 0.35,
      label: `the cast turns over at chapter ${chapter}`,
      detail: `The named cast of the five chapters before and after chapter ${chapter} barely overlap.`,
      evidence: { before: [...before].slice(0, 10), after: [...after].slice(0, 10) },
    });
  }

  candidates.sort((a, b) => a.fromChapter - b.fromChapter || a.type.localeCompare(b.type));

  return {
    candidates: candidates.map((candidate, index) => ({ id: `sig-${index + 1}`, ...candidate })),
    metrics: {
      chapterCount: ordered.length,
      medianWords: Math.round(lengths.medianWords),
      madWords: Math.round(lengths.madWords),
      repetitionRatio: Number((repetition.repeated.size / ordered.length).toFixed(4)),
      staticRatio: Number((staticChapters.size / ordered.length).toFixed(4)),
      arcBoundaryCount: boundaries.size,
      deadThreadCount,
    },
  };
}

/**
 * The digest the analysis prompts read (transform design §3.2). A range scopes it to one window's
 * chapters — an overlapping candidate still shows, because a repetition cluster that starts before the
 * window is exactly what the window needs to know about.
 */
export function renderSignalDigest(signals: AnalysisSignals, from?: number, to?: number): string {
  const scoped = signals.candidates.filter(c => (from === undefined || c.toChapter >= from) && (to === undefined || c.fromChapter <= to));
  if (scoped.length === 0) return 'No mechanical signals fired for these chapters.';
  return scoped
    .map(c => {
      const range = c.fromChapter === c.toChapter ? `ch. ${c.fromChapter}` : `ch. ${c.fromChapter}-${c.toChapter}`;
      return `[${c.id}] ${c.type} ${range} (severity ${c.severity}, confidence ${c.confidence.toFixed(2)}) — ${c.label}. ${c.detail}`;
    })
    .join('\n');
}
