/**
 * Importing npm packages
 */
import { createHash, randomBytes } from 'node:crypto';

import { type APIRequestContext, type BrowserContext, request } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { clientIpHeaders } from './client-ip';
import { identityDb } from './db';
import { requireProductUrl } from './env';
import { evictSessionCache } from './redis';

/**
 * Defining types
 */

export type SessionAal = 'AAL1' | 'AAL2';

export type SessionStatus = 'ACTIVE' | 'REVOKED' | 'TERMINATED' | 'EXPIRED';

export interface IdentitySessionOptions {
  /** Default `AAL1`. */
  aal?: SessionAal;
  /**
   * When the step-up elevation lapses; `null` for none. Defaults to ten minutes ahead for `AAL2` (what a completed MFA login
   * grants) and to none for `AAL1`.
   */
  elevatedUntil?: Date | null;
  /** Default 180 days ahead, the server's absolute lifetime. */
  expiresAt?: Date;
  /** Default now. Identity expires a session idle for 30 days, judged from this on the first uncached use. */
  lastUsedAt?: Date;
  status?: SessionStatus;
  ipAddress?: string;
  userAgent?: string;
}

export interface IdentitySession {
  readonly sessionId: string;
  readonly userId: string;
  /** The `__Host-sid` cookie value; identity stores only its SHA-256. */
  readonly secret: string;
}

interface StorageStateCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax';
}

export interface IdentityStorageState {
  cookies: StorageStateCookie[];
  origins: [];
}

export interface IdentitySessionContextOptions {
  /** Sent as `X-Forwarded-For` on every request, so identity charges this address's rate limits. */
  clientIp?: string;
}

/**
 * Declaring the constants
 *
 * Mints identity sessions directly in `user_sessions`, the same row a completed login writes, so a spec gets a signed-in
 * caller without spending `login/init` (20/hour per IP) or completing an MFA ceremony. A row that has never been used is not
 * in identity's 60 s Redis cache, so its expiry, idle time, AAL and status are judged from the database on first use.
 */

const SESSION_COOKIE_NAME = '__Host-sid';
const LOGGED_IN_COOKIE_NAME = 'isLoggedIn';
const DAY_MS = 24 * 60 * 60 * 1000;
const ELEVATION_MS = 10 * 60 * 1000;

export async function createIdentitySession(userId: string, options: IdentitySessionOptions = {}): Promise<IdentitySession> {
  const secret = randomBytes(32).toString('base64url');
  const sessionHash = createHash('sha256').update(secret).digest('hex');
  const aal = options.aal ?? 'AAL1';
  const elevatedUntil = options.elevatedUntil !== undefined ? options.elevatedUntil : aal === 'AAL2' ? new Date(Date.now() + ELEVATION_MS) : null;
  const expiresAt = options.expiresAt ?? new Date(Date.now() + 180 * DAY_MS);
  const lastUsedAt = options.lastUsedAt ?? new Date();

  const [row] = await identityDb()<{ id: string }[]>`
    INSERT INTO user_sessions (user_id, session_hash, status, aal, expires_at, last_used_at, elevated_until, ip_address, user_agent)
    VALUES (
      ${userId}, ${sessionHash}, ${options.status ?? 'ACTIVE'}::session_status, ${aal}::session_aal, ${expiresAt}, ${lastUsedAt}, ${elevatedUntil},
      ${options.ipAddress ?? null}, ${options.userAgent ?? 'e2e-session-factory'}
    )
    RETURNING id
  `;
  if (!row) throw new Error(`session insert for user ${userId} returned no row`);
  return { sessionId: row.id, userId, secret };
}

export interface IdentitySessionRow {
  readonly id: string;
  readonly userId: string;
  readonly status: SessionStatus;
  readonly aal: SessionAal;
  readonly deviceId: string | null;
  readonly elevatedUntil: Date | null;
}

/** The `user_sessions` row behind a `__Host-sid` value, e.g. one a real login set. */
export async function findSessionBySecret(secret: string): Promise<IdentitySessionRow | undefined> {
  const sessionHash = createHash('sha256').update(secret).digest('hex');
  const [row] = await identityDb()<IdentitySessionRow[]>`
    SELECT id::text, user_id::text AS "userId", status, aal, device_id::text AS "deviceId", elevated_until AS "elevatedUntil"
    FROM user_sessions WHERE session_hash = ${sessionHash}
  `;
  return row;
}

export async function readSessionStatus(sessionId: string): Promise<SessionStatus | undefined> {
  const [row] = await identityDb()<{ status: SessionStatus }[]>`SELECT status FROM user_sessions WHERE id = ${sessionId}`;
  return row?.status;
}

/** Rewrites a live session row and drops its cache entry, so the change is what identity sees on the next request. */
export async function updateIdentitySession(
  session: IdentitySession,
  patch: Pick<IdentitySessionOptions, 'aal' | 'elevatedUntil' | 'expiresAt' | 'lastUsedAt' | 'status'>,
): Promise<void> {
  const sql = identityDb();
  const fields = { aal: patch.aal, elevated_until: patch.elevatedUntil, expires_at: patch.expiresAt, last_used_at: patch.lastUsedAt, status: patch.status };
  const columns = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (columns.length === 0) return;
  await sql`UPDATE user_sessions SET ${sql(Object.fromEntries(columns))} WHERE id = ${session.sessionId}`;
  await evictSessionCache(session.secret);
}

/** A Playwright storage state carrying the session's cookies for identity's host, usable by `request.newContext` or `test.use`. */
export function identityStorageState(session: IdentitySession): IdentityStorageState {
  const domain = new URL(requireProductUrl('identity')).hostname;
  const expires = Math.floor(Date.now() / 1000) + 180 * 24 * 60 * 60;
  const cookie = (name: string, value: string, httpOnly: boolean): StorageStateCookie => ({ name, value, domain, path: '/', expires, httpOnly, secure: true, sameSite: 'Lax' });
  return { cookies: [cookie(SESSION_COOKIE_NAME, session.secret, true), cookie(LOGGED_IN_COOKIE_NAME, 'true', false)], origins: [] };
}

/** Puts the session's cookies into a browser context, host-only on identity like the server's own `__Host-` cookie. */
export async function addIdentitySessionCookies(context: BrowserContext, session: IdentitySession): Promise<void> {
  await context.addCookies(identityStorageState(session).cookies);
}

/** An identity `APIRequestContext` signed in as the session's user. */
export async function identitySessionContext(session: IdentitySession, options: IdentitySessionContextOptions = {}): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: requireProductUrl('identity'),
    ignoreHTTPSErrors: true,
    storageState: identityStorageState(session),
    extraHTTPHeaders: options.clientIp ? clientIpHeaders(options.clientIp) : undefined,
  });
}
