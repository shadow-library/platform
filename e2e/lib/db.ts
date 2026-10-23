import postgres, { type Sql } from 'postgres';

type DatabaseKey = 'identity' | 'memoir' | 'pulse' | 'webNovel' | 'novelForge' | 'synapse';

/**
 * A `postgres`-package client for use inside specs (Playwright's node runner has no `Bun.sql`), opened lazily and cached per database.
 * The dev Postgres is reachable on `127.0.0.1:7070` (Traefik raw-TCP) as the well-known `postgres:postgres` superuser.
 * Unlike the seed, a blank `E2E_PG_URL_*` override is not meaningful here: an unset var falls back to the local default.
 */

const DATABASE_NAMES: Record<DatabaseKey, string> = {
  identity: 'identity',
  memoir: 'memoir',
  pulse: 'pulse',
  webNovel: 'web_novel',
  novelForge: 'novel_forge',
  synapse: 'synapse',
};

const DATABASE_ENV_VARS: Record<DatabaseKey, string> = {
  identity: 'E2E_PG_URL_IDENTITY',
  memoir: 'E2E_PG_URL_MEMOIR',
  pulse: 'E2E_PG_URL_PULSE',
  webNovel: 'E2E_PG_URL_WEB_NOVEL',
  novelForge: 'E2E_PG_URL_NOVEL_FORGE',
  synapse: 'E2E_PG_URL_SYNAPSE',
};

const clients = new Map<DatabaseKey, Sql>();

function resolveUrl(key: DatabaseKey): string {
  const override = process.env[DATABASE_ENV_VARS[key]]?.trim();
  return override ? override : `postgresql://postgres:postgres@127.0.0.1:7070/${DATABASE_NAMES[key]}`;
}

function db(key: DatabaseKey): Sql {
  const existing = clients.get(key);
  if (existing) return existing;

  // `idle_timeout` lets a worker's event loop drain even when a spec forgets the teardown; `max: 4` keeps the suite well under Postgres' connection ceiling.
  const client = postgres(resolveUrl(key), { max: 4, idle_timeout: 2, onnotice: () => undefined });
  clients.set(key, client);
  return client;
}

export function identityDb(): Sql {
  return db('identity');
}

export function memoirDb(): Sql {
  return db('memoir');
}

export function pulseDb(): Sql {
  return db('pulse');
}

export function webNovelDb(): Sql {
  return db('webNovel');
}

export function novelForgeDb(): Sql {
  return db('novelForge');
}

export function synapseDb(): Sql {
  return db('synapse');
}

/** The newest OTP identity enqueued for `email` under `templateKey`. Read from `notification_outbox`, which is written in the triggering transaction, before dispatch to pulse. */
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

/** Every pulse `notification_jobs` row addressed to one of `recipients`, with its messages. */
export async function deletePulseNotificationsTo(recipients: readonly string[]): Promise<void> {
  if (recipients.length === 0) return;
  const sql = pulseDb();
  const jobs = sql`SELECT id FROM notification_jobs WHERE recipient IN ${sql(recipients as string[])}`;
  await sql`DELETE FROM notification_messages WHERE notification_job_id IN (${jobs})`;
  await sql`DELETE FROM notification_jobs WHERE recipient IN ${sql(recipients as string[])}`;
}

export async function closeDbs(): Promise<void> {
  const open = [...clients.values()];
  clients.clear();
  await Promise.all(open.map(client => client.end({ timeout: 5 })));
}
