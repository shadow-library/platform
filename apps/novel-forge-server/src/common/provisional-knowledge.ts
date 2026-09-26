import { and, asc, eq, inArray, isNull, lte, notInArray, or, sql } from 'drizzle-orm';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { parseKnowledgeContract } from './knowledge-contract';
import { isOpenCanon } from './open-canon';
import { plannedUnlockContexts } from './plan-world';
import { revealRequirements } from './reveal-rule';

export type KnowledgeLedger = Pick<PrimaryDatabase, 'query' | 'insert' | 'delete'>;

export type KnowledgeCommitter = KnowledgeLedger & Pick<PrimaryDatabase, 'update'>;

type BriefRevealRow = typeof schema.characterKnowledge.$inferInsert;

interface LedgerPair {
  factId: bigint;
  entityId: bigint;
}

interface ResolvedBriefReveals {
  pairs: LedgerPair[];
  factIds: bigint[];
  skipped: string[];
  locked: string[];
}

const logger = Logger.getLogger(APP_NAME, 'provisional-knowledge');

const pairKey = (pair: LedgerPair): string => `${pair.factId}:${pair.entityId}`;

// The ledger holds one row per (fact, entity), so briefs that declare the same learn share it: it records the earliest claiming chapter with that
// chapter's status and revision, and a manual row stays authoritative.
async function writeBriefReveals(db: Pick<PrimaryDatabase, 'insert'>, rows: BriefRevealRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(schema.characterKnowledge)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.characterKnowledge.factId, schema.characterKnowledge.entityId],
      set: { learnedInChapter: sql`excluded.learned_in_chapter`, status: sql`excluded.status`, draftRevision: sql`excluded.draft_revision` },
      setWhere: and(eq(schema.characterKnowledge.source, 'brief'), sql`excluded.learned_in_chapter < ${schema.characterKnowledge.learnedInChapter}`),
    });
}

/** The chapter plan's `learns` the reveal rule lets through: the ledger pairs, and every fact they reveal to the reader, whether or not its learner resolves. */
async function resolveBriefReveals(db: Pick<PrimaryDatabase, 'query'>, projectId: bigint, chapter: number): Promise<ResolvedBriefReveals> {
  const brief = await db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
  const contract = parseKnowledgeContract(brief?.knowledgeContract);
  if (!contract || contract.learns.length === 0) return { pairs: [], factIds: [], skipped: [], locked: [] };

  const factKeys = [...new Set(contract.learns.map(reveal => reveal.factKey))];
  const entityKeys = [...new Set(contract.learns.map(reveal => reveal.entityKey))];
  const [facts, entities] = await Promise.all([
    db.query.canonFacts.findMany({ where: and(eq(schema.canonFacts.projectId, projectId), inArray(schema.canonFacts.factKey, factKeys)) }),
    db.query.entities.findMany({ where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, entityKeys)) }),
  ]);
  const contextAt = await plannedUnlockContexts(
    db,
    projectId,
    facts.some(fact => fact.unlock),
  );
  const locked = new Set(facts.filter(fact => revealRequirements(fact, contextAt(chapter)).length > 0).map(fact => fact.factKey));
  const factIdByKey = new Map(facts.filter(fact => !locked.has(fact.factKey)).map(fact => [fact.factKey, fact.id]));
  const entityIdByKey = new Map(entities.map(entity => [entity.entityKey, entity.id]));

  const skipped: string[] = [];
  const pairs = new Map<string, LedgerPair>();
  for (const reveal of contract.learns) {
    if (locked.has(reveal.factKey)) continue;
    const factId = factIdByKey.get(reveal.factKey);
    const entityId = entityIdByKey.get(reveal.entityKey);
    if (!factId || !entityId) {
      skipped.push(`${reveal.entityKey}→${reveal.factKey}`);
      continue;
    }
    pairs.set(pairKey({ factId, entityId }), { factId, entityId });
  }
  return { pairs: [...pairs.values()], factIds: [...factIdByKey.values()], skipped, locked: [...locked] };
}

/**
 * Replaces the chapter's provisional knowledge with its plan's `learns`, bound to the draft revision being approved — the deterministic
 * alternative to AI extraction. Unknown entity/fact keys are logged and skipped: approval is a human gate and a missed row is recoverable
 * via the manual reveal endpoint. A learn the reveal rule refuses for the chapter is skipped too, so a plan written before the rule, or left
 * behind by a plan it relied on, never ledgers a locked fact. Call it inside the approving transaction, after the approval.
 */
