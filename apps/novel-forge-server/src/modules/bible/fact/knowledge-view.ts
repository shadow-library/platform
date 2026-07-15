/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Logger } from '@shadow-library/common';
import { and, eq, inArray, lt } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

/** A brief's epistemic contract (character-knowledge design §3): who bounds the chapter, who learns what. */
export interface KnowledgeReveal {
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
  terms?: string[] | null;
}

/** Facts partitioned by what this chapter's POV cast may see (design §4). */
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

/**
 * Declaring the constants
 */

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
 * Renders POV-safe behavior compiled from still-hidden facts. Deliberately omits the fact key and
 * text — this is the only trace of a hidden fact the drafter is ever allowed to see.
 */
export function renderHiddenConstraints(facts: FactLike[]): string {
  return facts
    .filter(fact => fact.constraintNote)
    .map(fact => `- ${fact.constraintNote}`)
    .join('\n');
}

/** Renders the judge-only forbidden list — full spoiler text, never enters the shared context pack. */
export function renderForbiddenFacts(facts: FactLike[]): string {
  return facts.map(fact => `- [${fact.factKey}] ${fact.text}`).join('\n');
}

/**
 * Deterministic leak gate (design §6): word-boundary, case-insensitive match of each hidden fact's
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
 * Applies a brief's `learns` declarations to the ledger at draft approval (design §4) — the
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
