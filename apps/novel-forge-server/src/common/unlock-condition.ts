import { and, eq, isNotNull } from 'drizzle-orm';

import { type DbExecutor, schema, type UnlockCondition, type UnlockTerm } from '@server/database';

import { shiftChapterNumber } from './chapter-shift';

const TERM_KEYS = ['milestone', 'volume', 'chapter', 'ending'] as const;

function termError(term: unknown, index: number): string | null {
  const at = `unlock.all[${index}]`;
  if (typeof term !== 'object' || term === null || Array.isArray(term)) return `${at} must be an object`;
  const keys = Object.keys(term);
  if (keys.length !== 1 || !(TERM_KEYS as readonly string[]).includes(keys[0] as string)) return `${at} must have exactly one of ${TERM_KEYS.join(', ')}`;

  const record = term as Record<string, unknown>;
  if ('milestone' in record && (typeof record['milestone'] !== 'string' || record['milestone'].trim() === '')) return `${at}.milestone must be a non-empty key`;
  if ('volume' in record && (typeof record['volume'] !== 'string' || record['volume'].trim() === '')) return `${at}.volume must be a non-empty key`;
  if ('chapter' in record && (!Number.isInteger(record['chapter']) || (record['chapter'] as number) < 1)) return `${at}.chapter must be an integer >= 1`;
  if ('ending' in record && record['ending'] !== true) return `${at}.ending must be true`;
  return null;
}

/** Structural only: whether the named milestones and volumes exist, and whether the condition holds, is the reveal rule's concern. */
export function validateUnlockCondition(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ['unlock must be an object'];
  const record = value as Record<string, unknown>;
  const unexpected = Object.keys(record).filter(key => key !== 'all');
  if (unexpected.length > 0) return unexpected.map(key => `unlock has unexpected field '${key}'`);
  if (!Array.isArray(record['all']) || record['all'].length === 0) return ['unlock.all must be a non-empty array'];
  return record['all'].flatMap((term, index) => termError(term, index) ?? []);
}

export function isUnlockCondition(value: unknown): value is UnlockCondition {
  return validateUnlockCondition(value).length === 0;
}

/** The story point an unlock is evaluated at: a plan for one chapter, with the milestones that count as reached there. */
export interface UnlockContext {
  chapter: number;
  /** The chapter planned as the ending, if any: the ending and every chapter after it (an epilogue) count as at the ending. */
  endingChapter: number | null;
  volumeKey: string | null;
  volumeOrdinals: ReadonlyMap<string, number>;
  reachedMilestones: ReadonlySet<string>;
}

export interface UnlockEvaluation {
  holds: boolean;
  missing: UnlockTerm[];
}

function termHolds(term: UnlockTerm, ctx: UnlockContext): boolean {
  if ('milestone' in term) return ctx.reachedMilestones.has(term.milestone);
  if ('chapter' in term) return ctx.chapter >= term.chapter;
  if ('ending' in term) return ctx.endingChapter !== null && ctx.chapter >= ctx.endingChapter;
  const planOrdinal = ctx.volumeKey === null ? undefined : ctx.volumeOrdinals.get(ctx.volumeKey);
  const termOrdinal = ctx.volumeOrdinals.get(term.volume);
  return planOrdinal !== undefined && termOrdinal !== undefined && planOrdinal >= termOrdinal;
}

/** Every term must hold on its own: milestones carry no order, so reaching a later rank never implies an earlier one. */
export function evaluateUnlock(condition: UnlockCondition, ctx: UnlockContext): UnlockEvaluation {
  const missing = condition.all.filter(term => !termHolds(term, ctx));
  return { holds: missing.length === 0, missing };
}

export function describeUnlockTerm(term: UnlockTerm): string {
  if ('milestone' in term) return `milestone ${term.milestone} reached`;
  if ('volume' in term) return `volume ${term.volume} reached`;
  if ('chapter' in term) return `chapter ${term.chapter} or later`;
  return 'the planned ending or later';
}

export function shiftUnlockChapters(unlock: UnlockCondition, afterChapter: number, delta = 1): UnlockCondition {
  return { all: unlock.all.map(term => ('chapter' in term ? { chapter: shiftChapterNumber(term.chapter, afterChapter, delta) } : term)) };
}

/** The `{chapter: N}` terms inside `canon_facts.unlock` are chapter numbers in jsonb, so a renumber shifts them in its own transaction. */
export async function shiftFactUnlocks(tx: DbExecutor, projectId: bigint, afterChapter: number): Promise<void> {
  const table = schema.canonFacts;
  const conditioned = await tx
    .select({ id: table.id, unlock: table.unlock })
    .from(table)
    .where(and(eq(table.projectId, projectId), isNotNull(table.unlock)))
    .for('update');

  for (const fact of conditioned) {
    if (!isUnlockCondition(fact.unlock)) continue;
    const shifted = shiftUnlockChapters(fact.unlock, afterChapter);
    if (JSON.stringify(shifted) !== JSON.stringify(fact.unlock)) await tx.update(table).set({ unlock: shifted, updatedAt: new Date() }).where(eq(table.id, fact.id));
  }
}
