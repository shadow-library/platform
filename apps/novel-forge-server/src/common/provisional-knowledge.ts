import { and, asc, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { parseKnowledgeContract } from './knowledge-contract';
import { plannedUnlockContexts } from './plan-world';
import { revealRequirements } from './reveal-rule';

export type KnowledgeLedger = Pick<PrimaryDatabase, 'query' | 'insert' | 'delete'>;

type BriefRevealRow = typeof schema.characterKnowledge.$inferInsert;

interface LedgerPair {
  factId: bigint;
  entityId: bigint;
}

const logger = Logger.getLogger(APP_NAME, 'provisional-knowledge');

const pairKey = (pair: LedgerPair): string => `${pair.factId}:${pair.entityId}`;

// The ledger holds one row per (fact, entity), so briefs that declare the same learn share it: it records the earliest claiming chapter, and a manual row stays authoritative.
async function writeBriefReveals(db: Pick<PrimaryDatabase, 'insert'>, rows: BriefRevealRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(schema.characterKnowledge)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.characterKnowledge.factId, schema.characterKnowledge.entityId],
      set: { learnedInChapter: sql`excluded.learned_in_chapter` },
      setWhere: and(eq(schema.characterKnowledge.source, 'brief'), sql`excluded.learned_in_chapter < ${schema.characterKnowledge.learnedInChapter}`),
    });
}

/**
 * Applies a brief's `learns` declarations to the ledger at draft approval — the deterministic alternative to AI extraction. Unknown
 * entity/fact keys are logged and skipped: approval is a human gate and a missed row is recoverable via the manual reveal endpoint.
 * A learn the reveal rule refuses for the chapter is skipped too, so a plan written before the rule, or left behind by a plan it relied
 * on, never ledgers a locked fact.
 */
export async function ledgerBriefReveals(db: Pick<PrimaryDatabase, 'query' | 'insert'>, projectId: bigint, chapter: number): Promise<{ applied: number; skipped: string[] }> {
  const brief = await db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
  const contract = parseKnowledgeContract(brief?.knowledgeContract);
  if (!contract || contract.learns.length === 0) return { applied: 0, skipped: [] };

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
  const rows = new Map<string, BriefRevealRow>();
  for (const reveal of contract.learns) {
    if (locked.has(reveal.factKey)) continue;
    const factId = factIdByKey.get(reveal.factKey);
    const entityId = entityIdByKey.get(reveal.entityKey);
    if (!factId || !entityId) {
      skipped.push(`${reveal.entityKey}→${reveal.factKey}`);
      continue;
    }
    rows.set(pairKey({ factId, entityId }), { projectId, factId, entityId, learnedInChapter: chapter, source: 'brief' });
  }

  await writeBriefReveals(db, [...rows.values()]);
  if (skipped.length > 0) logger.warn('brief reveals reference unknown keys — skipped', { projectId, chapter, skipped });
  if (locked.size > 0) logger.warn('brief reveals the reveal rule refuses at this chapter — skipped', { projectId, chapter, locked: [...locked] });
  return { applied: rows.size, skipped };
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

async function reledgerRemainingClaims(db: KnowledgeLedger, projectId: bigint, revoked: number[], deleted: LedgerPair[]): Promise<void> {
  const [facts, entities, claimants] = await Promise.all([
    db.query.canonFacts.findMany({
      columns: { id: true, factKey: true, revealChapter: true, unlock: true, source: true },
      where: inArray(schema.canonFacts.id, [...new Set(deleted.map(pair => pair.factId))]),
    }),
    db.query.entities.findMany({ columns: { id: true, entityKey: true }, where: inArray(schema.entities.id, [...new Set(deleted.map(pair => pair.entityId))]) }),
    db.query.drafts.findMany({
      columns: { chapter: true },
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
  const factByKey = new Map(facts.map(fact => [fact.factKey, fact]));
  const entityIdByKey = new Map(entities.map(entity => [entity.entityKey, entity.id]));
  const contextAt = await plannedUnlockContexts(
    db,
    projectId,
    facts.some(fact => fact.unlock),
  );
  const earliest = new Map<string, BriefRevealRow>();
  for (const brief of briefs) {
    for (const reveal of parseKnowledgeContract(brief.knowledgeContract)?.learns ?? []) {
      const fact = factByKey.get(reveal.factKey);
      const factId = fact && revealRequirements(fact, contextAt(brief.chapter)).length === 0 ? fact.id : undefined;
      const entityId = entityIdByKey.get(reveal.entityKey);
      if (!factId || !entityId) continue;
      const key = pairKey({ factId, entityId });
      if (wanted.has(key) && !earliest.has(key)) earliest.set(key, { projectId, factId, entityId, learnedInChapter: brief.chapter, source: 'brief' });
    }
  }

  await writeBriefReveals(db, [...earliest.values()]);
  if (earliest.size > 0) logger.info('revoked brief reveals re-ledgered from the chapters that still claim them', { projectId, revoked, restored: earliest.size });
}
