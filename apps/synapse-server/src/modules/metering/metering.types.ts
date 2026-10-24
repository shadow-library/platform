import { type SynapseSubject } from '@shadow-library/synapse';

import { type BudgetSpec, type BudgetWindow, type Effort } from '@modules/catalog';
import { type NormalizedUsage } from '@modules/providers';
import { type Ledger } from '@server/database';

export interface BudgetCounterKey {
  app: string;
  subjectType: string;
  subjectId: string;
  window: BudgetWindow;
  windowStart: Date;
}

export interface BudgetLimits {
  maxCalls?: number;
  maxListCostUsd?: number;
}

export interface BudgetAdmissionRequest extends BudgetLimits {
  key: BudgetCounterKey;
}

export interface BudgetCounterReading {
  calls: number;
  listCostUsd: number;
}

export interface BudgetRefusal {
  request: BudgetAdmissionRequest;
  /** Absent when the refused row vanished before it could be read */
  counter?: BudgetCounterReading;
}

export interface BudgetAdmissionInput {
  budgets: readonly BudgetSpec[];
  app: string;
  subject: SynapseSubject;
  now: Date;
}

export interface LedgerClaim {
  requestId: string;
  app: string;
  subject: SynapseSubject;
  task: string;
  alias?: string;
  model: string;
  catalogVersion: number;
  effort?: Effort;
  stream: boolean;
}

export type SettledStatus = Exclude<Ledger.Status, 'pending'>;

export interface CallCost {
  listUsd: number;
  billedUsd: number;
}

export interface LedgerOutcome {
  status: SettledStatus;
  errorCode?: string;
  usage?: NormalizedUsage;
  cost: CallCost;
  latencyMs: number;
  ttftMs?: number;
  attempts: number;
  provider?: string;
  deploymentId?: string;
}

export interface Settlement {
  claim: LedgerClaim;
  outcome: LedgerOutcome;
  counters: readonly BudgetCounterKey[];
}

/** Only the sweeper writes it and no caller is ever answered with it, so it has no `AppErrorCode` entry and stays out of the client's `SynapseErrorCode` union */
export const UNSETTLED_ERROR_CODE = 'SYN_UNSETTLED';

export interface LedgerSweepCutoffs {
  /** A row still `pending` from before this belongs to a call that died unsettled */
  unsettledBefore: Date;
  /** Present only on the daily retention pass */
  pruneBefore?: Date;
}

export interface LedgerSweepResult {
  unsettled: number;
  pruned?: number;
}
