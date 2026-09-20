/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/** The provider-agnostic vocabulary every adapter normalizes its own event names into (ARCHITECTURE §16.1). */
export type BillingEventType = 'trial.started' | 'subscription.activated' | 'subscription.renewed' | 'subscription.past_due' | 'subscription.cancelled' | 'subscription.expired';

export type CheckoutPlan = 'monthly' | 'yearly';

export interface BillingWebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  /** The bytes as delivered — signature verification is over the wire body, not a re-serialization of the parsed one. */
  rawBody: Buffer;
}

export interface NormalizedBillingEvent {
  providerEventId: string;
  type: BillingEventType;
  /** The provider's effective instant for this event; the monotonic apply guard compares against it, never against arrival order. */
  occurredAt: Date;
  /** The account's opaque purchase token, echoed by the provider from the checkout session's client reference. */
  purchaseToken: string | null;
  /** The provider's own customer/subscription id, persisted to `entitlements.provider_ref` for lifetime matching. */
  providerRef: string | null;
  periodEndsAt: Date | null;
  payload: Record<string, unknown>;
}

export interface CheckoutSessionRequest {
  purchaseToken: string;
  plan: CheckoutPlan;
  /** False once the account has used its one trial (PRD §6.9); the adapter must not offer a trial when it is. */
  trial: boolean;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
  expiresAt: Date;
}

/**
 * The one seam the concrete payment provider lives behind (ARCHITECTURE §16.1): cryptographic
 * verification of an inbound webhook, normalization into a {@link NormalizedBillingEvent}, and
 * creation of a hosted checkout session carrying the account's purchase token. Nothing above this
 * interface knows a provider's wire format, and swapping providers is one new implementation.
 */
export abstract class BillingProviderAdapter {
  /** Matches the `{provider}` path segment of the webhook route and is stored on every event and entitlement row. */
  abstract readonly provider: string;

  abstract verify(request: BillingWebhookRequest): NormalizedBillingEvent;

  abstract createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSession>;
}
