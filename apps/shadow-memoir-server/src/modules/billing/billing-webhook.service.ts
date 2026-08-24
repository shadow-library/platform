/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { logMetric } from '@server/telemetry';

import { BillingProviderAdapter, type BillingWebhookRequest, type NormalizedBillingEvent } from './billing.types';
import { BillingRepository } from './billing.repository';

/**
 * Defining types
 */

export interface WebhookOutcome {
  received: true;
}

/**
 * Declaring the constants
 */

/**
 * `POST /billing/webhooks/{provider}` (ARCHITECTURE §16, §25). The route carries **no identity auth** —
 * the adapter's signature check is the whole authentication decision — and it runs entirely on the
 * `memoir_billing` pool, so the process handling an unauthenticated request holds a connection that
 * cannot reach a quest, a hero event, or anything else outside the entitlement tables.
 *
 * Everything past verification is acknowledged with 200: a duplicate, a stale event, an unmatched
 * purchase token. A provider retries anything else, and retrying a delivery the system deliberately
 * did nothing with buys nothing but noise.
 */
@Injectable()
export class BillingWebhookService {
  private readonly logger = Logger.getLogger(APP_NAME, BillingWebhookService.name);

  constructor(
    private readonly adapter: BillingProviderAdapter,
    private readonly repository: BillingRepository,
  ) {}

  async handle(provider: string, request: BillingWebhookRequest): Promise<WebhookOutcome> {
    if (provider !== this.adapter.provider) throw AppErrorCode.BIL_002.create({ provider });

    const event = this.adapter.verify(request);
    const accountId = await this.match(event);
    const result = await this.repository.recordAndApply(event, this.adapter.provider, accountId, Config.get('billing.grace-days'));

    if (result.quarantined) {
      logMetric(this.logger, 'Billing webhook matched no account and was quarantined', 'billing.unmatched_event', 1, { provider, type: event.type }, 'warn');
    } else {
      this.logger.debug('billing webhook processed', { provider, type: event.type, duplicate: result.duplicate, applied: result.applied });
    }

    return { received: true };
  }

  /** The purchase token is the primary match; `provider_ref` covers a provider that stops echoing the client reference after the first event of a subscription's life (§16.2). */
  private async match(event: NormalizedBillingEvent): Promise<bigint | null> {
    if (event.purchaseToken) {
      const byToken = await this.repository.findAccountIdByPurchaseToken(event.purchaseToken);
      if (byToken !== null) return byToken;
    }
    if (event.providerRef) return this.repository.findAccountIdByProviderRef(this.adapter.provider, event.providerRef);
    return null;
  }
}
