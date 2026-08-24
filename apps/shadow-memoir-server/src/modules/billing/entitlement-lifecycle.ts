/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type Entitlement } from '@server/database';

import { type NormalizedBillingEvent } from './billing.types';

/**
 * Defining types
 */

export interface EntitlementProjection {
  tier: Entitlement.Tier;
  state: Entitlement.State;
  expiresAt: Date | null;
  graceEndsAt: Date | null;
  provider: string | null;
  providerRef: string | null;
  trialUsed: boolean;
  appliedEventAt: Date | null;
}

/**
 * Declaring the constants
 */

const MILLISECONDS_PER_DAY = 86_400_000;

export const FREE_PROJECTION: EntitlementProjection = {
  tier: 'free',
  state: 'free',
  expiresAt: null,
  graceEndsAt: null,
  provider: null,
  providerRef: null,
  trialUsed: false,
  appliedEventAt: null,
};

/**
 * The projection's server-time reading (ARCHITECTURE §16.2). A stored `active`/`trial` whose period end
 * has passed without a renewal webhook is **not** silently granted grace — grace exists only where the
 * provider signalled dunning — so an unrenewed period reads as lapsed the moment it expires. A device
 * with a skewed clock cannot influence any of this: `now` is always the server's.
 */
export function resolveEffectiveState(projection: Pick<EntitlementProjection, 'state' | 'expiresAt' | 'graceEndsAt'>, now: Date): Entitlement.State {
  if (projection.state === 'grace') return projection.graceEndsAt && now > projection.graceEndsAt ? 'lapsed' : 'grace';
  if (projection.state === 'trial' || projection.state === 'active') return !projection.expiresAt || now <= projection.expiresAt ? projection.state : 'lapsed';
  return projection.state;
}

export function tierFor(state: Entitlement.State): Entitlement.Tier {
  return state === 'free' || state === 'lapsed' ? 'free' : 'paid';
}

/**
 * The monotonic apply (ARCHITECTURE §16.2): `null` means "record the event, move nothing" — either it
 * is older than what has already been applied, or it is a second trial the account is not entitled to
 * (PRD §6.9, one trial per account). Duplicate delivery never reaches here at all; the
 * `billing_events.provider_event_id` unique constraint absorbs it first.
 */
export function applyBillingEvent(current: EntitlementProjection, event: NormalizedBillingEvent, provider: string, graceDays: number): EntitlementProjection | null {
  if (current.appliedEventAt && event.occurredAt <= current.appliedEventAt) return null;
  if (event.type === 'trial.started' && current.trialUsed) return null;

  const base: EntitlementProjection = {
    ...current,
    provider,
    providerRef: event.providerRef ?? current.providerRef,
    appliedEventAt: event.occurredAt,
  };

  switch (event.type) {
    case 'trial.started':
      return { ...base, tier: 'paid', state: 'trial', expiresAt: event.periodEndsAt, graceEndsAt: null, trialUsed: true };

    case 'subscription.activated':
    case 'subscription.renewed':
      return { ...base, tier: 'paid', state: 'active', expiresAt: event.periodEndsAt, graceEndsAt: null };

    case 'subscription.past_due':
      return {
        ...base,
        tier: 'paid',
        state: 'grace',
        expiresAt: event.periodEndsAt ?? current.expiresAt,
        graceEndsAt: new Date((event.periodEndsAt ?? event.occurredAt).getTime() + graceDays * MILLISECONDS_PER_DAY),
      };

    case 'subscription.cancelled':
    case 'subscription.expired':
      return { ...base, tier: 'free', state: 'lapsed', graceEndsAt: null };
  }
}
