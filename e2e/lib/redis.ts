/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';
import net from 'node:net';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type RespValue = string | number | null | RespValue[];

interface RedisTarget {
  host: string;
  port: number;
  db: number;
}

type ParseResult = { value: RespValue; next: number } | undefined;

/**
 * Declaring the constants
 *
 * A minimal RESP2 client for identity's Redis, reached from the host on the k3d Traefik raw-TCP entrypoint. The specs run
 * under Playwright's node runner where `Bun.RedisClient` is unavailable, and a hand-rolled client keeps the workspace free of
 * a Redis dependency for the handful of commands arranging test state needs. Each call opens its own short-lived socket.
 *
 * Identity's key layout (verified against `apps/identity-server/src`):
 *  - `rl:<bucket>:<ip>` fixed-window counters, `rl:oauth-public-client:<clientId>:<ip>`, `rl:ipfail:<ip>`, `rl:ipblock:<ip>`
 *  - `auth_flow:<flowId>` JSON flow context
 *  - `session:<sha256(secret)>` 60 s session cache, `user_sessions:<userId>` set of session hashes
 */

const DEFAULT_REDIS_URL = 'redis://127.0.0.1:7080/0';
const COMMAND_TIMEOUT_MS = 5_000;

export class RedisReplyError extends Error {
  override readonly name = 'RedisReplyError';
}

function resolveTarget(): RedisTarget {
  const url = new URL(process.env.E2E_REDIS_URL?.trim() || DEFAULT_REDIS_URL);
  return { host: url.hostname, port: Number(url.port || 6379), db: Number(url.pathname.slice(1) || 0) };
}

function encodeCommand(args: readonly (string | number)[]): Buffer {
  const parts = args.map(arg => {
    const bytes = Buffer.from(String(arg), 'utf8');
    return Buffer.concat([Buffer.from(`$${bytes.length}\r\n`), bytes, Buffer.from('\r\n')]);
  });
  return Buffer.concat([Buffer.from(`*${args.length}\r\n`), ...parts]);
}

function parseReply(buffer: Buffer, offset: number): ParseResult {
  const lineEnd = buffer.indexOf('\r\n', offset);
  if (lineEnd === -1) return undefined;
  const type = String.fromCharCode(buffer[offset] ?? 0);
  const line = buffer.toString('utf8', offset + 1, lineEnd);
  const afterLine = lineEnd + 2;

  if (type === '+') return { value: line, next: afterLine };
  if (type === '-') throw new RedisReplyError(line);
  if (type === ':') return { value: Number(line), next: afterLine };
  if (type === '$') {
    const length = Number(line);
    if (length === -1) return { value: null, next: afterLine };
    if (buffer.length < afterLine + length + 2) return undefined;
    return { value: buffer.toString('utf8', afterLine, afterLine + length), next: afterLine + length + 2 };
  }
  if (type !== '*') throw new RedisReplyError(`unsupported RESP type "${type}"`);

  const count = Number(line);
  if (count === -1) return { value: null, next: afterLine };
  const items: RespValue[] = [];
  let cursor = afterLine;
  for (let index = 0; index < count; index++) {
    const item = parseReply(buffer, cursor);
    if (!item) return undefined;
    items.push(item.value);
    cursor = item.next;
  }
  return { value: items, next: cursor };
}

