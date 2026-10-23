import { Injectable } from '@shadow-library/app';
import { APIRequest, Config, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

export interface CurrencyPair {
  base: string;
  quote: string;
}

export interface FetchedRate extends CurrencyPair {
  rate: number;
}

/**
 * The seam the reconciliation sweep fetches through: pairs only, no account or user data crosses it. `date` omitted means "latest" (warms today's cache);
 * the dated form resolves a null rate at its `occurred_on`.
 */
interface FxRateClient {
  fetchRates(pairs: readonly CurrencyPair[], date?: string): Promise<FetchedRate[]>;
}

interface ProviderResponse {
  rates?: Record<string, number>;
}

/**
 * Public FX API adapter, one request per base currency. An empty `fx.provider-url` reads as "unconfigured" and the sweep no-ops;
 * rates are never fabricated.
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
