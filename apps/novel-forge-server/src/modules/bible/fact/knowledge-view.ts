import { and, eq, inArray, lt } from 'drizzle-orm';
import { Config } from '@shadow-library/common';

import {
  chapterUnlockContext,
  evaluateUnlock,
  isOpenCanon,
  type KnowledgeContract,
  parseKnowledgeContract,
  type PlanOverlay,
  revealRequirements,
  revealTermPattern,
} from '@server/common';
import { type Knowledge, type PrimaryDatabase, schema } from '@server/database';

export { type KnowledgeContract, parseKnowledgeContract } from '@server/common';

/** The subset of a canon-fact row the pure view/scan functions need. */
export interface FactLike {
  factKey: string;
  text: string;
  constraintNote?: string | null;
  writerNote?: string | null;
  terms?: string[] | null;
  allowedClues?: string[] | null;
  subjects?: string[] | null;
  source?: Knowledge.FactSource;
  disclosedInChapter?: number | null;
}

/** A member of the chapter's POV cast; `name` falls back to the key when no entity carries it. */
export interface PovMember {
  entityKey: string;
  name: string;
}

/** Facts partitioned by what this chapter's POV cast may see. */
export interface KnowledgeView {
  known: FactLike[];
  reveals: FactLike[];
  hidden: FactLike[];
  /** Facts the reader was shown before this chapter that nobody in the POV cast knows; empty unless the reader-knows label is on. */
  readerKnows: FactLike[];
  /**
   * Whose knowledge `known` pools: the union of every POV character in the chapter's contract, for the whole chapter — never one character's
   * view per scene. It holds what each member learned before this chapter, committed or ledgered by an approved earlier draft.
   */
  pooledPov: PovMember[];
  /** The latest chapter before this one in which a POV-cast member learned each known fact, for facts the ledger records. */
  learnedIn?: ReadonlyMap<string, number>;
}

export interface KnowledgeViewOptions {
  /** Hands the writer facts the reader knows and the POV cast does not, labelled as such; defaults to `knowledge.reader-knows-label`. */
  readerKnows?: boolean;
  /** The chapter's plan as a staged card would leave it, read in place of its stored row. */
  overlay?: PlanOverlay;
}

export interface KnowledgeLeakIssue {
  factKey: string;
  term: string;
  excerpt: string;
}

/** The narrow database surface the loaders need — satisfied by both the client and a transaction. */
type KnowledgeDb = Pick<PrimaryDatabase, 'query'>;

type KnowledgePartition = Pick<KnowledgeView, 'known' | 'reveals' | 'hidden'>;

const EXCERPT_RADIUS = 60;

function readerKnowsLabelEnabled(): boolean {
  return Config.get('knowledge.reader-knows-label') === true;
}

