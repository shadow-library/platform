import { isIPv4, isIPv6 } from 'node:net';

import { AppErrorCode } from '@server/classes';

interface ParsedAddress {
  value: bigint;
  bits: 32 | 128;
}

export const MAX_IP_ALLOWLIST_ENTRIES = 20;

const PREFIX_PATTERN = /^\d{1,3}$/;
const IPV6_GROUPS = 8;

function parseIPv4(address: string): bigint {
  return address.split('.').reduce((value, octet) => (value << 8n) | BigInt(Number(octet)), 0n);
}

function parseIPv6(address: string): bigint {
  const lastColon = address.lastIndexOf(':');
  const tail = address.slice(lastColon + 1);
  const embedsIPv4 = tail.includes('.');
  const hex = embedsIPv4 ? address.slice(0, lastColon + 1) + '0:0' : address;

  const [head = '', rest] = hex.split('::') as [string, string | undefined];
  const headGroups = head === '' ? [] : head.split(':');
  const restGroups = rest === undefined || rest === '' ? [] : rest.split(':');
  const groups = rest === undefined ? headGroups : [...headGroups, ...Array<string>(IPV6_GROUPS - headGroups.length - restGroups.length).fill('0'), ...restGroups];

  const value = groups.reduce((total, group) => (total << 16n) | BigInt(`0x${group}`), 0n);
  return embedsIPv4 ? (value & ~0xffffffffn) | parseIPv4(tail) : value;
}

function parseAddress(address: string): ParsedAddress | null {
  if (isIPv4(address)) return { value: parseIPv4(address), bits: 32 };
  if (isIPv6(address) && !address.includes('%')) return { value: parseIPv6(address), bits: 128 };
  return null;
}

function formatIPv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map(shift => ((value >> shift) & 0xffn).toString()).join('.');
}

function formatIPv6(value: bigint): string {
  const groups = Array.from({ length: IPV6_GROUPS }, (_, index) => Number((value >> BigInt((IPV6_GROUPS - 1 - index) * 16)) & 0xffffn));

  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < IPV6_GROUPS; start++) {
    let length = 0;
    while (start + length < IPV6_GROUPS && groups[start + length] === 0) length++;
    if (length > bestLength) [bestStart, bestLength] = [start, length];
  }

  const hex = groups.map(group => group.toString(16));
  if (bestLength < 2) return hex.join(':');
  return `${hex.slice(0, bestStart).join(':')}::${hex.slice(bestStart + bestLength).join(':')}`;
}

export function normaliseCidr(entry: string): string | null {
  const [address = '', prefix, extra] = entry.trim().split('/');
  if (extra !== undefined) return null;

  const parsed = parseAddress(address);
  if (!parsed) return null;
  if (prefix !== undefined && !PREFIX_PATTERN.test(prefix)) return null;

  const length = prefix === undefined ? parsed.bits : Number(prefix);
  if (length > parsed.bits) return null;

  const hostBits = BigInt(parsed.bits - length);
  const network = (parsed.value >> hostBits) << hostBits;
  const formatted = parsed.bits === 32 ? formatIPv4(network) : formatIPv6(network);
  return `${formatted}/${length}`;
}

export function normaliseIpAllowlist(entries: string[]): string[] {
  const normalised = new Set<string>();
  for (const entry of entries) {
    const cidr = normaliseCidr(entry);
    if (!cidr) throw AppErrorCode.BOT_012.create();
    normalised.add(cidr);
  }
  if (normalised.size > MAX_IP_ALLOWLIST_ENTRIES) throw AppErrorCode.BOT_012.create();
  return [...normalised];
}
