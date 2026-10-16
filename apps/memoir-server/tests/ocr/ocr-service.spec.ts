import { describe, expect, it } from 'bun:test';

import { OcrService, type OcrStructuringRequest } from '@modules/ocr';

function build(options: { tier: 'free' | 'paid'; tierFails?: boolean }) {
  const requests: OcrStructuringRequest[] = [];
  let consumed = 0;
  const account = { id: 3n, identitySub: 'sub-3', timezone: 'UTC' };
  const service = new OcrService(
    { getAccountId: () => 3n } as never,
    { findById: async () => account, consumeOcrQuota: async () => (consumed++, true) } as never,
    {
      parse: async (request: OcrStructuringRequest) => {
        requests.push(request);
        return { amount: '1.00', merchant: null, category: null, date: null, confidence: 1, lineItems: null };
      },
    },
    { onReceiptScanned: async () => {} } as never,
    {
      getTier: async () => {
        if (options.tierFails) throw new Error('billing down');
        return options.tier;
      },
    } as never,
  );
  return { service, requests, consumed: () => consumed };
}

describe('OcrService.parse', () => {
  it('should pass the identity sub and the entitlement tier to structuring', async () => {
    const { service, requests } = build({ tier: 'paid' });
    await service.parse({ extractedText: 'Coffee 4.50' } as never);

    expect(requests).toEqual([{ extractedText: 'Coffee 4.50', subjectId: 'sub-3', plan: 'paid' }]);
  });

  it('should not spend quota when the plan lookup fails', async () => {
    const { service, consumed } = build({ tier: 'free', tierFails: true });
    await expect(service.parse({ extractedText: 'x' } as never)).rejects.toThrow();

    expect(consumed()).toBe(0);
  });
});
