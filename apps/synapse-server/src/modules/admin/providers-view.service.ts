import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

import { PROVIDER_CREDENTIAL_KEYS } from '@server/constants';

import { ActiveCatalogCache, type ProviderSpec } from '@modules/catalog';

import { ERROR_RATE_WINDOW_HOURS, HOUR_MS } from './admin.constants';
import { LedgerReportRepository } from './ledger-report.repository';

export interface ProviderView {
  key: string;
  kind: ProviderSpec['kind'];
  flavor?: ProviderSpec['flavor'];
  url: string;
  locality: ProviderSpec['locality'];
  cost: ProviderSpec['cost'];
  features: string[];
  maxInflightPerReplica?: number;
  apiKeyConfigured?: boolean;
  calls: number;
  errors: number;
  errorRate?: number;
}

export interface ProvidersReport {
  catalogVersion: number;
  windowHours: number;
  providers: ProviderView[];
}

const CREDENTIAL_KEYS: readonly string[] = PROVIDER_CREDENTIAL_KEYS;

/** Only the keys `bootstrap.ts` loads are ever read, so a catalog naming any other config key cannot make this endpoint probe it. */
function isKeyConfigured(configKey: string): boolean {
  if (!CREDENTIAL_KEYS.includes(configKey)) return false;
  return Boolean(Config.get(configKey as (typeof PROVIDER_CREDENTIAL_KEYS)[number]));
}

function withoutCredentials(url: string): string {
  if (!URL.canParse(url)) return url;
  const parsed = new URL(url);
  if (!parsed.username && !parsed.password) return url;
  parsed.username = '';
  parsed.password = '';
  return parsed.href;
}

@Injectable()
export class ProvidersViewService {
  constructor(
    private readonly cache: ActiveCatalogCache,
    private readonly ledger: LedgerReportRepository,
  ) {}

  async report(now: Date = new Date()): Promise<ProvidersReport> {
    const { version, document } = this.cache.requireCurrent();
    const outcomes = await this.ledger.providerOutcomes(new Date(now.getTime() - ERROR_RATE_WINDOW_HOURS * HOUR_MS));
    const providers = Object.entries(document.providers).map(([key, provider]): ProviderView => {
      const outcome = outcomes.find(candidate => candidate.provider === key);
      const calls = outcome?.calls ?? 0;
      const errors = outcome?.errors ?? 0;
      return {
        key,
        kind: provider.kind,
        ...(provider.flavor !== undefined && { flavor: provider.flavor }),
        url: withoutCredentials(provider.url),
        locality: provider.locality,
        cost: provider.cost,
        features: provider.features ?? [],
        ...(provider.maxInflightPerReplica !== undefined && { maxInflightPerReplica: provider.maxInflightPerReplica }),
        ...(provider.apiKeyConfig !== undefined && { apiKeyConfigured: isKeyConfigured(provider.apiKeyConfig) }),
        calls,
        errors,
        ...(calls > 0 && { errorRate: errors / calls }),
      };
    });
    return { catalogVersion: version, windowHours: ERROR_RATE_WINDOW_HOURS, providers };
  }
}