export async function ledgerBriefReveals(db: KnowledgeLedger, projectId: bigint, chapter: number, draftRevision: number): Promise<{ applied: number; skipped: string[] }> {
  await revokeProvisionalReveals(db, projectId, chapter);
  const { pairs, skipped, locked } = await resolveBriefReveals(db, projectId, chapter);
  const rows = pairs.map(pair => ({ projectId, ...pair, learnedInChapter: chapter, source: 'brief' as const, status: 'provisional' as const, draftRevision }));

  await writeBriefReveals(db, rows);
  if (skipped.length > 0) logger.warn('brief reveals reference unknown keys — skipped', { projectId, chapter, skipped });
  if (locked.length > 0) logger.warn('brief reveals the reveal rule refuses at this chapter — skipped', { projectId, chapter, locked });
  return { applied: rows.length, skipped };
}

/**
 * Until its chapter is final, a brief reveal holds only while the approval that ledgered it does, so a draft change revokes its
 * chapter's `brief` rows. A revoked pair another approved or final chapter also claims is re-ledgered at the earliest such chapter,
 * and only the revoked pairs are, so a reveal the author retracted by hand stays retracted. Call it inside the transaction that reset
 * the approval, after the reset.
 */
export async function revokeProvisionalReveals(db: KnowledgeLedger, projectId: bigint, chapters: number | readonly number[]): Promise<void> {
  const revoked = typeof chapters === 'number' ? [chapters] : [...chapters];
  if (revoked.length === 0) return;
  const chapter = typeof chapters === 'number' ? eq(schema.characterKnowledge.learnedInChapter, chapters) : inArray(schema.characterKnowledge.learnedInChapter, revoked);
  const deleted = await db
    .delete(schema.characterKnowledge)
    .where(and(eq(schema.characterKnowledge.projectId, projectId), eq(schema.characterKnowledge.source, 'brief'), chapter))
    .returning({ factId: schema.characterKnowledge.factId, entityId: schema.characterKnowledge.entityId });
  if (deleted.length > 0) await reledgerRemainingClaims(db, projectId, revoked, deleted);
}

/**
 * The reader learns a fact in the chapter that shows it: under a knowledge contract, each `learns` the reveal rule allows; without one, each
 * dated fact that first becomes showable there — never open canon, which the book states from the start, nor a fact showable earlier.
 * An earlier disclosure stands, and a chapter with no plan discloses nothing.
 */
export async function discloseChapterReveals(db: Pick<PrimaryDatabase, 'query' | 'update'>, projectId: bigint, chapter: number): Promise<void> {
  const brief = await db.query.briefs.findFirst({
    columns: { knowledgeContract: true },
    where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)),
  });
  if (!brief) return;
  const factIds = parseKnowledgeContract(brief.knowledgeContract) ? (await resolveBriefReveals(db, projectId, chapter)).factIds : await datedReveals(db, projectId, chapter);
  if (factIds.length === 0) return;
  await db
    .update(schema.canonFacts)
    .set({ disclosedInChapter: chapter, updatedAt: new Date() })
    .where(and(eq(schema.canonFacts.projectId, projectId), inArray(schema.canonFacts.id, factIds), isNull(schema.canonFacts.disclosedInChapter)));
}

async function datedReveals(db: Pick<PrimaryDatabase, 'query'>, projectId: bigint, chapter: number): Promise<bigint[]> {
  const facts = await db.query.canonFacts.findMany({
    where: and(eq(schema.canonFacts.projectId, projectId), lte(schema.canonFacts.revealChapter, chapter), isNull(schema.canonFacts.disclosedInChapter)),
  });
  const dated = facts.filter(fact => !isOpenCanon(fact.revealChapter));
  if (dated.length === 0) return [];
  const contextAt = await plannedUnlockContexts(
    db,
    projectId,
    dated.some(fact => fact.unlock),
  );
  const holdsAt = (fact: (typeof dated)[number], at: number): boolean => revealRequirements(fact, contextAt(at)).length === 0;
  return dated.filter(fact => holdsAt(fact, chapter) && !holdsAt(fact, chapter - 1)).map(fact => fact.id);
}

