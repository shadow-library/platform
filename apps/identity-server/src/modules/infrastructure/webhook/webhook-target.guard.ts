/**
 * Importing npm packages
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

/**
 * Defining types
 */

type LookupFn = (hostname: string) => Promise<{ address: string }[]>;

/**
 * Declaring the constants
 *
 * SSRF guard for outbound webhook targets: https-only, no loopback/link-local/private/CGNAT
 * destinations — checked syntactically at registration AND against resolved addresses right
 * before delivery, since DNS can change between the two (rebinding). `allowInsecureTargets`
 * relaxes both for local development and the test harness only.
 */
const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);
const BLOCKED_SUFFIXES = ['.local', '.internal', '.localdomain'];

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  const [a = 0, b = 0] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

export function isPrivateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return isPrivateIpv4(address);
  if (kind !== 6) return true;

  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
  if (lower === '::1' || lower === '::') return true;
  return lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb');
}

@Injectable()
export class WebhookTargetGuard {
  /** Mutable so the test harness can exercise both strict and relaxed behaviour at runtime. */
  allowInsecureTargets: boolean = Config.get('webhooks.allow-insecure-targets');

  /** Injectable resolver seam: delivery-time address checks must be testable without real DNS. */
  lookupAddresses: LookupFn = async hostname => lookup(hostname, { all: true, verbatim: true });

  /** Registration-time syntactic checks; throws WHK_002 for anything not plainly a public https URL. */
  assertAcceptableUrl(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new ServerError(AppErrorCode.WHK_002);
    }

    if (url.protocol !== 'https:' && !(this.allowInsecureTargets && url.protocol === 'http:')) throw new ServerError(AppErrorCode.WHK_002);
    if (url.username || url.password) throw new ServerError(AppErrorCode.WHK_002);
    if (this.allowInsecureTargets) return url;

    const hostname = url.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_SUFFIXES.some(suffix => hostname.endsWith(suffix))) throw new ServerError(AppErrorCode.WHK_002);
    if (isIP(hostname.replace(/^\[|\]$/g, '')) !== 0 && isPrivateAddress(hostname.replace(/^\[|\]$/g, ''))) throw new ServerError(AppErrorCode.WHK_002);
    return url;
  }

  /** Delivery-time check against the addresses the hostname actually resolves to right now. */
  async assertDeliverable(rawUrl: string): Promise<void> {
    const url = this.assertAcceptableUrl(rawUrl);
    if (this.allowInsecureTargets) return;

    const bare = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(bare) !== 0) return;

    const addresses = await this.lookupAddresses(bare);
    if (addresses.length === 0) throw new ServerError(AppErrorCode.WHK_002);
    if (addresses.some(entry => isPrivateAddress(entry.address))) throw new ServerError(AppErrorCode.WHK_002);
  }
}