/** Sends `commands` as one pipeline on a fresh connection (after `SELECT` when the target db is not 0) and resolves every reply in order. */
export function redisPipeline(commands: readonly (readonly (string | number)[])[]): Promise<RespValue[]> {
  const target = resolveTarget();
  const all = target.db === 0 ? commands : [['SELECT', target.db], ...commands];

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: target.host, port: target.port });
    let buffer = Buffer.alloc(0);
    const replies: RespValue[] = [];
    let offset = 0;

    socket.setTimeout(COMMAND_TIMEOUT_MS, () => socket.destroy(new Error(`Redis ${target.host}:${target.port} timed out`)));
    socket.on('error', reject);
    socket.on('close', () => reject(new RedisReplyError('connection closed before all replies')));
    socket.on('connect', () => socket.write(Buffer.concat(all.map(encodeCommand))));
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        for (let parsed = parseReply(buffer, offset); parsed; parsed = parseReply(buffer, offset)) {
          replies.push(parsed.value);
          offset = parsed.next;
        }
      } catch (error) {
        socket.destroy();
        reject(error);
        return;
      }
      if (replies.length < all.length) return;
      socket.end();
      resolve(target.db === 0 ? replies : replies.slice(1));
    });
  });
}

export async function redisCommand(...args: (string | number)[]): Promise<RespValue> {
  const [reply] = await redisPipeline([args]);
  return reply ?? null;
}

export async function redisGet(key: string): Promise<string | null> {
  const value = await redisCommand('GET', key);
  return typeof value === 'string' ? value : null;
}

export async function redisSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  await redisCommand(...(ttlSeconds === undefined ? ['SET', key, value] : ['SET', key, value, 'EX', ttlSeconds]));
}

export async function redisDel(...keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  return Number(await redisCommand('DEL', ...keys));
}

/** Seconds to live for `key`: `-1` without an expiry, `-2` when absent. */
export async function redisTtl(key: string): Promise<number> {
  return Number(await redisCommand('TTL', key));
}

/** Every key matching the glob `pattern`, via `SCAN` so a large keyspace is never blocked by `KEYS`. */
export async function redisScan(pattern: string): Promise<string[]> {
  const keys = new Set<string>();
  let cursor = '0';
  do {
    const [next, batch] = (await redisCommand('SCAN', cursor, 'MATCH', pattern, 'COUNT', 500)) as [string, string[]];
    batch.forEach(key => keys.add(key));
    cursor = next;
  } while (cursor !== '0');
  return [...keys];
}

export function rateLimitKey(bucket: string, ip: string): string {
  return `rl:${bucket}:${ip}`;
}

/** Hits `ip` has spent in `bucket`'s current window (0 when the window has not started). */
export async function readRateLimit(bucket: string, ip: string): Promise<number> {
  return Number((await redisGet(rateLimitKey(bucket, ip))) ?? 0);
}

/** Pre-spends `hits` of `bucket` for `ip`, so the next request crosses the limit without paying for the requests that would. */
export async function spendRateLimit(bucket: string, ip: string, hits: number, windowSeconds = 3_600): Promise<void> {
  await redisSet(rateLimitKey(bucket, ip), String(hits), windowSeconds);
}

/** Drops every counter, failure tally and block identity keeps for `ip`. */
export async function clearIpState(ip: string): Promise<void> {
  const keys = await redisScan(`rl:*:${ip}`);
  await redisDel(...keys);
}

export async function readAuthFlow<T = Record<string, unknown>>(flowId: string): Promise<T | null> {
  const raw = await redisGet(`auth_flow:${flowId}`);
  return raw ? (JSON.parse(raw) as T) : null;
}

/** Merges `patch` into a live auth flow's JSON, keeping its remaining TTL. */
export async function patchAuthFlow(flowId: string, patch: Record<string, unknown>): Promise<void> {
  const key = `auth_flow:${flowId}`;
  const current = await readAuthFlow(flowId);
  if (!current) throw new RedisReplyError(`auth flow ${flowId} not found`);
  const ttl = await redisTtl(key);
  await redisSet(key, JSON.stringify({ ...current, ...patch }), ttl > 0 ? ttl : undefined);
}

/** Evicts identity's 60 s validation cache for the session behind `secret`, so the next request re-reads the `user_sessions` row. */
export async function evictSessionCache(secret: string): Promise<void> {
  await redisDel(`session:${createHash('sha256').update(secret).digest('hex')}`);
}
