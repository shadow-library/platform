/**
 * Importing npm packages
 */
import postgres, { type Sql } from 'postgres';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/** The five platform databases, keyed by the logical name that maps to both an env override and a physical db name. */
type DatabaseKey = 'identity' | 'memoir' | 'pulse' | 'webNovel' | 'novelForge';

/**
 * Declaring the constants
 *
 * A `postgres`-package client for use INSIDE specs, which run under Playwright's node runner where Bun's own
 * `Bun.sql` is unavailable. Connections are opened lazily — a spec that never touches the database pays nothing —
 * and cached per database, so repeated `identityDb()` calls in one run share a single pool. `closeDbs()` (wired
 * into Playwright's global teardown) drains them so the process exits cleanly instead of hanging on open sockets.
 *
 * The dev cluster's Postgres is reachable from the host on `127.0.0.1:5432` (Traefik raw-TCP entrypoint) with the
 * deliberately well-known `postgres:postgres` superuser. Each connection string is overridable via `E2E_PG_URL_*`
 * to point at another environment; unlike the seed, a blank override is not meaningful here — a spec that calls
 * `identityDb()` needs a real connection, so an unset var falls back to the local default.
 */

/** Physical database name for each key, used to build the default local URL. */
const DATABASE_NAMES: Record<DatabaseKey, string> = {
  identity: 'identity',
  memoir: 'shadow_memoir',
  pulse: 'pulse',
  webNovel: 'web_novel',
  novelForge: 'novel_forge',
};

/** The env var each database's connection string is read from — matches the seed's overrides so one `.env` drives both. */
const DATABASE_ENV_VARS: Record<DatabaseKey, string> = {
  identity: 'E2E_PG_URL_IDENTITY',
  memoir: 'E2E_PG_URL_MEMOIR',
  pulse: 'E2E_PG_URL_PULSE',
  webNovel: 'E2E_PG_URL_WEB_NOVEL',
  novelForge: 'E2E_PG_URL_NOVEL_FORGE',
};

const clients = new Map<DatabaseKey, Sql>();

/** Resolves `key`'s connection string — the env override when set to something non-blank, else the local cluster default. */
function resolveUrl(key: DatabaseKey): string {
  const override = process.env[DATABASE_ENV_VARS[key]]?.trim();
  return override ? override : `postgresql://postgres:postgres@127.0.0.1:5432/${DATABASE_NAMES[key]}`;
}

/** Returns the cached client for `key`, opening one on first use. `max: 4` keeps the suite well under Postgres' connection ceiling. */
function db(key: DatabaseKey): Sql {
  const existing = clients.get(key);
  if (existing) return existing;

  // `idle_timeout` closes idle sockets so a Playwright worker's event loop can drain and the process exit cleanly
  // even when a spec forgets the teardown; `max: 4` keeps the whole suite well under Postgres' connection ceiling.
  const client = postgres(resolveUrl(key), { max: 4, idle_timeout: 2, onnotice: () => undefined });
  clients.set(key, client);
  return client;
}

/** The identity database — users, credentials, `notification_outbox`. */
export function identityDb(): Sql {
  return db('identity');
}

/** The pulse database — sender profiles/endpoints/routing, notification jobs and messages. */
export function pulseDb(): Sql {
  return db('pulse');
}

/** The web-novel database — novels, chapters, grants, reading progress, library, wiki. */
export function webNovelDb(): Sql {
  return db('webNovel');
}

/** The shadow-memoir database — accounts, quests, quest logs, finance, quick logs, sync/command log. */
export function memoirDb(): Sql {
  return db('memoir');
}

/** The novel-forge database — projects and their cascade of authoring state. */
export function novelForgeDb(): Sql {
  return db('novelForge');
}

/**
 * The newest OTP identity enqueued for `email` under `templateKey`, or `undefined` when none exists yet.
 *
 * Identity writes OTPs to `notification_outbox` transactionally with the action that triggers them — before the
 * worker dispatches anything to pulse — so this is the fastest, most reliable way for a spec to read a code back.
 * The recipient email lives at `recipients->>'email'` and the code at `payload->>'code'`; newest row wins.
 */
export async function fetchLatestOtp(email: string, templateKey: string): Promise<string | undefined> {
  const rows = await identityDb()<{ code: string | null }[]>`
    SELECT payload->>'code' AS code
    FROM notification_outbox
    WHERE recipients->>'email' = ${email} AND template_key = ${templateKey}
    ORDER BY id DESC
    LIMIT 1
  `;
  return rows[0]?.code ?? undefined;
}

/** Closes every open database client. Call from Playwright's global teardown so the node process can exit. */
export async function closeDbs(): Promise<void> {
  const open = [...clients.values()];
  clients.clear();
  await Promise.all(open.map(client => client.end({ timeout: 5 })));
}
