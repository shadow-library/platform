import { and, eq, inArray, lt } from 'drizzle-orm';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type Knowledge, type PrimaryDatabase, schema } from '@server/database';

/** A brief's epistemic contract: who bounds the chapter, who learns what. */
interface KnowledgeReveal {
  entityKey: string;
  factKey: string;
}

export interface KnowledgeContract {
  pov: string[];
  learns: KnowledgeReveal[];
}

/** The subset of a canon-fact row the pure view/scan functions need. */
export interface FactLike {
  factKey: string;
  text: string;
  constraintNote?: string | null;
  writerNote?: string | null;
  terms?: string[] | null;
  source?: Knowledge.FactSource;
}

/** Facts partitioned by what this chapter's POV cast may see. */
export interface KnowledgeView {
  known: FactLike[];
  reveals: FactLike[];
  hidden: FactLike[];
}

export interface KnowledgeLeakIssue {
  factKey: string;
  term: string;
  excerpt: string;
}

/** The narrow database surface the loaders need — satisfied by both the client and a transaction. */
type KnowledgeDb = Pick<PrimaryDatabase, 'query' | 'insert'>;

const logger = Logger.getLogger(APP_NAME, 'knowledge-view');

// Terms shorter than this are too collision-prone to scan for.
const MIN_TERM_LENGTH = 3;
const EXCERPT_RADIUS = 60;