function excerptAround(body: string, index: number, length: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(body.length, index + length + EXCERPT_RADIUS);
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`;
}

/** Partitions the project's facts: ledgered before this chapter → known, contracted this chapter → reveals, everything else → hidden. */
export function splitKnowledgeView(facts: FactLike[], knownKeys: ReadonlySet<string>, learnKeys: ReadonlySet<string>): KnowledgePartition {
  const known: FactLike[] = [];
  const reveals: FactLike[] = [];
  const hidden: FactLike[] = [];
  for (const fact of facts) {
    if (knownKeys.has(fact.factKey)) known.push(fact);
    else if (learnKeys.has(fact.factKey)) reveals.push(fact);
    else hidden.push(fact);
  }
  return { known, reveals, hidden };
}

/**
 * Recomputes the chapter's knowledge view from the ledger — deterministic, never trusted from model output. "Known entering chapter N"
 * means a POV-cast member's row records the fact before chapter N — committed, or provisional from an approved earlier draft that N is
 * written against and goes stale with — or the fact is open canon, which nobody had to learn.
 */
export async function loadKnowledgeView(
  db: KnowledgeDb,
  projectId: bigint,
  chapter: number,
  contract: KnowledgeContract,
  options: KnowledgeViewOptions = {},
): Promise<KnowledgeView> {
  const povKeys = [...new Set(contract.pov)];
  const [facts, povEntities] = await Promise.all([
    db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId) }),
    db.query.entities.findMany({
      columns: { id: true, entityKey: true, name: true },
      where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, povKeys)),
    }),
  ]);
  const nameByKey = new Map(povEntities.map(entity => [entity.entityKey, entity.name]));
  const pooledPov = povKeys.map(entityKey => ({ entityKey, name: nameByKey.get(entityKey) ?? entityKey }));
  if (facts.length === 0) return { known: [], reveals: [], hidden: [], readerKnows: [], pooledPov };

  const knownKeys = new Set<string>();
  const learnedIn = new Map<string, number>();
  if (povEntities.length > 0) {
    const ledger = await db.query.characterKnowledge.findMany({
      where: and(
        eq(schema.characterKnowledge.projectId, projectId),
        inArray(
          schema.characterKnowledge.entityId,
          povEntities.map(e => e.id),
        ),
        lt(schema.characterKnowledge.learnedInChapter, chapter),
      ),
    });
    const keyById = new Map(facts.map(f => [f.id, f.factKey]));
    for (const row of ledger) {
      const key = keyById.get(row.factId);
      if (!key) continue;
      knownKeys.add(key);
      learnedIn.set(key, Math.max(learnedIn.get(key) ?? 0, row.learnedInChapter));
    }
  }

  const learnKeys = new Set(contract.learns.map(reveal => reveal.factKey));
  // A plan the reveal rule would refuse today (written before it, or left stale by a plan it relied on) reveals nothing to the writer.
  const learned = facts.filter(fact => learnKeys.has(fact.factKey));
  if (learned.length > 0) {
    const ctx = await chapterUnlockContext(
      db,
      projectId,
      chapter,
      learned.some(fact => fact.unlock),
      options.overlay,
    );
    for (const fact of learned) {
      if (revealRequirements(fact, ctx).length > 0) learnKeys.delete(fact.factKey);
    }
  }
  // Open canon is a rule the whole cast lives under, not a truth anyone had to learn, so a contract narrows what is privately known and never withholds it.
  for (const fact of facts) {
    if (isOpenCanon(fact.revealChapter) && !fact.unlock && !learnKeys.has(fact.factKey)) knownKeys.add(fact.factKey);
  }
  const { known, reveals, hidden } = splitKnowledgeView(facts as FactLike[], knownKeys, learnKeys);
  const shownToReader = (fact: FactLike): boolean => fact.disclosedInChapter != null && fact.disclosedInChapter < chapter;
  if (!(options.readerKnows ?? readerKnowsLabelEnabled()) || !hidden.some(shownToReader)) return { known, reveals, hidden, readerKnows: [], pooledPov, learnedIn };

  const brief =
    options.overlay ??
    (await db.query.briefs.findFirst({ columns: { endingContract: true }, where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }));
  const mustNotResolve = mustNotResolveKeys(brief?.endingContract);
  const labelled = (fact: FactLike): boolean => shownToReader(fact) && !mustNotResolve.has(fact.factKey);
  return { known, reveals, hidden: hidden.filter(fact => !labelled(fact)), readerKnows: hidden.filter(labelled), pooledPov, learnedIn };
}

/**
 * The reader-knows label (§4.2): what the reader already read that the POV cast has not learned, so the writer can play on it without the
 * cast acting on it. The fact's writer note is the behaviour it still constrains.
 */
export function renderReaderKnows(facts: FactLike[], pov: readonly PovMember[]): string {
  const cast = pov.length > 0 ? pov.map(member => member.name).join(', ') : 'the point-of-view cast';
  const verb = pov.length > 1 ? 'do not' : 'does not';
  return facts.map(fact => withWriterNote(`- [${fact.factKey}] ${fact.text} — the reader knows; ${cast} ${verb}`, fact)).join('\n');
}

/** The judge's side of the label: the facts in full, and the cast acting on one is what it flags. */
export function renderJudgeReaderKnows(facts: FactLike[]): string {
  if (facts.length === 0) return '';
  const listed = facts.map(fact => `- [${fact.factKey}] ${fact.text}`).join('\n');
  return `\n\n## THE READER KNOWS, THE POV CAST DOES NOT\n${listed}\n\nThe prose may let the reader feel these; flag any POV character who acts on, states or relies on one in knowledgeCompliance.`;
}

