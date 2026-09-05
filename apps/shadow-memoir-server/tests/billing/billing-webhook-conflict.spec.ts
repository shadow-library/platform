import { describe, expect, it } from 'bun:test';

import {
  type BillingProviderAdapter,
  BillingRepository,
  type BillingWebhookRequest,
  BillingWebhookService,
  type NormalizedBillingEvent,
  type WebhookApplyResult,
} from '@modules/billing';

const PROVIDER = 'generic-hmac';
const REQUEST: BillingWebhookRequest = { headers: {}, rawBody: Buffer.from('{}') };

function event(overrides: Partial<NormalizedBillingEvent> = {}): NormalizedBillingEvent {
  return {
    providerEventId: 'evt-1',
    type: 'subscription.activated',
    occurredAt: new Date(),
    purchaseToken: null,
    providerRef: null,
    periodEndsAt: null,
    payload: {},
    ...overrides,
  };
}

interface RepoStub {
  byToken: bigint | null;
  byRef: bigint | null;
}

function harness(stub: RepoStub, ev: NormalizedBillingEvent) {
  const calls = { recordAndApply: 0, recordConflict: 0 };
  const repository = {
    findAccountIdByPurchaseToken: async () => stub.byToken,
    findAccountIdByProviderRef: async () => stub.byRef,
    recordAndApply: async (): Promise<WebhookApplyResult> => {
      calls.recordAndApply += 1;
      return { duplicate: false, quarantined: false, applied: true };
    },
    recordConflict: async (): Promise<WebhookApplyResult> => {
      calls.recordConflict += 1;
      return { duplicate: false, quarantined: true, applied: false };
    },
  } as unknown as BillingRepository;
  const adapter = { provider: PROVIDER, verify: () => ev } as unknown as BillingProviderAdapter;
  return { service: new BillingWebhookService(adapter, repository), calls };
}

describe('BillingWebhookService provider_ref conflict', () => {
  it('should refuse the projection move and quarantine when the ref already binds another account', async () => {
    const { service, calls } = harness({ byToken: 2n, byRef: 1n }, event({ purchaseToken: 'token-b', providerRef: 'cus_1' }));

    const outcome = await service.handle(PROVIDER, REQUEST);

    expect(outcome).toEqual({ received: true });
    expect(calls.recordConflict).toBe(1);
    expect(calls.recordAndApply).toBe(0);
  });

  it('should apply normally when the ref is not yet bound to any account', async () => {
    const { service, calls } = harness({ byToken: 2n, byRef: null }, event({ purchaseToken: 'token-b', providerRef: 'cus_new' }));

    await service.handle(PROVIDER, REQUEST);

    expect(calls.recordAndApply).toBe(1);
    expect(calls.recordConflict).toBe(0);
  });

  it('should apply normally when the ref already binds the same matched account', async () => {
    const { service, calls } = harness({ byToken: 2n, byRef: 2n }, event({ purchaseToken: 'token-b', providerRef: 'cus_1' }));

    await service.handle(PROVIDER, REQUEST);

    expect(calls.recordAndApply).toBe(1);
    expect(calls.recordConflict).toBe(0);
  });

  it('should treat a later event matched by its own ref as a rebind rather than a conflict', async () => {
    const { service, calls } = harness({ byToken: null, byRef: 1n }, event({ purchaseToken: null, providerRef: 'cus_1' }));

    await service.handle(PROVIDER, REQUEST);

    expect(calls.recordAndApply).toBe(1);
    expect(calls.recordConflict).toBe(0);
  });
});
