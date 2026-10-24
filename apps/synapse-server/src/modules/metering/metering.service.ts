import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { type BudgetSpec } from '@modules/catalog';
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { appCounterKey, windowStart } from './budget-window.util';
import { type LedgerSettlementValues, MeteringRepository } from './metering.repository';
import { type BudgetAdmissionInput, type BudgetAdmissionRequest, type BudgetCounterKey, type BudgetRefusal, type LedgerClaim, type Settlement } from './metering.types';

function admissionRequest(budget: BudgetSpec, input: BudgetAdmissionInput): BudgetAdmissionRequest {
  const key: BudgetCounterKey =
    budget.per === 'app'
      ? appCounterKey(input.app, budget.window, input.now)
      : { app: input.app, subjectType: input.subject.type, subjectId: input.subject.id, window: budget.window, windowStart: windowStart(budget.window, input.now) };
  return {
    key,
    ...(budget.maxCalls === undefined ? {} : { maxCalls: budget.maxCalls }),
    ...(budget.maxListCostUsd === undefined ? {} : { maxListCostUsd: budget.maxListCostUsd }),
  };
}

function counterId(key: BudgetCounterKey): string {
  return [key.app, key.subjectType, key.subjectId, key.window, key.windowStart.toISOString()].join('\u0000');
}

function tighter(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right;
  return right === undefined ? left : Math.min(left, right);
}

/**
 * Budgets naming the same counter, such as two for one app and window, or a per-subject one for an `app` subject beside a per-app one, would
 * upsert one row twice and count the call twice; they collapse into one request under the tightest limits. Sorted by key, every replica
 * takes the counter rows' locks in the same order, so concurrent admissions cannot deadlock.
 */
function collapseByCounter(requests: BudgetAdmissionRequest[]): BudgetAdmissionRequest[] {
  const merged = new Map<string, BudgetAdmissionRequest>();
  for (const request of requests) {
    const id = counterId(request.key);
    const existing = merged.get(id);
    if (!existing) {
      merged.set(id, request);
      continue;
    }
    const maxCalls = tighter(existing.maxCalls, request.maxCalls);
    const maxListCostUsd = tighter(existing.maxListCostUsd, request.maxListCostUsd);
    merged.set(id, { key: existing.key, ...(maxCalls === undefined ? {} : { maxCalls }), ...(maxListCostUsd === undefined ? {} : { maxListCostUsd }) });
  }
  return [...merged.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(([, request]) => request);
}

/** A limit no first call can fit under is refused before the upsert, whose insert branch always counts the first call */
function refusedOutright(request: BudgetAdmissionRequest): boolean {
  return (request.maxCalls !== undefined && request.maxCalls <= 0) || (request.maxListCostUsd !== undefined && request.maxListCostUsd <= 0);
}

function costIsTheReason(refusal: BudgetRefusal): boolean {
  const { maxListCostUsd } = refusal.request;
  if (maxListCostUsd === undefined) return false;
  return maxListCostUsd <= 0 || (refusal.counter !== undefined && refusal.counter.listCostUsd >= maxListCostUsd);
}

function settlementValues({ claim, outcome }: Settlement): LedgerSettlementValues {
  const usage = outcome.usage;
  return {
    status: outcome.status,
    errorCode: outcome.errorCode ?? null,
    alias: claim.alias ?? null,
    model: claim.model,
    provider: outcome.provider ?? null,
    deploymentId: outcome.deploymentId ?? null,
    catalogVersion: claim.catalogVersion,
    inputTokens: usage?.inputTokens ?? 0,
    cachedInputTokens: usage?.cachedInputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    reasoningTokens: usage?.reasoningTokens ?? 0,
    listCostUsd: outcome.cost.listUsd,
    billedCostUsd: outcome.cost.billedUsd,
    latencyMs: outcome.latencyMs,
    ttftMs: outcome.ttftMs ?? null,
    attempts: outcome.attempts,
    effort: claim.effort ?? null,
    stream: claim.stream,
  };
}

@Injectable()
export class MeteringService {
  private readonly logger = Logger.getLogger(APP_NAME, MeteringService.name);

  constructor(private readonly repository: MeteringRepository) {}

  async claim(claim: LedgerClaim): Promise<void> {
    const claimed = await this.repository.claimRequest({
      requestId: claim.requestId,
      app: claim.app,
      subjectType: claim.subject.type,
      subjectId: claim.subject.id,
      task: claim.task,
      alias: claim.alias ?? null,
      model: claim.model,
      catalogVersion: claim.catalogVersion,
      status: 'pending',
      effort: claim.effort ?? null,
      stream: claim.stream,
    });
    if (!claimed) throw AppErrorCode.SYN_DUPLICATE_REQUEST.create({ requestId: claim.requestId });
  }

  /** Returns the distinct counters admission incremented, which settlement later charges once each */
  async admit(input: BudgetAdmissionInput): Promise<BudgetCounterKey[]> {
    const requests = collapseByCounter(input.budgets.filter(budget => budget.app === input.app).map(budget => admissionRequest(budget, input)));
    const outright = requests.find(refusedOutright);
    const refusal = outright ? { request: outright } : await this.repository.admitBudgets(requests);
    if (!refusal) return requests.map(request => request.key);

    const { key } = refusal.request;
    this.logger.info('Refused a call over budget', { app: key.app, subjectType: key.subjectType, window: key.window, counter: refusal.counter });
    throw costIsTheReason(refusal) ? AppErrorCode.SYN_BUDGET_COST.create({ window: key.window }) : AppErrorCode.SYN_BUDGET_CALLS.create({ window: key.window });
  }

  /** Never rejects: a call that already answered must not fail because its accounting did */
  async settle(settlement: Settlement): Promise<void> {
    const { claim, outcome, counters } = settlement;
    try {
      await this.repository.settle(claim.requestId, settlementValues(settlement), counters, outcome.cost.listUsd);
    } catch (error) {
      this.logger.error('Failed to settle a call', { requestId: claim.requestId, app: claim.app, task: claim.task, status: outcome.status, error });
    }
  }
}