const EMPTY_VIEW: KnowledgeView = { known: [], reveals: [], hidden: [] };

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function excerptAround(body: string, index: number, length: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(body.length, index + length + EXCERPT_RADIUS);
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`;
}

/** Parses a brief's stored `knowledgeContract`; null (feature off) unless it names at least one POV entity. */
export function parseKnowledgeContract(raw: unknown): KnowledgeContract | null {
  if (!raw || typeof raw !== 'object') return null;
  const contract = raw as { pov?: unknown; learns?: unknown };
  const pov = Array.isArray(contract.pov) ? contract.pov.filter((key): key is string => typeof key === 'string' && key.length > 0) : [];
  if (pov.length === 0) return null;
  const learns = Array.isArray(contract.learns)
    ? contract.learns.filter((entry): entry is KnowledgeReveal => {
        const reveal = entry as Partial<KnowledgeReveal> | null;
        return typeof reveal?.entityKey === 'string' && typeof reveal.factKey === 'string';
      })
    : [];
  return { pov, learns };
}

/** Partitions the project's facts: ledgered before this chapter → known, contracted this chapter → reveals, everything else → hidden. */
export function splitKnowledgeView(facts: FactLike[], knownKeys: ReadonlySet<string>, learnKeys: ReadonlySet<string>): KnowledgeView {
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
 * Recomputes the chapter's knowledge view from the ledger — deterministic, never trusted from model
 * output. "Known entering chapter N" means a POV-cast member ledgered the fact before chapter N.
 */
export async function loadKnowledgeView(db: KnowledgeDb, projectId: bigint, chapter: number, contract: KnowledgeContract): Promise<KnowledgeView> {
  const facts = await db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId) });
  if (facts.length === 0) return EMPTY_VIEW;

  const povEntities = await db.query.entities.findMany({
    columns: { id: true },
    where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, contract.pov)),
  });

  const knownKeys = new Set<string>();
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
      if (key) knownKeys.add(key);
    }
  }

  const learnKeys = new Set(contract.learns.map(reveal => reveal.factKey));
  return splitKnowledgeView(facts as FactLike[], knownKeys, learnKeys);
}

function mustNotResolveKeys(endingContract: unknown): Set<string> {
  const entries = (endingContract as { mustNotResolve?: unknown } | null)?.mustNotResolve;
  if (!Array.isArray(entries)) return new Set();
  return new Set(entries.filter((entry): entry is string => typeof entry === 'string').map(entry => (entry.startsWith('fact:') ? entry.slice('fact:'.length) : entry).trim()));
}

/**
 * Facts the chapter writer must not read at `chapter`: under a knowledge contract, everything the POV cast neither
 * knows nor learns this chapter; without one, everything whose planned reveal is still ahead or, when unscheduled,
 * that no brief has revealed on the page yet — a manual ledger row can record a character's private knowledge, so it
 * never unlocks the writer. A fact the brief's ending contract forbids resolving is hidden either way.
 */
export async function loadWriterHiddenFactKeys(db: KnowledgeDb, projectId: bigint, chapter: number, facts: Knowledge.CanonFact[]): Promise<Set<string>> {
  const brief = await db.query.briefs.findFirst({
    columns: { knowledgeContract: true, endingContract: true },
    where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)),
  });
  const forbidden = mustNotResolveKeys(brief?.endingContract);
  const visible = await writerVisibleFactKeys(db, projectId, chapter, facts, parseKnowledgeContract(brief?.knowledgeContract));
  return new Set(facts.filter(fact => forbidden.has(fact.factKey) || !visible.has(fact.factKey)).map(fact => fact.factKey));
}

async function writerVisibleFactKeys(db: KnowledgeDb, projectId: bigint, chapter: number, facts: Knowledge.CanonFact[], contract: KnowledgeContract | null): Promise<Set<string>> {
  if (contract) {
    const view = await loadKnowledgeView(db, projectId, chapter, contract);
    return new Set([...view.known, ...view.reveals].map(fact => fact.factKey));
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
  return new Set(facts.filter(fact => (fact.revealChapter === null ? revealedOnPage.has(fact.id) : fact.revealChapter <= chapter)).map(fact => fact.factKey));
}

/** The chapter's writer-hidden facts, minus seed reader promises (which the book obeys openly) — what writer-bound text must never carry. */
export async function loadWriterForbiddenFacts(db: KnowledgeDb, projectId: bigint, chapter: number): Promise<FactLike[]> {
  const facts = await db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId) });
  if (facts.length === 0) return [];
  const hidden = await loadWriterHiddenFactKeys(db, projectId, chapter, facts);
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
const PRESCAN_LEAK = /^"(.+?)" exposes \[([^\]]+)\]/;
const WITHHELD = '[withheld]';

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

function wholeMention(value: string): RegExp {
  return new RegExp(`(?<![\\w])${escapeRegExp(value)}(?![\\w])`, 'gi');
}

/**
 * Makes author- or judge-written text (a revision note, regeneration guidance) safe for the writer: knowledge-leak
 * finding lines are replaced by their writer-safe forms, and any remaining mention of a forbidden fact's text,
 * author note or key is withheld.
 */
export function scrubForWriter(text: string, forbidden: FactLike[]): string {
  if (!text || forbidden.length === 0) return text;
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

  const secrets = forbidden
    .flatMap(fact => [fact.text, fact.constraintNote, `fact:${fact.factKey}`, fact.factKey])
    .filter((secret): secret is string => typeof secret === 'string' && secret.trim().length >= MIN_TERM_LENGTH)
    .sort((a, b) => b.length - a.length);
  let scrubbed = kept.join('\n');
  for (const secret of secrets) scrubbed = scrubbed.replace(wholeMention(secret.trim()), WITHHELD);

  const safe = writerSafeLeakLines(prescan, judgeIssues, forbidden).map(line => `- ${line.slice(KNOWLEDGE_LEAK_PREFIX.length)}`);
  return [scrubbed.trim(), ...safe].filter(Boolean).join('\n');
}

/**
 * Deterministic leak gate: word-boundary, case-insensitive match of each hidden fact's
 * tell-tale terms against the draft. Free, so it runs on every attempt; one issue per fact is
 * enough to trigger a repair.
 */
export function scanKnowledgeLeaks(body: string, hidden: FactLike[]): KnowledgeLeakIssue[] {
  const issues: KnowledgeLeakIssue[] = [];
  for (const fact of hidden) {
    for (const term of fact.terms ?? []) {
      if (term.length < MIN_TERM_LENGTH) continue;
      const match = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').exec(body);
      if (!match) continue;
      issues.push({ factKey: fact.factKey, term, excerpt: excerptAround(body, match.index, term.length) });
      break;
    }
  }
  return issues;
}

/**
 * Applies a brief's `learns` declarations to the ledger at draft approval — the
 * deterministic alternative to AI extraction. Unknown entity/fact keys are logged and skipped:
 * approval is a human gate and a missed row is recoverable via the manual reveal endpoint.
 */
export async function applyBriefReveals(db: KnowledgeDb, projectId: bigint, chapter: number): Promise<{ applied: number; skipped: string[] }> {
  const brief = await db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
  const contract = parseKnowledgeContract(brief?.knowledgeContract);
  if (!contract || contract.learns.length === 0) return { applied: 0, skipped: [] };

  const factKeys = [...new Set(contract.learns.map(reveal => reveal.factKey))];
  const entityKeys = [...new Set(contract.learns.map(reveal => reveal.entityKey))];
  const [facts, entities] = await Promise.all([
    db.query.canonFacts.findMany({ where: and(eq(schema.canonFacts.projectId, projectId), inArray(schema.canonFacts.factKey, factKeys)) }),
    db.query.entities.findMany({ where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, entityKeys)) }),
  ]);
  const factIdByKey = new Map(facts.map(fact => [fact.factKey, fact.id]));
  const entityIdByKey = new Map(entities.map(entity => [entity.entityKey, entity.id]));

  const skipped: string[] = [];
  const rows: (typeof schema.characterKnowledge.$inferInsert)[] = [];
  for (const reveal of contract.learns) {
    const factId = factIdByKey.get(reveal.factKey);
    const entityId = entityIdByKey.get(reveal.entityKey);
    if (!factId || !entityId) {
      skipped.push(`${reveal.entityKey}→${reveal.factKey}`);
      continue;
    }
    rows.push({ projectId, factId, entityId, learnedInChapter: chapter, source: 'brief' });
  }

  if (rows.length > 0) await db.insert(schema.characterKnowledge).values(rows).onConflictDoNothing();
  if (skipped.length > 0) logger.warn('brief reveals reference unknown keys — skipped', { projectId, chapter, skipped });
  return { applied: rows.length, skipped };
}
