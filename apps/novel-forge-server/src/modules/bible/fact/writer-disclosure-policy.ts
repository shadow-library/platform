import { and, eq, inArray } from 'drizzle-orm';
import { Logger } from '@shadow-library/common';

import { cluesNamingTerms, escapeRegExp, nearestVolumeKey, type PlanOverlay, revealTermPattern } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Bible, type PrimaryDatabase, schema } from '@server/database';

import { isPlannerOnlyBibleDoc, isWriterExcludedBibleDoc, OPEN_QUESTIONS_DOC, ORGANISED_TIMELINE_DOC } from '../../ai/context/bible-docs';
import { type FactLike, KNOWLEDGE_LEAK_PREFIX, type KnowledgeLeakIssue, loadWriterForbiddenFacts, scanKnowledgeLeaks, writerSafeLeakLines } from './knowledge-view';

/** Where a writer-bound string came from: it decides which withholdings apply, and the policy counts what it withheld per kind. */
export type WriterField = 'prose' | 'summary' | 'state' | 'entity' | 'reference' | 'bible_page' | 'heading' | 'plan' | 'style' | 'writer_line' | 'knowledge' | 'note' | 'plugin';

export interface WriterDisclosureInput {
  chapter: number;
  /** Facts the writer must not read at this chapter: their truth, author note, key and give-away terms are withheld. */
  lockedFacts: readonly FactLike[];
  /** Text only planners read at this chapter — the ending, the ending question, later volumes' goals and notes — withheld from every field. */
  plannerOnly: readonly string[];
  /**
   * The planner-only pages' bodies, withheld only from fields that copy authored canon (pages, sheets, references, plugin sections): their
   * opening lines are what the chapter's own plan, notes and prose legitimately say.
   */
  plannerPages: readonly string[];
  volumeOrdinals: ReadonlyMap<string, number>;
  /** Null when the chapter belongs to no known volume: then no volume counts as current or earlier. */
  currentVolumeOrdinal: number | null;
}

interface Withholding {
  pattern: RegExp;
  weight: number;
  fields?: ReadonlySet<WriterField>;
}

type PassageFloor = 'truth' | 'passage' | 'sentence';

const logger = Logger.getLogger(APP_NAME, 'writer-disclosure-policy');

const WITHHELD = '[withheld]';
const COPY_FIELDS: ReadonlySet<WriterField> = new Set(['bible_page', 'entity', 'reference', 'plugin']);
const MIN_TRUTH_LENGTH = 3;
// A single word ("None", "Reconciliation") would be wiped from every field, and a short pair nearly as often; give-away terms still catch them.
const MIN_PASSAGE_WORDS = 3;
const MIN_PAIR_LENGTH = 12;
// A sentence shorter than this is too likely to recur in ordinary prose to be withheld on its own; the whole passage still is.
const MIN_SENTENCE_LENGTH = 20;
// Scripts written without spaces between words: a whitespace word count says nothing there, so their floors count characters.
const MIN_UNSPACED_PASSAGE_LENGTH = 6;
const MIN_UNSPACED_SENTENCE_LENGTH = 12;
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
const LEAK_NOTE_SEPARATOR = ' — ';
const PRESCAN_LEAK = /^"(.+?)" exposes \[([^\]]+)\]/;
const SENTENCE_BREAK = /(?<=[.!?。！？])\s+|\n+/u;
const LIST_MARKER = /^\s*(?:[-*+>]|\d+[.)]|#{1,6})\s+/;
const TRAILING_PUNCTUATION = /[\s.!?;:,…。！？]+$/u;
const EMPHASIS = /\*+|_{2,}|`/g;
const NOT_WORD_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_WORD_AFTER = '(?![\\p{L}\\p{N}])';
const EMPHASIS_MARK = '[*_]{0,2}';
const WORD_GAP = `${EMPHASIS_MARK}\\s+${EMPHASIS_MARK}`;
const CHARACTER_CLASSES: readonly [RegExp, string][] = [
  [/["“”„«»]/u, '["“”„«»]'],
  [/['’‘`]/u, "['’‘`]"],
  [/[-‐‑–—]/u, '[-‐‑–—]'],
];

function charPattern(char: string): string {
  return CHARACTER_CLASSES.find(([matches]) => matches.test(char))?.[1] ?? escapeRegExp(char);
}

