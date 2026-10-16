import { listCostUsd, type ModelPrice, type ProviderCost, roundUsd } from '@modules/catalog';
import { type NormalizedUsage } from '@modules/providers';

import { type CallCost } from './metering.types';

/** The exact decimal text SQL adds to a numeric column, so no float drifts into a running total */
export function usdLiteral(value: number): string {
  return roundUsd(value).toFixed(6);
}

export function tokenListCost(usage: NormalizedUsage | undefined, price: ModelPrice): number {
  return usage ? listCostUsd(price, usage) : 0;
}

export function imageListCost(images: number, price: ModelPrice): number {
  return roundUsd(images * (price.perImage ?? 0));
}

/** Budgets always count list price; what was billed is zero on a zero-cost provider, else what the upstream reported, else the list price */
export function callCost(listUsd: number, providerCost: ProviderCost, upstreamCostUsd?: number): CallCost {
  if (providerCost === 'zero') return { listUsd, billedUsd: 0 };
  return { listUsd, billedUsd: roundUsd(upstreamCostUsd ?? listUsd) };
}

export const NO_COST: CallCost = Object.freeze({ listUsd: 0, billedUsd: 0 });