function mustNotResolveKeys(endingContract: unknown): Set<string> {
  const entries = (endingContract as { mustNotResolve?: unknown } | null)?.mustNotResolve;
  if (!Array.isArray(entries)) return new Set();
  return new Set(entries.filter((entry): entry is string => typeof entry === 'string').map(entry => (entry.startsWith('fact:') ? entry.slice('fact:'.length) : entry).trim()));
}

/**
 * Facts the chapter writer must not read at `chapter`: under a knowledge contract, everything the POV cast neither
 * knows nor may learn this chapter under the reveal rule; without one, everything whose planned reveal is still ahead or whose unlock
 * does not hold there or, when unscheduled, that no brief has revealed on the page yet — a manual ledger row can record a character's private knowledge, so it
 * never unlocks the writer. A fact the brief's ending contract forbids resolving is hidden either way.
 */
export async function loadWriterHiddenFactKeys(db: KnowledgeDb, projectId: bigint, chapter: number, facts: Knowledge.CanonFact[], overlay?: PlanOverlay): Promise<Set<string>> {
  const brief =
    overlay ??
    (await db.query.briefs.findFirst({
      columns: { knowledgeContract: true, endingContract: true },
      where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)),
    }));
  const forbidden = mustNotResolveKeys(brief?.endingContract);
  const visible = await writerVisibleFactKeys(db, projectId, chapter, facts, parseKnowledgeContract(brief?.knowledgeContract), overlay);
  return new Set(facts.filter(fact => forbidden.has(fact.factKey) || !visible.has(fact.factKey)).map(fact => fact.factKey));
}

export async function writerVisibleFactKeys(
  db: KnowledgeDb,
  projectId: bigint,
  chapter: number,
  facts: Knowledge.CanonFact[],
  contract: KnowledgeContract | null,
  overlay?: PlanOverlay,
): Promise<Set<string>> {
  if (contract) {
    const view = await loadKnowledgeView(db, projectId, chapter, contract, { overlay });
    return new Set([...view.known, ...view.reveals, ...view.readerKnows].map(fact => fact.factKey));
  }
  const unscheduled = facts.filter(fact => fact.revealChapter === null);
  const onPage =
    unscheduled.length > 0
      ? await db.query.characterKnowledge.findMany({
          columns: { factId: true },
          where: and(
            eq(schema.characterKnowledge.projectId, projectId),
            eq(schema.characterKnowledge.source, 'brief'),
            inArray(
              schema.characterKnowledge.factId,
              unscheduled.map(fact => fact.id),
            ),
            lt(schema.characterKnowledge.learnedInChapter, chapter),
          ),
        })
      : [];
  const revealedOnPage = new Set(onPage.map(row => row.factId));
  const ctx = await chapterUnlockContext(
    db,
    projectId,
    chapter,
    facts.some(fact => fact.revealChapter !== null && fact.unlock),
    overlay,
  );
  const scheduled = (fact: Knowledge.CanonFact, revealChapter: number): boolean => revealChapter <= chapter && (!fact.unlock || evaluateUnlock(fact.unlock, ctx).holds);
  return new Set(facts.filter(fact => (fact.revealChapter === null ? revealedOnPage.has(fact.id) : scheduled(fact, fact.revealChapter))).map(fact => fact.factKey));
}

/** The chapter's writer-hidden facts, minus seed reader promises (which the book obeys openly) — what writer-bound text must never carry. */
export async function loadWriterForbiddenFacts(db: KnowledgeDb, projectId: bigint, chapter: number, overlay?: PlanOverlay): Promise<FactLike[]> {
  const facts = await db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId), orderBy: schema.canonFacts.factKey });
  if (facts.length === 0) return [];
  const hidden = await loadWriterHiddenFactKeys(db, projectId, chapter, facts, overlay);
  return facts.filter(fact => fact.source !== 'seed' && hidden.has(fact.factKey));
}