function longEnough(text: string, floor: PassageFloor): boolean {
  if (floor === 'truth') return text.length >= MIN_TRUTH_LENGTH;
  if (UNSPACED_SCRIPT.test(text)) return text.length >= (floor === 'sentence' ? MIN_UNSPACED_SENTENCE_LENGTH : MIN_UNSPACED_PASSAGE_LENGTH);
  const words = text.split(/\s+/).length;
  if (words < 2) return false;
  if (floor === 'sentence') return text.length >= MIN_SENTENCE_LENGTH;
  return words >= MIN_PASSAGE_WORDS || text.length >= MIN_PAIR_LENGTH;
}

/** A literal passage as a case-insensitive whole-word pattern that tolerates re-wrapping, markdown emphasis, quote and dash variants and a different sentence end. */
function passagePattern(text: string, floor: PassageFloor, fields?: ReadonlySet<WriterField>): Withholding | null {
  const trimmed = text.replace(LIST_MARKER, '').replace(EMPHASIS, '').replace(TRAILING_PUNCTUATION, '').trim();
  if (!longEnough(trimmed, floor)) return null;
  const body = trimmed
    .split(/\s+/)
    .map(word => [...word].map(charPattern).join(''))
    .join(WORD_GAP);
  return { pattern: new RegExp(`${NOT_WORD_BEFORE}${EMPHASIS_MARK}${body}${EMPHASIS_MARK}${NOT_WORD_AFTER}`, 'giu'), weight: trimmed.length, fields };
}

/** The whole passage, and each of its sentences and lines long enough to stand alone, so a partial copy is withheld too. */
function passageWithholdings(text: string | null | undefined, floor: PassageFloor, fields?: ReadonlySet<WriterField>): Withholding[] {
  if (!text?.trim()) return [];
  const sentences = text.split(SENTENCE_BREAK).map(sentence => passagePattern(sentence, 'sentence', fields));
  return [passagePattern(text, floor, fields), ...sentences].filter((withholding): withholding is Withholding => withholding !== null);
}

