import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { type AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

export type AddressLookup = (hostname: string) => Promise<{ address: string }[]>;

export type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);
const BLOCKED_SUFFIXES = ['.local', '.localhost', '.localdomain', '.internal', '.svc', '.cluster.local'];
const WEB_PORTS = new Set(['', '80', '443']);
const NOT_PUBLIC = 'that address is not on the public web';

function isPrivateIpv4(address: string): boolean {
  const [a = 0, b = 0] = address.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return a >= 224;
}

export function isPrivateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return isPrivateIpv4(address);
  if (kind !== 6) return true;
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
  if (lower === '::1' || lower === '::') return true;
  return ['fc', 'fd', 'fe8', 'fe9', 'fea', 'feb'].some(prefix => lower.startsWith(prefix));
}

export const resolveAddresses: AddressLookup = async hostname => lookup(hostname, { all: true, verbatim: true });

function refused(reason: string): AppError {
  return AppErrorCode.AI_021.create({ reason });
}

/**
 * A page the server may fetch for the chat: public http(s) on a standard port, checked against the addresses its name resolves to, since
 * this server runs inside the cluster and a model-chosen URL is otherwise a way into it. Fetch resolves the name again, so a rebinding
 * DNS answer can still slip between the two; the cluster's egress policy is what closes that.
 */
export async function assertPublicUrl(raw: string, resolve: AddressLookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw refused('it is not a valid address');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw refused('only http and https pages are fetched');
  if (url.username || url.password) throw refused('addresses carrying credentials are not fetched');
  if (!WEB_PORTS.has(url.port)) throw refused('only the standard web ports are fetched');

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some(suffix => host.endsWith(suffix))) throw refused(NOT_PUBLIC);
  if (isIP(host) !== 0) {
    if (isPrivateAddress(host)) throw refused(NOT_PUBLIC);
    return url;
  }

  const addresses = await resolve(host).catch(() => []);
  if (addresses.length === 0) throw refused('its name does not resolve');
  if (addresses.some(entry => isPrivateAddress(entry.address))) throw refused(NOT_PUBLIC);
  return url;
}
