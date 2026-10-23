import { randomInt } from 'node:crypto';

import { type BrowserContext } from '@playwright/test';

import { clearIpState } from './redis';

/**
 * Identity keys rate limits, failure tallies and IP blocks on `request.ip`, resolved from `X-Forwarded-For` past the CIDRs in `APP_TRUST_PROXY`.
 * In the local dev cluster (HAProxy -> loopback -> Traefik `web`, forwarded headers kept; identity trusts 127.0.0.1, the pod CIDR and the k3d network)
 * a client-supplied address is honoured, so a spec gets buckets of its own instead of the one address the suite shares. An environment whose proxies
 * drop or overwrite the header collapses back to that shared address.
 * Addresses come from 198.18.0.0/15 (RFC 2544 benchmarking): never routed, and outside every trusted proxy range, where they would be skipped as a hop.
 */

const FORWARDED_FOR_HEADER = 'x-forwarded-for';

/** A random address in 198.18.0.0/15; host octets 0 and 255 are avoided so no tool reads it as a network or broadcast address. */
export function uniqueClientIp(): string {
  return `198.${randomInt(18, 20)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

/** A unique address whose identity-side counters are wiped first, so a leftover window from an earlier run cannot leak in. */
export async function freshClientIp(): Promise<string> {
  const ip = uniqueClientIp();
  await clearIpState(ip);
  return ip;
}

export function clientIpHeaders(ip: string): Record<string, string> {
  return { [FORWARDED_FOR_HEADER]: ip };
}

/** Routes every request `context` makes, on any origin, as coming from `ip`. Replaces the context's other extra headers. */
export async function useClientIp(context: BrowserContext, ip: string): Promise<void> {
  await context.setExtraHTTPHeaders(clientIpHeaders(ip));
}
