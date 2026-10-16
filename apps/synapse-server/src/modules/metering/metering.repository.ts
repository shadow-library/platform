import { and, eq, lt, type SQL, sql, TransactionRollbackError } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type Ledger, type PrimaryDatabase, schema } from '@server/database';

import { usdLiteral } from './cost.util';
import { type BudgetAdmissionRequest, type BudgetCounterKey, type BudgetRefusal, type LedgerSweepCutoffs, type LedgerSweepResult, UNSETTLED_ERROR_CODE } from './metering.types';

export type LedgerSettlementValues = Omit<Partial<Ledger.NewEntry>, 'requestId' | 'app' | 'subjectType' | 'subjectId' | 'task' | 'createdAt'>;

const counters = schema.budgetCounters;
const ledger = schema.ledger;

/** Transaction-scoped, so a replica that dies mid-sweep never leaves the lock held */
const RETENTION_LOCK = sql`select pg_try_advisory_xact_lock(hashtext('synapse:retention')) as locked`;

function counterMatches(key: BudgetCounterKey): SQL | undefined {
  return and(
    eq(counters.app, key.app),
    eq(counters.subjectType, key.subjectType),
    eq(counters.subjectId, key.subjectId),
    eq(counters.window, key.window),
    eq(counters.windowStart, key.windowStart),
  );
}

function belowLimits(request: BudgetAdmissionRequest): SQL | undefined {
  const limits: SQL[] = [];
  if (request.maxCalls !== undefined) limits.push(sql`${counters.calls} < ${request.maxCalls}`);
  if (request.maxListCostUsd !== undefined) limits.push(sql`${counters.listCostUsd} < ${usdLiteral(request.maxListCostUsd)}::numeric`);
  return and(...limits);
}

@Injectable()
export class MeteringRepository {
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Resolves `false` when the request id is already in the ledger, whichever replica or app claimed it */
  claimRequest(entry: Ledger.NewEntry): Promise<boolean> {
    return this.databaseService.run(async () => {
      const rows = await this.db.insert(ledger).values(entry).onConflictDoNothing({ target: ledger.requestId }).returning({ requestId: ledger.requestId });
      return rows.length > 0;
    });
  }

  /**
   * One conditional upsert per budget, all in one transaction: a refusal by any budget rolls back the calls the earlier ones counted, so a
   * refused request spends no budget. The refused row is read in the same transaction to tell a call limit from a cost limit.
   */
  async admitBudgets(requests: readonly BudgetAdmissionRequest[]): Promise<BudgetRefusal | undefined> {
    if (requests.length === 0) return undefined;
    let refusal: BudgetRefusal | undefined;
    try {
      await this.db.transaction(async tx => {
        for (const request of requests) {
          const admitted = await tx
            .insert(counters)
            .values({ ...request.key, calls: 1 })
            .onConflictDoUpdate({
              target: [counters.app, counters.subjectType, counters.subjectId, counters.window, counters.windowStart],
              set: { calls: sql`${counters.calls} + 1` },
              setWhere: belowLimits(request),
            })
            .returning({ calls: counters.calls });
          if (admitted.length > 0) continue;

          const [counter] = await tx.select({ calls: counters.calls, listCostUsd: counters.listCostUsd }).from(counters).where(counterMatches(request.key));
          refusal = { request, ...(counter ? { counter } : {}) };
          tx.rollback();
        }
      });
    } catch (error) {
      if (!refusal || !(error instanceof TransactionRollbackError)) this.databaseService.translateError(error);
    }
    return refusal;
  }

  /** Only a `pending` row is settled, so a request is never reported twice, and a row already settled or swept charges no budget */
  settle(requestId: string, values: LedgerSettlementValues, charged: readonly BudgetCounterKey[], listCostUsd: number): Promise<void> {
    return this.databaseService.run(() =>
      this.db.transaction(async tx => {
        const settled = await tx
          .update(ledger)
          .set(values)
          .where(and(eq(ledger.requestId, requestId), eq(ledger.status, 'pending')))
          .returning({ requestId: ledger.requestId });
        if (settled.length === 0 || listCostUsd <= 0) return;
        for (const key of charged) {
          await tx
            .update(counters)
            .set({ listCostUsd: sql`${counters.listCostUsd} + ${usdLiteral(listCostUsd)}::numeric` })
            .where(counterMatches(key));
        }
      }),
    );
  }

  /** Marks calls that died unsettled and, on the retention pass, prunes old rows; resolves `undefined` when another replica holds the lock */
  sweepLedger(cutoffs: LedgerSweepCutoffs): Promise<LedgerSweepResult | undefined> {
    return this.databaseService.run(() =>
      this.db.transaction(async tx => {
        const [lock] = await tx.execute<{ locked: boolean }>(RETENTION_LOCK);
        if (lock?.locked !== true) return undefined;
        const unsettled = await tx
          .update(ledger)
          .set({ status: 'error', errorCode: UNSETTLED_ERROR_CODE })
          .where(and(eq(ledger.status, 'pending'), lt(ledger.createdAt, cutoffs.unsettledBefore)))
          .returning({ requestId: ledger.requestId });
        if (!cutoffs.pruneBefore) return { unsettled: unsettled.length };
        const [result] = await tx.execute<{ deleted: number }>(
          sql`with pruned as (delete from ${ledger} where ${ledger.createdAt} < ${cutoffs.pruneBefore.toISOString()}::timestamptz returning 1) select count(*)::int as deleted from pruned`,
        );
        return { unsettled: unsettled.length, pruned: Number(result?.deleted ?? 0) };
      }),
    );
  }
}
