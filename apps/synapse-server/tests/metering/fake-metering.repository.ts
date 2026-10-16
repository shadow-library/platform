import { type LedgerSettlementValues, type MeteringRepository } from '@modules/metering/metering.repository';
import { type BudgetAdmissionRequest, type BudgetCounterKey, type BudgetRefusal, type LedgerSweepCutoffs, type LedgerSweepResult } from '@modules/metering/metering.types';
import { type Ledger } from '@server/database';

export interface RecordedSettlement {
  requestId: string;
  values: LedgerSettlementValues;
  charged: readonly BudgetCounterKey[];
  listCostUsd: number;
}

/** An in-memory ledger: request ids claim once, and each admission answers with `refuse(request)` or admits */
export class FakeMeteringRepository {
  readonly claimed = new Map<string, Ledger.NewEntry>();
  readonly admissions: BudgetAdmissionRequest[][] = [];
  readonly settlements: RecordedSettlement[] = [];
  readonly sweeps: LedgerSweepCutoffs[] = [];
  refuse: (request: BudgetAdmissionRequest) => BudgetRefusal | undefined = () => undefined;
  settleFailure: Error | undefined;
  sweepResult: (cutoffs: LedgerSweepCutoffs) => LedgerSweepResult | undefined | Error = cutoffs => ({ unsettled: 0, ...(cutoffs.pruneBefore ? { pruned: 0 } : {}) });

  async claimRequest(entry: Ledger.NewEntry): Promise<boolean> {
    if (this.claimed.has(entry.requestId)) return false;
    this.claimed.set(entry.requestId, entry);
    return true;
  }

  async admitBudgets(requests: readonly BudgetAdmissionRequest[]): Promise<BudgetRefusal | undefined> {
    this.admissions.push([...requests]);
    for (const request of requests) {
      const refusal = this.refuse(request);
      if (refusal) return refusal;
    }
    return undefined;
  }

  async settle(requestId: string, values: LedgerSettlementValues, charged: readonly BudgetCounterKey[], listCostUsd: number): Promise<void> {
    if (this.settleFailure) throw this.settleFailure;
    this.settlements.push({ requestId, values, charged, listCostUsd });
  }

  async sweepLedger(cutoffs: LedgerSweepCutoffs): Promise<LedgerSweepResult | undefined> {
    this.sweeps.push(cutoffs);
    const result = this.sweepResult(cutoffs);
    if (result instanceof Error) throw result;
    return result;
  }

  asRepository(): MeteringRepository {
    return this as unknown as MeteringRepository;
  }
}
