/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { APIRequest, Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';

/**
 * Defining types
 */

export interface CurrencyPair {
  base: string;
  quote: string;
}

export interface FetchedRate extends CurrencyPair {
  rate: number;
}

/**
 * The seam the reconciliation sweep fetches through (ARCHITECTURE §14.1): pairs only, no account or
 * user data ever crosses it. Tests supply a deterministic fake instead of hitting the real provider.
 * `date` is the ISO calendar date to price the pair at; omitted means "latest" — the sweep uses that
 * form to warm today's cache, and the dated form to resolve a null rate at its own `occurred_on`.
 */
export interface FxRateClient {
  fetchRates(pairs: readonly CurrencyPair[], date?: string): Promise<FetchedRate[]>;
}

/**
 * Declaring the constants
 */

interface ProviderResponse {
  rates?: Record<string, number>;
}

/**
 * Public FX API adapter, one request per base currency (the provider's own shape: a base plus a set of
 * quote rates). `fx.provider-url` is empty in an environment that has not provisioned one — the sweep
 * reads that as "unconfigured" and no-ops rather than calling an empty URL (ARCHITECTURE §14.1: never
 * fabricate rates).
 */
@Injectable()
export class HttpFxRateClient implements FxRateClient {
  private readonly logger = Logger.getLogger(APP_NAME, HttpFxRateClient.name);

  async fetchRates(pairs: readonly CurrencyPair[], date?: string): Promise<FetchedRate[]> {
    const providerUrl = Config.get('fx.provider-url');
    if (!providerUrl) {
      this.logger.warn('FX provider URL not configured; reconciliation sweep skipped', { pairs: pairs.length });
      return [];
    }

    const byBase = new Map<string, Set<string>>();
    for (const pair of pairs) {
      const quotes = byBase.get(pair.base) ?? new Set<string>();
      quotes.add(pair.quote);
      byBase.set(pair.base, quotes);
    }

    const fetched: FetchedRate[] = [];
    for (const [base, quotes] of byBase) {
      const response = await APIRequest.get(`${providerUrl}/${date ?? 'latest'}`)
        .query('base', base)
        .query('symbols', [...quotes].join(','))
        .suppressErrors()
        .execute<ProviderResponse>();
      const rates = response.data?.rates ?? {};
      for (const quote of quotes) {
        const rate = rates[quote];
        if (typeof rate === 'number' && Number.isFinite(rate)) fetched.push({ base, quote, rate });
      }
    }
    return fetched;
  }
}
