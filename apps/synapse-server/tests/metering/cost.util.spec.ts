import { describe, expect, it } from 'bun:test';

import { callCost, imageListCost, tokenListCost, usdLiteral } from '@modules/metering/cost.util';

const usage = (inputTokens: number, cachedInputTokens: number, outputTokens: number) => ({ inputTokens, cachedInputTokens, outputTokens, reasoningTokens: 0 });

describe('tokenListCost', () => {
  it('should price uncached input, cached input at the cached price, and output, per million tokens', () => {
    expect(tokenListCost(usage(1_000_000, 400_000, 100_000), { input: 5, cachedInput: 0.5, output: 25 })).toBe(3 + 0.2 + 2.5);
  });

  it('should price cached input at the input price when the model has no cached price', () => {
    expect(tokenListCost(usage(1_000_000, 400_000, 0), { input: 5, output: 25 })).toBe(5);
  });

  it('should count reasoning inside the output it is already part of', () => {
    expect(tokenListCost({ ...usage(0, 0, 2_000_000), reasoningTokens: 1_500_000 }, { input: 1, output: 2 })).toBe(4);
  });

  it('should cost nothing when the provider reported no usage', () => {
    expect(tokenListCost(undefined, { input: 5, output: 25 })).toBe(0);
  });

  it('should round to the micro-dollar the ledger stores', () => {
    expect(tokenListCost(usage(1, 0, 0), { input: 0.4, output: 0 })).toBe(0);
    expect(tokenListCost(usage(3, 0, 0), { input: 1, output: 0 })).toBe(0.000003);
  });
});

describe('imageListCost', () => {
  it('should charge the per-image price for every image generated', () => {
    expect(imageListCost(3, { input: 0, output: 0, perImage: 0.04 })).toBe(0.12);
  });

  it('should charge nothing for a model with no per-image price', () => {
    expect(imageListCost(2, { input: 1, output: 1 })).toBe(0);
  });
});

describe('callCost', () => {
  it('should bill nothing on a zero-cost provider, even one that reports a cost', () => {
    expect(callCost(0.5, 'zero', 0.42)).toEqual({ listUsd: 0.5, billedUsd: 0 });
  });

  it('should bill a metered call what the upstream reported', () => {
    expect(callCost(0.5, 'metered', 0.42)).toEqual({ listUsd: 0.5, billedUsd: 0.42 });
  });

  it('should bill a metered call its list price when the upstream reported no cost', () => {
    expect(callCost(0.5, 'metered')).toEqual({ listUsd: 0.5, billedUsd: 0.5 });
  });
});

describe('usdLiteral', () => {
  it('should render the exact six-decimal text SQL adds to a numeric column', () => {
    expect(usdLiteral(0.1 + 0.2)).toBe('0.300000');
    expect(usdLiteral(50)).toBe('50.000000');
  });
});