/** Every canon fact key of the project → its writer note, loaded only when the brief's ending contract has `mustNotResolve` entries that could name one. */
export async function loadFactWriterNotes(db: KnowledgeDb, projectId: bigint, endingContract: unknown): Promise<Map<string, string | null>> {
  const entries = (endingContract as { mustNotResolve?: unknown } | null)?.mustNotResolve;
  if (!Array.isArray(entries) || entries.length === 0) return new Map();
  const facts = await db.query.canonFacts.findMany({ columns: { factKey: true, writerNote: true }, where: eq(schema.canonFacts.projectId, projectId) });
  return new Map(facts.map(fact => [fact.factKey, fact.writerNote]));
}

/** Renders the drafter-visible ledgered facts; explicit "(none established)" so the model knows the cast starts cold. */
export function renderKnownFacts(facts: FactLike[]): string {
  if (facts.length === 0) return '(none established — the POV cast starts this chapter with no ledgered facts)';
  return facts.map(fact => `- [${fact.factKey}] ${fact.text}`).join('\n');
}

/** Renders this chapter's planned reveals — discoveries that must happen on-page. */
export function renderChapterReveals(facts: FactLike[]): string {
  return facts.map(fact => `- [${fact.factKey}] ${fact.text}`).join('\n');
}

/**
 * Renders the writer-safe notes of still-hidden facts. Deliberately omits the fact key, text and the author's
 * `constraintNote` — a hidden fact without a `writerNote` is withheld from the drafter entirely.
 */
export function renderHiddenConstraints(facts: FactLike[]): string {
  return withWriterNotes(facts)
    .map(fact => `- ${fact.writerNote}`)
    .join('\n');
}

export function withWriterNotes(facts: FactLike[]): FactLike[] {
  return facts.filter(fact => fact.writerNote?.trim());
}

/** Renders the judge-only forbidden list — full spoiler text, never enters the shared context pack. */
export function renderForbiddenFacts(facts: FactLike[]): string {
  return facts.map(fact => `- [${fact.factKey}] ${fact.text}`).join('\n');
}

export const KNOWLEDGE_LEAK_PREFIX = 'knowledge leak: ';
const UNKNOWABLE_REVEAL = 'cut anything that states or implies what the POV cast cannot know yet';

function withWriterNote(line: string, fact: FactLike | undefined): string {
  const note = fact?.writerNote?.trim();
  return note ? `${line} — ${note}` : line;
}

/**
 * The judge's leak findings name the forbidden fact and quote it, so writer-facing text gets a reduced form
 * instead: the give-away term to cut and the fact's writer note — never its key, text or author note.
 */
export function writerSafeLeakLines(prescan: Pick<KnowledgeLeakIssue, 'factKey' | 'term'>[], judgeIssues: string[], forbidden: FactLike[]): string[] {
  const factByKey = new Map(forbidden.map(fact => [fact.factKey, fact]));
  const lines = prescan.map(leak => withWriterNote(`remove or avoid "${leak.term}"`, factByKey.get(leak.factKey)));
  for (const issue of judgeIssues) {
    const cited = forbidden.filter(fact => issue.includes(fact.factKey));
    if (cited.length === 0) lines.push(UNKNOWABLE_REVEAL);
    for (const fact of cited) lines.push(withWriterNote(UNKNOWABLE_REVEAL, fact));
  }
  return [...new Set(lines)].map(line => `${KNOWLEDGE_LEAK_PREFIX}${line}`);
}

/**
 * Deterministic leak gate: each hidden fact's tell-tale terms matched against the draft by the same rule the planner
 * guard and the writer scrub use. Free, so it runs on every attempt; one issue per fact is enough to trigger a repair.
 */
export function scanKnowledgeLeaks(body: string, hidden: FactLike[]): KnowledgeLeakIssue[] {
  const issues: KnowledgeLeakIssue[] = [];
  for (const fact of hidden) {
    for (const term of fact.terms ?? []) {
      const match = revealTermPattern(term)?.exec(body);
      if (!match) continue;
      issues.push({ factKey: fact.factKey, term, excerpt: excerptAround(body, match.index, match[0].length) });
      break;
    }
  }
  return issues;
}
