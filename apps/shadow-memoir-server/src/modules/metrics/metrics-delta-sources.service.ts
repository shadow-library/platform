/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AccountContext } from '@modules/auth';
import { DeltaRepository, DeltaSourceRegistry, type KeysetDeltaSource, type SnapshotDeltaSource } from '@modules/sync';
import { type Metric, schema } from '@server/database';

import { MetricRepository } from './metric.repository';
import { serializeOffer } from './threshold-offer';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

function toMetricRow(metric: Metric.Row): Record<string, unknown> {
  return {
    id: String(metric.id),
    name: metric.name,
    unit: metric.unit,
    valueType: metric.valueType,
    direction: metric.direction,
    defaultValue: metric.defaultValue,
    glyph: metric.glyph,
    builtin: metric.builtin,
    isHealth: metric.isHealth,
    active: metric.active,
  };
}

/**
 * Registers the `metrics`/`metric_entries`/`health_offers` domains on the sync assembler (ARCHITECTURE
 * §12.2). `metrics` is a snapshot source like `expense_categories` — a small, near-static per-account
 * catalogue. `health_offers` is also a snapshot: an offer is derived, not stored (ARCHITECTURE §18's
 * "no new tables, no snapshot machinery"), so a delta pull recomputes the account's current offer set
 * live rather than reading a table a pull cursor could ever fall behind on.
 */
@Injectable()
export class MetricsDeltaSources implements OnModuleInit {
  constructor(
    private readonly registry: DeltaSourceRegistry,
    private readonly deltaRepository: DeltaRepository,
    private readonly metricRepository: MetricRepository,
    private readonly accountContext: AccountContext,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.metricsSource());
    this.registry.register(this.keysetSource('metric_entries', schema.metricEntries));
    this.registry.register(this.healthOffersSource());
  }

  private keysetSource(domain: string, table: Parameters<DeltaRepository['fetchSince']>[0]): KeysetDeltaSource {
    return { domain, kind: 'keyset', fetch: ({ since, limit }) => this.deltaRepository.fetchSince(table, since, limit) };
  }

  private metricsSource(): SnapshotDeltaSource {
    return { domain: 'metrics', kind: 'snapshot', fetch: () => this.metricRepository.list().then(metrics => metrics.map(toMetricRow)) };
  }

  private healthOffersSource(): SnapshotDeltaSource {
    return {
      domain: 'health_offers',
      kind: 'snapshot',
      fetch: () => {
        const accountId = this.accountContext.getAccountId();
        if (accountId === null) return Promise.resolve([]);
        return this.metricRepository.currentOffers(accountId).then(offers => offers.map(serializeOffer));
      },
    };
  }
}