function keyWithholding(key: string): Withholding {
  return { pattern: new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(key)}(?![\\p{L}\\p{N}_])`, 'giu'), weight: key.length };
}

/** A bare key is only a key when it has an underscore — `heir` alone is an ordinary word — while a `fact:` ref always is. */
function factWithholdings(fact: FactLike): Withholding[] {
  const keys = [`fact:${fact.factKey}`, ...(fact.factKey.includes('_') ? [fact.factKey] : [])].map(keyWithholding);
  const terms = (fact.terms ?? []).flatMap(term => {
    const pattern = revealTermPattern(term, true);
    return pattern ? [{ pattern, weight: term.trim().length }] : [];
  });
  return [...passageWithholdings(fact.text, 'truth'), ...passageWithholdings(fact.constraintNote, 'passage'), ...keys, ...terms];
}

function uniqueByPattern(withholdings: Withholding[]): Withholding[] {
  const seen = new Map<string, Withholding>();
  for (const withholding of withholdings) {
    const id = `${withholding.pattern.source}/${withholding.pattern.flags}`;
    const known = seen.get(id);
    seen.set(id, known && !known.fields ? known : withholding);
  }
  return [...seen.values()].sort((left, right) => right.weight - left.weight);
}

function refParts(ref: string): { prefix: string; value: string } {
  const colon = ref.indexOf(':');
  return colon === -1 ? { prefix: '', value: ref } : { prefix: ref.slice(0, colon), value: ref.slice(colon + 1) };
}

/**
 * The one rule for everything the chapter writer reads (generation, revision and repair roles). It withholds, from every writer-bound
 * string, the locked facts' truth, author notes, keys and give-away terms and the planner-only material, and it gates which references
 * resolve at the chapter. It is lexical: it catches copies, never paraphrase — the judge that knows the secrets reads the chapter after.
 */
export class WriterDisclosurePolicy {
  readonly chapter: number;
  readonly lockedFacts: readonly FactLike[];
  private readonly withholdings: Withholding[];
  private readonly volumeOrdinals: ReadonlyMap<string, number>;
  private readonly currentVolumeOrdinal: number | null;
  private readonly withheldCounts = new Map<WriterField, number>();

  constructor(input: WriterDisclosureInput) {
    this.chapter = input.chapter;
    this.lockedFacts = input.lockedFacts;
    this.volumeOrdinals = input.volumeOrdinals;
    this.currentVolumeOrdinal = input.currentVolumeOrdinal;
    this.withholdings = uniqueByPattern([
      ...input.lockedFacts.flatMap(factWithholdings),
      ...input.plannerOnly.flatMap(text => passageWithholdings(text, 'passage')),
      ...input.plannerPages.flatMap(text => passageWithholdings(text, 'passage', COPY_FIELDS)),
    ]);
  }

  /** The author-privileged view: nothing is withheld and every reference resolves, as for a planner or the chat. */
  static planner(): WriterDisclosurePolicy {
    return new WriterDisclosurePolicy({
      chapter: Number.POSITIVE_INFINITY,
      lockedFacts: [],
      plannerOnly: [],
      plannerPages: [],
      volumeOrdinals: new Map(),
      currentVolumeOrdinal: null,
    });
  }

  private get restricts(): boolean {
    return Number.isFinite(this.chapter);
  }

  /** How many passages each kind of field lost, for the pack's diagnostics. */
  get withheld(): ReadonlyMap<WriterField, number> {
    return this.withheldCounts;
  }

  /**
   * The text as the writer may read it. Knowledge-leak finding lines (a judge's or an author's) become their writer-safe forms, then
   * every withheld passage, key and give-away term that applies to the field is replaced, longest first.
   */
  scrub(text: string, field: WriterField): string {
    if (!text || this.withholdings.length === 0) return text;
    const { kept, safeLines } = this.splitLeakFindings(text);
    let scrubbed = kept;
    let count = 0;
    for (const { pattern, fields } of this.withholdings) {
      if (fields && !fields.has(field)) continue;
      scrubbed = scrubbed.replace(pattern, () => {
        count++;
        return WITHHELD;
      });
    }
    if (count > 0) this.withheldCounts.set(field, (this.withheldCounts.get(field) ?? 0) + count);
    return safeLines.length === 0 ? scrubbed : [scrubbed.trim(), ...safeLines].filter(Boolean).join('\n');
  }

  /** Structured continuation state, key by key and value by value: scrubbing its JSON would miss a passage whose quotes or breaks the encoding escapes. */
  scrubState(value: unknown, establishedFactsMax: number): unknown {
    if (typeof value === 'string') return this.scrub(value, 'state');
    if (Array.isArray(value)) return value.map(item => this.scrubState(item, establishedFactsMax));
    if (value === null || typeof value !== 'object') return value;
    const entries = new Map<string, unknown>();
    for (const [key, item] of Object.entries(value)) {
      const scrubbed = this.scrub(key, 'state');
      let safeKey = scrubbed;
      for (let n = 2; entries.has(safeKey); n++) safeKey = `${scrubbed} (${n})`;
      const safe = key === 'establishedFacts' && Array.isArray(item) ? this.establishedFacts(item, establishedFactsMax) : this.scrubState(item, establishedFactsMax);
      entries.set(safeKey, safe);
    }
    return Object.fromEntries(entries);
  }

  /**
   * Whether a reference may resolve for the writer at this chapter: a known volume only when it is the chapter's own or an earlier one
   * (an unknown one is left to fail as missing), an earlier chapter only, and never a page excluded from writer packs. Threads and
   * mysteries are gated on their rows, by `opensBy`.
   */
  canResolve(ref: string): boolean {
    if (!this.restricts) return true;
    const { prefix, value } = refParts(ref);
    if (prefix === 'volume') {
      const ordinal = this.volumeOrdinals.get(value);
      return ordinal === undefined || (this.currentVolumeOrdinal !== null && ordinal <= this.currentVolumeOrdinal);
    }
    if (prefix === 'chapter') {
      const chapter = Number(value);
      return Number.isInteger(chapter) && chapter < this.chapter;
    }
    if (prefix === 'bible_doc') {
      const slash = value.indexOf('/');
      return !isWriterExcludedBibleDoc({ section: (slash === -1 ? value : value.slice(0, slash)) as never, slug: slash === -1 ? '' : value.slice(slash + 1) });
    }
    return true;
  }

  /**
   * A thread or mystery the story has not opened by this chapter belongs to the plan, not to the writer. One with no opening chapter was
   * made by hand or imported, never scheduled, so it is the author's to show.
   */
  opensBy(openedChapter: number | null | undefined): boolean {
    if (!this.restricts || openedChapter == null) return true;
    return openedChapter <= this.chapter;
  }

  /**
   * The observable signs the author allows for the locked facts, never scrubbed: suspense needs clues the writer may show. A clue naming its
   * fact's give-away term (stored before that rule, or written around it) is dropped rather than passed through.
   */
  allowedClues(): string[] {
    const clues = this.lockedFacts.flatMap(fact => (fact.allowedClues ?? []).filter(clue => cluesNamingTerms([clue], fact.terms).length === 0));
    const naming = this.lockedFacts.filter(fact => cluesNamingTerms(fact.allowedClues, fact.terms).length > 0).map(fact => fact.factKey);
    if (naming.length > 0) logger.warn('allowed clues dropped for naming a give-away term', { chapter: this.chapter, factKeys: naming });
    return [...new Set(clues.map(clue => clue.trim()))].filter(Boolean);
  }

  /** The give-away terms of the locked facts that `body` uses, as the writer-safe lines a revision works from. */
  leakLines(body: string): string[] {
    const leaks = scanKnowledgeLeaks(body, [...this.lockedFacts]);
    return writerSafeLeakLines(leaks, [], [...this.lockedFacts]).map(line => `- ${this.scrubLeakLine(line.slice(KNOWLEDGE_LEAK_PREFIX.length))}`);
  }

  /**
   * A writer-safe leak line names the give-away term the writer already used, so that term is kept; the writer note after the dash is
   * author text like any other and is scrubbed.
   */
  scrubLeakLine(line: string): string {
    const at = line.indexOf(LEAK_NOTE_SEPARATOR);
    if (at === -1) return line;
    const noteStart = at + LEAK_NOTE_SEPARATOR.length;
    return `${line.slice(0, noteStart)}${this.scrub(line.slice(noteStart), 'note')}`;
  }

  // An entry tripping a locked fact's give-away terms is dropped outright rather than scrubbed around, so the state never carries half a secret forward.
  private establishedFacts(entries: unknown[], max: number): string[] {
    return entries
      .filter((entry): entry is string => typeof entry === 'string' && scanKnowledgeLeaks(entry, [...this.lockedFacts]).length === 0)
      .slice(0, max)
      .map(entry => this.scrub(entry, 'state'));
  }

  private splitLeakFindings(text: string): { kept: string; safeLines: string[] } {
    if (!text.toLowerCase().includes(KNOWLEDGE_LEAK_PREFIX)) return { kept: text, safeLines: [] };
    const prescan: Pick<KnowledgeLeakIssue, 'factKey' | 'term'>[] = [];
    const judgeIssues: string[] = [];
    const kept: string[] = [];
    for (const line of text.split('\n')) {
      const at = line.toLowerCase().indexOf(KNOWLEDGE_LEAK_PREFIX);
      if (at === -1) {
        kept.push(line);
        continue;
      }
      const finding = line.slice(at + KNOWLEDGE_LEAK_PREFIX.length).trim();
      const match = PRESCAN_LEAK.exec(finding);
      if (match?.[1] && match[2]) prescan.push({ term: match[1], factKey: match[2] });
      else judgeIssues.push(finding);
    }
    const safeLines = writerSafeLeakLines(prescan, judgeIssues, [...this.lockedFacts]).map(line => `- ${this.scrubLeakLine(line.slice(KNOWLEDGE_LEAK_PREFIX.length))}`);
    return { kept: kept.join('\n'), safeLines };
  }
}

type DisclosureDb = Pick<PrimaryDatabase, 'query'>;

type PlannerPage = Pick<Bible.Document, 'section' | 'slug' | 'frontmatter' | 'body'>;

interface LaterVolume {
  volumeKey: string;
  title: string | null;
  objective: string | null;
  body: string | null;
}

/** What the writer of a chapter is kept from, as named records: the policy is built from these, and a plan card's writer preview lists them. */
export interface WriterDisclosureSources {
  chapter: number;
  lockedFacts: FactLike[];
  /** Null once the chapter is at or after the one planned as the ending, or when the author left it blank. */
  ending: string | null;
  endingQuestion: string | null;
  laterVolumes: LaterVolume[];
  plannerPages: PlannerPage[];
  volumeOrdinals: ReadonlyMap<string, number>;
  currentVolumeOrdinal: number | null;
}

function present(text: string | null | undefined): text is string {
  return typeof text === 'string' && text.trim() !== '';
}

export function writerDisclosurePolicy(sources: WriterDisclosureSources): WriterDisclosurePolicy {
  return new WriterDisclosurePolicy({
    chapter: sources.chapter,
    lockedFacts: sources.lockedFacts,
    plannerOnly: [sources.ending, sources.endingQuestion, ...sources.laterVolumes.flatMap(volume => [volume.objective, volume.body])].filter(present),
    plannerPages: sources.plannerPages.map(page => page.body).filter(present),
    volumeOrdinals: sources.volumeOrdinals,
    currentVolumeOrdinal: sources.currentVolumeOrdinal,
  });
}

/**
 * What the writer of `chapter` is kept from. The ending and the ending question are planner-only until the chapter planned as the ending
 * (and any epilogue after it), whose plan may state the ending's beats. An `overlay` stands in for the chapter's stored plan.
 */
export async function loadWriterDisclosureSources(db: DisclosureDb, projectId: bigint, chapter: number, overlay?: PlanOverlay): Promise<WriterDisclosureSources> {
  const briefs = schema.briefs;
  const [lockedFacts, project, plan, storedEnding, plannerPages, volumes] = await Promise.all([
    loadWriterForbiddenFacts(db, projectId, chapter, overlay),
    db.query.projects.findFirst({ columns: { ending: true, endingQuestion: true }, where: eq(schema.projects.id, projectId) }),
    overlay ?? db.query.briefs.findFirst({ columns: { volumeKey: true, isEnding: true }, where: and(eq(briefs.projectId, projectId), eq(briefs.chapter, chapter)) }),
    db.query.briefs.findFirst({ columns: { chapter: true, isEnding: true }, where: and(eq(briefs.projectId, projectId), eq(briefs.isEnding, true)) }),
    db.query.bibleDocuments.findMany({
      columns: { section: true, slug: true, frontmatter: true, body: true },
      where: and(
        eq(schema.bibleDocuments.projectId, projectId),
        eq(schema.bibleDocuments.section, ORGANISED_TIMELINE_DOC.section),
        inArray(schema.bibleDocuments.slug, [ORGANISED_TIMELINE_DOC.slug, OPEN_QUESTIONS_DOC.slug]),
      ),
    }),
    db.query.volumes.findMany({ columns: { volumeKey: true, ordinal: true, title: true, objective: true, body: true }, where: eq(schema.volumes.projectId, projectId) }),
  ]);

  const endingPlan = overlay && storedEnding?.chapter === chapter ? undefined : storedEnding;
  const volumeKey = plan?.volumeKey ?? (await nearestVolumeKey(db, projectId, chapter));
  const volumeOrdinals = new Map(volumes.map(volume => [volume.volumeKey, volume.ordinal]));
  const currentVolumeOrdinal = volumeKey === null ? null : (volumeOrdinals.get(volumeKey) ?? null);
  const atEnding = plan?.isEnding === true || (endingPlan?.isEnding === true && chapter >= endingPlan.chapter);
  const laterVolumes = volumes
    .filter(volume => currentVolumeOrdinal === null || volume.ordinal > currentVolumeOrdinal)
    .sort((left, right) => left.ordinal - right.ordinal)
    .map(volume => ({ volumeKey: volume.volumeKey, title: volume.title, objective: volume.objective, body: volume.body }));

  return {
    chapter,
    lockedFacts,
    ending: !atEnding && present(project?.ending) ? project.ending : null,
    endingQuestion: !atEnding && present(project?.endingQuestion) ? project.endingQuestion : null,
    laterVolumes,
    plannerPages: plannerPages.filter(isPlannerOnlyBibleDoc),
    volumeOrdinals,
    currentVolumeOrdinal,
  };
}

export async function loadWriterDisclosurePolicy(db: DisclosureDb, projectId: bigint, chapter: number): Promise<WriterDisclosurePolicy> {
  return writerDisclosurePolicy(await loadWriterDisclosureSources(db, projectId, chapter));
}
