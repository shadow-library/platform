import { describe, expect, it } from 'bun:test';

import {
  applyBillingEvent,
  type BillingEventType,
  type EntitlementProjection,
  FREE_PROJECTION,
  type NormalizedBillingEvent,
  resolveEffectiveState,
  tierFor,
} from '@modules/billing';

const PROVIDER = 'generic-hmac';
const GRACE_DAYS = 7;
const DAY_MS = 86_400_000;
const NOW = new Date('2026-08-24T12:00:00.000Z');

function event(type: BillingEventType, occurredAt: Date, periodEndsAt: Date | null = null): NormalizedBillingEvent {
  return { providerEventId: `evt-${type}-${occurredAt.getTime()}`, type, occurredAt, purchaseToken: 'token', providerRef: 'cus_1', periodEndsAt, payload: {} };
}

function apply(current: EntitlementProjection, billingEvent: NormalizedBillingEvent): EntitlementProjection | null {
  return applyBillingEvent(current, billingEvent, PROVIDER, GRACE_DAYS);
}

describe('applyBillingEvent', () => {
  it('should move a free account to a trial and burn its one trial', () => {
    const next = apply(FREE_PROJECTION, event('trial.started', NOW, new Date(NOW.getTime() + 7 * DAY_MS)));
    expect(next).toMatchObject({ tier: 'paid', state: 'trial', trialUsed: true, provider: PROVIDER, providerRef: 'cus_1' });
    expect(next!.appliedEventAt).toEqual(NOW);
  });

  it('should refuse a second trial for an account that has already used one', () => {
    const used: EntitlementProjection = { ...FREE_PROJECTION, trialUsed: true, state: 'lapsed' };
    expect(apply(used, event('trial.started', NOW, new Date(NOW.getTime() + 7 * DAY_MS)))).toBeNull();
  });

  it('should refuse an event whose effective instant is not later than the applied one', () => {
    const applied: EntitlementProjection = { ...FREE_PROJECTION, tier: 'paid', state: 'active', appliedEventAt: NOW };
    expect(apply(applied, event('subscription.cancelled', new Date(NOW.getTime() - 1)))).toBeNull();
    expect(apply(applied, event('subscription.cancelled', NOW))).toBeNull();
    expect(apply(applied, event('subscription.cancelled', new Date(NOW.getTime() + 1)))).toMatchObject({ tier: 'free', state: 'lapsed' });
  });

  it('should open a grace window measured from the period end on a past-due event', () => {
    const periodEndsAt = new Date(NOW.getTime() - DAY_MS);
    const next = apply({ ...FREE_PROJECTION, tier: 'paid', state: 'active' }, event('subscription.past_due', NOW, periodEndsAt));
    expect(next).toMatchObject({ tier: 'paid', state: 'grace' });
    expect(next!.graceEndsAt).toEqual(new Date(periodEndsAt.getTime() + GRACE_DAYS * DAY_MS));
  });

  it('should restore a lapsed account on activation while leaving its spent trial spent', () => {
    const lapsed: EntitlementProjection = { ...FREE_PROJECTION, state: 'lapsed', trialUsed: true, appliedEventAt: new Date(NOW.getTime() - DAY_MS) };
    const next = apply(lapsed, event('subscription.activated', NOW, new Date(NOW.getTime() + 30 * DAY_MS)));
    expect(next).toMatchObject({ tier: 'paid', state: 'active', trialUsed: true, graceEndsAt: null });
  });

  it('should keep the last known provider ref when an event carries none', () => {
    const active: EntitlementProjection = { ...FREE_PROJECTION, tier: 'paid', state: 'active', providerRef: 'cus_original' };
    const next = apply(active, { ...event('subscription.renewed', NOW, new Date(NOW.getTime() + 30 * DAY_MS)), providerRef: null });
    expect(next!.providerRef).toBe('cus_original');
  });
});

describe('resolveEffectiveState', () => {
  it('should keep an active period paid up to and including its end instant', () => {
    const expiresAt = new Date(NOW.getTime() + 1000);
    expect(resolveEffectiveState({ state: 'active', expiresAt, graceEndsAt: null }, NOW)).toBe('active');
    expect(resolveEffectiveState({ state: 'active', expiresAt, graceEndsAt: null }, expiresAt)).toBe('active');
    expect(resolveEffectiveState({ state: 'active', expiresAt, graceEndsAt: null }, new Date(expiresAt.getTime() + 1))).toBe('lapsed');
  });

  it('should hold grace until its own end instant, then lapse', () => {
    const graceEndsAt = new Date(NOW.getTime() + 1000);
    expect(resolveEffectiveState({ state: 'grace', expiresAt: null, graceEndsAt }, graceEndsAt)).toBe('grace');
    expect(resolveEffectiveState({ state: 'grace', expiresAt: null, graceEndsAt }, new Date(graceEndsAt.getTime() + 1))).toBe('lapsed');
  });

  it('should leave a period with no recorded end alone rather than expiring it', () => {
    expect(resolveEffectiveState({ state: 'active', expiresAt: null, graceEndsAt: null }, NOW)).toBe('active');
    expect(resolveEffectiveState({ state: 'grace', expiresAt: null, graceEndsAt: null }, NOW)).toBe('grace');
  });

  it('should map every state to the tier it grants', () => {
    expect(tierFor('free')).toBe('free');
    expect(tierFor('lapsed')).toBe('free');
    expect(tierFor('trial')).toBe('paid');
    expect(tierFor('active')).toBe('paid');
    expect(tierFor('grace')).toBe('paid');
  });
});