/**
 * Finalizing commits what the approval ledgered: the chapter's provisional rows bound to the finalized revision become committed, and the
 * chapter's reveals are disclosed to the reader. Every step matches only what is still pending, so a replayed finalization changes nothing.
 */
export async function commitChapterKnowledge(db: KnowledgeCommitter, projectId: bigint, chapter: number, draftRevision: number): Promise<void> {
  const provisional = and(
    eq(schema.characterKnowledge.projectId, projectId),
    eq(schema.characterKnowledge.source, 'brief'),
    eq(schema.characterKnowledge.learnedInChapter, chapter),
    eq(schema.characterKnowledge.status, 'provisional'),
  );
  const committed = await db
    .update(schema.characterKnowledge)
    .set({ status: 'committed' })
    .where(and(provisional, eq(schema.characterKnowledge.draftRevision, draftRevision)))
    .returning({ factId: schema.characterKnowledge.factId });
  // Every draft change revokes the chapter's rows, so none can be bound to another revision; one that is would outlive the chapter as knowledge.
  const orphaned = await db.delete(schema.characterKnowledge).where(provisional).returning({ factId: schema.characterKnowledge.factId });
  if (orphaned.length > 0) logger.error('provisional knowledge bound to another revision survived to finalize', { projectId, chapter, draftRevision, orphaned: orphaned.length });

  await discloseChapterReveals(db, projectId, chapter);
  if (committed.length > 0) logger.info('chapter knowledge committed', { projectId, chapter, draftRevision, committed: committed.length });
}

async function reledgerRemainingClaims(db: KnowledgeLedger, projectId: bigint, revoked: number[], deleted: LedgerPair[]): Promise<void> {
  const [facts, entities, claimants] = await Promise.all([
    db.query.canonFacts.findMany({
      columns: { id: true, factKey: true, revealChapter: true, unlock: true, source: true },
      where: inArray(schema.canonFacts.id, [...new Set(deleted.map(pair => pair.factId))]),
    }),
    db.query.entities.findMany({ columns: { id: true, entityKey: true }, where: inArray(schema.entities.id, [...new Set(deleted.map(pair => pair.entityId))]) }),
    db.query.drafts.findMany({
      columns: { chapter: true, revision: true, status: true },
      where: and(
        eq(schema.drafts.projectId, projectId),
        or(eq(schema.drafts.reviewStatus, 'approved'), eq(schema.drafts.status, 'final')),
        notInArray(schema.drafts.chapter, revoked),
      ),
    }),
  ]);
  if (claimants.length === 0) return;

  const briefs = await db.query.briefs.findMany({
    columns: { chapter: true, knowledgeContract: true },
    where: and(
      eq(schema.briefs.projectId, projectId),
      inArray(
        schema.briefs.chapter,
        claimants.map(claimant => claimant.chapter),
      ),
    ),
    orderBy: asc(schema.briefs.chapter),
  });

  const wanted = new Set(deleted.map(pairKey));
  const claimantByChapter = new Map(claimants.map(claimant => [claimant.chapter, claimant]));
  const factByKey = new Map(facts.map(fact => [fact.factKey, fact]));
  const entityIdByKey = new Map(entities.map(entity => [entity.entityKey, entity.id]));
  const contextAt = await plannedUnlockContexts(
    db,
    projectId,
    facts.some(fact => fact.unlock),
  );
  const earliest = new Map<string, BriefRevealRow>();
  for (const brief of briefs) {
    const claimant = claimantByChapter.get(brief.chapter);
    for (const reveal of parseKnowledgeContract(brief.knowledgeContract)?.learns ?? []) {
      const fact = factByKey.get(reveal.factKey);
      const factId = fact && revealRequirements(fact, contextAt(brief.chapter)).length === 0 ? fact.id : undefined;
      const entityId = entityIdByKey.get(reveal.entityKey);
      if (!claimant || !factId || !entityId) continue;
      const key = pairKey({ factId, entityId });
      if (!wanted.has(key) || earliest.has(key)) continue;
      const status = claimant.status === 'final' ? 'committed' : 'provisional';
      earliest.set(key, { projectId, factId, entityId, learnedInChapter: brief.chapter, source: 'brief', status, draftRevision: claimant.revision });
    }
  }

  await writeBriefReveals(db, [...earliest.values()]);
  if (earliest.size > 0) logger.info('revoked brief reveals re-ledgered from the chapters that still claim them', { projectId, revoked, restored: earliest.size });
}
