import { Injectable } from '@shadow-library/app';
import { ServerErrorCode } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';

import { ActiveCatalogCache, listCostUsd, roundUsd } from '@modules/catalog';
import { ownEntry } from '@modules/catalog/catalog.utils';

import { DAY_MS, IMPACT_WINDOW_DAYS } from './admin.constants';
import { type AliasUsageRow, LedgerReportRepository } from './ledger-report.repository';

export interface AliasImpactRow extends AliasUsageRow {
  deltaUsd?: number;
}

export interface AliasRetarget {
  fromModel: string;
  toModel: string;
  currentUsd: number;
  proposedUsd: number;
  deltaUsd: number;
}

export interface AliasImpact {
  alias: string;
  model: string;
  windowDays: number;
  since: Date;
  totalCalls: number;
  rows: AliasImpactRow[];
  retarget?: AliasRetarget;
}

/** Answers "what would moving this alias cost" from the active catalog's prices replayed over the ledger's token sums, not from any recorded cost. */
@Injectable()
export class AliasImpactService {
  constructor(
    private readonly cache: ActiveCatalogCache,
    private readonly ledger: LedgerReportRepository,
  ) {}

  async impact(aliasKey: string, targetModel: string | undefined, now: Date = new Date()): Promise<AliasImpact> {
    const { document } = this.cache.requireCurrent();
    const alias = ownEntry(document.aliases, aliasKey) ?? ServerErrorCode.S009.throw();
    const current = ownEntry(document.models, alias.model);
    const target = targetModel === undefined ? undefined : ownEntry(document.models, targetModel);
    if (targetModel !== undefined && !target) throw AppErrorCode.SYN_INVALID_REQUEST.create({ param: 'model', reason: 'unknown model' });

    const since = new Date(now.getTime() - IMPACT_WINDOW_DAYS * DAY_MS);
    const usage = await this.ledger.aliasUsage(aliasKey, since);
    const impact: AliasImpact = {
      alias: aliasKey,
      model: alias.model,
      windowDays: IMPACT_WINDOW_DAYS,
      since,
      totalCalls: usage.reduce((sum, row) => sum + row.calls, 0),
      rows: usage,
    };
    if (!current || !target || targetModel === undefined) return impact;

    const rows = usage.map(row => ({ ...row, deltaUsd: roundUsd(listCostUsd(target.pricePerMTok, row) - listCostUsd(current.pricePerMTok, row)) }));
    const currentUsd = roundUsd(usage.reduce((sum, row) => sum + listCostUsd(current.pricePerMTok, row), 0));
    const proposedUsd = roundUsd(usage.reduce((sum, row) => sum + listCostUsd(target.pricePerMTok, row), 0));
    return { ...impact, rows, retarget: { fromModel: alias.model, toModel: targetModel, currentUsd, proposedUsd, deltaUsd: roundUsd(proposedUsd - currentUsd) } };
  }
}
