/**
 * Importing npm packages
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import {
  type BillingEventType,
  BillingProviderAdapter,
  type BillingWebhookRequest,
  type CheckoutSession,
  type CheckoutSessionRequest,
  type NormalizedBillingEvent,
} from './billing.types';

/**
 * Defining types
 */

interface SignedEnvelope {
  id?: unknown;
  type?: unknown;
  occurredAt?: unknown;
  clientReference?: unknown;
  customerId?: unknown;
  periodEndsAt?: unknown;
}

/**
 * Declaring the constants
 */

export const BILLING_SIGNATURE_HEADER = 'x-billing-signature';

const MILLISECONDS_PER_SECOND = 1000;
const CHECKOUT_SESSION_TTL_MINUTES = 30;

/** The provider's event names, mapped onto the seam's own vocabulary; anything else is not a lifecycle signal and is refused before it can reach the projection. */
const EVENT_TYPES: Record<string, BillingEventType> = {
  'trial.started': 'trial.started',
  'subscription.activated': 'subscription.activated',
  'subscription.renewed': 'subscription.renewed',
  'subscription.past_due': 'subscription.past_due',
  'subscription.cancelled': 'subscription.cancelled',
  'subscription.expired': 'subscription.expired',
};

function parseSignatureHeader(value: string): { timestamp: number; signature: string } | null {
  const parts = new Map(value.split(',').map(part => part.trim().split('=', 2) as [string, string | undefined]));
  const timestamp = Number(parts.get('t'));
  const signature = parts.get('v1');
  if (!signature || !Number.isFinite(timestamp)) return null;
  return { timestamp, signature };
}

function equals(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const actualBytes = Buffer.from(actual, 'utf8');
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function asDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The one concrete {@link BillingProviderAdapter} shipped today, for a web payment provider of the
 * Paddle/LemonSqueezy/Stripe shape: an `x-billing-signature: t=<unix>,v1=<hex>` header carrying an
 * HMAC-SHA256 over `${timestamp}.${rawBody}`, a timestamp tolerance that bounds replay, and a hosted
 * checkout session addressed by URL. **Owner decision A-6 — which payment provider Shadow Memoir
 * actually uses — is unresolved**, so this stands in until it is; binding a real provider replaces
 * this file and nothing else.
 */
@Injectable()
export class GenericHmacBillingAdapter extends BillingProviderAdapter {
  readonly provider = 'generic-hmac';

  verify(request: BillingWebhookRequest): NormalizedBillingEvent {
    const secret = Config.get('billing.webhook-secret');
    if (!secret) throw AppErrorCode.BIL_003.create();

    const header = request.headers[BILLING_SIGNATURE_HEADER];
    const parsed = typeof header === 'string' ? parseSignatureHeader(header) : null;
    if (!parsed) throw AppErrorCode.BIL_001.create();

    const skewSeconds = Math.abs(Date.now() / MILLISECONDS_PER_SECOND - parsed.timestamp);
    if (skewSeconds > Config.get('billing.webhook-tolerance-seconds')) throw AppErrorCode.BIL_001.create();

    const expected = createHmac('sha256', secret).update(`${parsed.timestamp}.`).update(request.rawBody).digest('hex');
    if (!equals(expected, parsed.signature)) throw AppErrorCode.BIL_001.create();

    return this.normalize(request.rawBody);
  }

  async createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSession> {
    const endpoint = Config.get('billing.checkout-url');
    if (!endpoint) throw AppErrorCode.BIL_003.create();

    const priceMinor = request.plan === 'yearly' ? Config.get('billing.price-yearly-minor') : Config.get('billing.price-monthly-minor');
    const url = new URL(endpoint);
    url.searchParams.set('client_reference_id', request.purchaseToken);
    url.searchParams.set('plan', request.plan);
    url.searchParams.set('currency', Config.get('billing.currency'));
    url.searchParams.set('amount', String(priceMinor));
    if (request.trial) url.searchParams.set('trial_days', String(Config.get('billing.trial-days')));

    return { sessionId: request.purchaseToken, url: url.toString(), expiresAt: new Date(Date.now() + CHECKOUT_SESSION_TTL_MINUTES * 60 * MILLISECONDS_PER_SECOND) };
  }

  /** A body that verified cryptographically but does not carry the fields the projection needs is still a rejection, not a partially-applied event. */
  private normalize(rawBody: Buffer): NormalizedBillingEvent {
    let envelope: SignedEnvelope & Record<string, unknown>;
    try {
      envelope = JSON.parse(rawBody.toString('utf8')) as SignedEnvelope & Record<string, unknown>;
    } catch {
      throw AppErrorCode.BIL_001.create();
    }

    const providerEventId = asString(envelope.id);
    const type = typeof envelope.type === 'string' ? EVENT_TYPES[envelope.type] : undefined;
    const occurredAt = asDate(envelope.occurredAt);
    if (!providerEventId || !type || !occurredAt) throw AppErrorCode.BIL_001.create();

    return {
      providerEventId,
      type,
      occurredAt,
      purchaseToken: asString(envelope.clientReference),
      providerRef: asString(envelope.customerId),
      periodEndsAt: asDate(envelope.periodEndsAt),
      payload: envelope,
    };
  }
}
