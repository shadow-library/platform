/**
 * Importing npm packages
 */
import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import postgres, { type Sql } from 'postgres';

/**
 * Importing user defined packages
 */
import { loadDotEnv } from '../lib/load-env';
import { ADMIN_EMAIL, AUTH_DIR, type Persona, PERSONAS, SEED_MANIFEST_PATH, type SeedManifest, type SeedManifestUser } from '../lib/personas';

/**
 * Defining types
 */

/** The four platform databases this seed populates, keyed by logical name. */
type DatabaseKey = 'identity' | 'pulse' | 'webNovel' | 'novelForge';

/**
 * Declaring the constants
 *
 * A Bun script that idempotently seeds the dev cluster's Postgres so the e2e suite has known users, readable
 * novels, and a delivering notification pipeline. It is safe to re-run forever: every write is an upsert keyed by
 * a well-known identifier (email, slug, profile key), never a blind insert. Playwright's `globalSetup` spawns it
 * as a subprocess (`bun seed/seed.ts`) precisely because it needs Bun APIs — `Bun.password.hash` for argon2id —
 * that the specs' node runner does not have.
 *
 * Every connection string is overridable via `E2E_PG_URL_*`; a blank override means "skip this database", which
 * lets a run target a partial environment. The identity seed must run for the sub-dependent seeds (web-novel
 * grants/progress, novel-forge cleanup) to have the OIDC subs they key on.
 */

/** Physical database name per key, for the default local URL. */
const DATABASE_NAMES: Record<DatabaseKey, string> = { identity: 'identity', pulse: 'pulse', webNovel: 'web_novel', novelForge: 'novel_forge' };

/** The env var each database's connection string is read from. */
const DATABASE_ENV_VARS: Record<DatabaseKey, string> = {
  identity: 'E2E_PG_URL_IDENTITY',
  pulse: 'E2E_PG_URL_PULSE',
  webNovel: 'E2E_PG_URL_WEB_NOVEL',
  novelForge: 'E2E_PG_URL_NOVEL_FORGE',
};

/** Slugs of the two novels the web-novel seed maintains — mirrored into the manifest so specs never hard-code them. */
const PUBLIC_NOVEL_SLUG = 'e2e-public-novel';
const RESTRICTED_NOVEL_SLUG = 'e2e-restricted-novel';

/** A far-future lock expiry for the `locked` persona, so `locked_until` stays in the future across many runs. */
const LOCK_UNTIL = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

const summary: string[] = [];

/** SHA-256 hex of `content`, matching the shape web-novel stores as a chapter/wiki `content_hash`. */
function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** The first row of a result that must be non-empty (a `RETURNING`/guarded query) — narrows past `noUncheckedIndexedAccess`. */
function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('expected a seed query to return at least one row');
  return row;
}

/**
 * Resolves `key`'s connection string. Three states, matching the product-URL convention: unset → local default,
 * blank → `null` (skip this database), non-blank → override.
 */
function resolveUrl(key: DatabaseKey): string | null {
  const raw = process.env[DATABASE_ENV_VARS[key]];
  if (raw === undefined) return `postgresql://postgres:postgres@127.0.0.1:5432/${DATABASE_NAMES[key]}`;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/** Opens a short-lived client for one seeding pass. */
function connect(url: string): Sql {
  return postgres(url, { max: 1, onnotice: () => undefined });
}

/**
 * Upserts one persona into identity — mirroring every row real password registration writes: the user, its
 * profile, a verified primary email, a PASSWORD auth identity, an argon2id password, and a personal organisation
 * with an OWNER membership. Keyed on the verified email, so a re-run updates the existing user in place. Returns
 * the manifest entry (the user id doubles as the OIDC `sub`).
 */
async function seedPersona(sql: Sql, persona: Persona): Promise<SeedManifestUser> {
  const account = PERSONAS[persona];
  const email = account.email.toLowerCase();
  const hash = await Bun.password.hash(account.password, { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 });
  const lockedUntil = account.lockMode === 'FULL' ? LOCK_UNTIL : null;

  const existing = await sql<{ user_id: string }[]>`SELECT user_id FROM user_emails WHERE lower(email_id) = ${email}`;
  let userId: string;
  if (existing.length > 0) {
    userId = first(existing).user_id;
    await sql`
      UPDATE users
      SET status = ${account.status}::user_status, lock_mode = ${account.lockMode}::user_lock_mode, locked_until = ${lockedUntil}, password_reset_required = false, updated_at = now()
      WHERE id = ${userId}
    `;
  } else {
    const inserted = await sql<{ id: string }[]>`
      INSERT INTO users (status, lock_mode, locked_until, password_reset_required)
      VALUES (${account.status}::user_status, ${account.lockMode}::user_lock_mode, ${lockedUntil}, false)
      RETURNING id
    `;
    userId = first(inserted).id;
  }

  await sql`
    INSERT INTO user_profiles (user_id, first_name, last_name)
    VALUES (${userId}, ${account.firstName}, ${account.lastName})
    ON CONFLICT (user_id) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name
  `;

  await sql`
    INSERT INTO user_emails (user_id, email_id, is_primary, verified_at)
    VALUES (${userId}, ${email}, true, now())
    ON CONFLICT (user_id, email_id) DO UPDATE SET is_primary = true, verified_at = now()
  `;

  const identity = await sql<{ id: string }[]>`
    INSERT INTO user_auth_identities (user_id, provider, provider_key)
    VALUES (${userId}, 'PASSWORD', ${email})
    ON CONFLICT (user_id, provider) DO UPDATE SET provider_key = excluded.provider_key
    RETURNING id
  `;

  await sql`
    INSERT INTO user_passwords (user_auth_identity_id, hash, algorithm, version)
    VALUES (${first(identity).id}, ${hash}, 'ARGON2ID', 1)
    ON CONFLICT (user_auth_identity_id) DO UPDATE SET hash = excluded.hash, algorithm = 'ARGON2ID', version = 1
  `;

  await ensurePersonalOrg(sql, userId, `${account.firstName} ${account.lastName} Workspace`);

  return { userId, sub: userId, email };
}

/**
 * Ensures the user owns a personal organisation, backfilling `personal_organisation_id` the way registration
 * does. Idempotent: a user that already has one only has its OWNER membership re-asserted.
 */
async function ensurePersonalOrg(sql: Sql, userId: string, name: string): Promise<void> {
  const rows = await sql<{ personal_organisation_id: string | null }[]>`SELECT personal_organisation_id FROM users WHERE id = ${userId}`;
  const orgId = rows[0]?.personal_organisation_id;
  if (orgId) {
    await sql`INSERT INTO organisation_members (organisation_id, user_id, role, is_default) VALUES (${orgId}, ${userId}, 'OWNER', true) ON CONFLICT (organisation_id, user_id) DO NOTHING`;
    return;
  }

  const created = await sql<{ id: string }[]>`
    INSERT INTO organisations (slug, name, type, status)
    VALUES (${`e2e-personal-${userId}`}, ${name}, 'PERSONAL', 'ACTIVE')
    ON CONFLICT (slug) DO UPDATE SET name = excluded.name
    RETURNING id
  `;
  await sql`INSERT INTO organisation_members (organisation_id, user_id, role, is_default) VALUES (${first(created).id}, ${userId}, 'OWNER', true) ON CONFLICT (organisation_id, user_id) DO NOTHING`;
  await sql`UPDATE users SET personal_organisation_id = ${first(created).id} WHERE id = ${userId}`;
}

/** Seeds all five personas (the bootstrap admin is one of them, so this also performs the admin password reset). */
async function seedIdentity(url: string): Promise<Record<Persona, SeedManifestUser>> {
  const sql = connect(url);
  try {
    const users = {} as Record<Persona, SeedManifestUser>;
    for (const persona of Object.keys(PERSONAS) as Persona[]) users[persona] = await seedPersona(sql, persona);
    summary.push(`identity: ${Object.keys(PERSONAS).length} personas upserted (admin ${ADMIN_EMAIL} password reset)`);
    for (const persona of Object.keys(users) as Persona[]) summary.push(`  ${persona.padEnd(9)} id=${users[persona].userId} sub=${users[persona].sub} <${users[persona].email}>`);
    return users;
  } finally {
    await sql.end();
  }
}

/** Seeds the two readable novels, their chapters, a restricted grant for user1, wiki entries, and user1's library/progress. */
async function seedWebNovel(url: string, user1Sub: string): Promise<void> {
  const sql = connect(url);
  try {
    const publicId = await upsertNovel(sql, {
      slug: PUBLIC_NOVEL_SLUG,
      title: 'The E2E Public Chronicle',
      blurb: 'A freely readable novel seeded for end-to-end tests.',
      genres: ['fantasy', 'adventure'],
      visibility: 'PUBLIC',
    });
    for (const ordinal of [1, 2, 3]) await upsertChapter(sql, publicId, ordinal);

    const restrictedId = await upsertNovel(sql, {
      slug: RESTRICTED_NOVEL_SLUG,
      title: 'The E2E Restricted Vault',
      blurb: 'A restricted novel readable only by a granted subject.',
      genres: ['mystery'],
      visibility: 'RESTRICTED',
    });
    for (const ordinal of [1, 2]) await upsertChapter(sql, restrictedId, ordinal);
    await sql`INSERT INTO novel_grants (novel_id, subject_id) VALUES (${restrictedId}, ${user1Sub}) ON CONFLICT (novel_id, subject_id) DO NOTHING`;

    const visibleEntry = await upsertWikiEntry(sql, publicId, { entryKey: 'the-protagonist', type: 'character', name: 'The Protagonist', firstVisibleOrdinal: 0 });
    await upsertWikiFacet(sql, visibleEntry, { facetKey: 'overview', content: 'Known from the very first page.', visibleFromOrdinal: 0 });
    const lockedEntry = await upsertWikiEntry(sql, publicId, { entryKey: 'the-ancient-order', type: 'faction', name: 'The Ancient Order', firstVisibleOrdinal: 2 });
    await upsertWikiFacet(sql, lockedEntry, { facetKey: 'secret-origin', content: 'Revealed only once the reader reaches chapter three.', visibleFromOrdinal: 3 });

    await sql`INSERT INTO library (user_id, novel_id) VALUES (${user1Sub}, ${publicId}) ON CONFLICT (user_id, novel_id) DO NOTHING`;
    await sql`
      INSERT INTO reading_progress (user_id, novel_id, ordinal, position, furthest_ordinal)
      VALUES (${user1Sub}, ${publicId}, 2, 0, 2)
      ON CONFLICT (user_id, novel_id) DO UPDATE SET ordinal = excluded.ordinal, furthest_ordinal = excluded.furthest_ordinal, updated_at = now()
    `;

    summary.push(
      `web_novel: ${PUBLIC_NOVEL_SLUG} (PUBLIC, 3 chapters, 2 wiki entries) + ${RESTRICTED_NOVEL_SLUG} (RESTRICTED, 2 chapters, grant → user1); user1 library + progress`,
    );
  } finally {
    await sql.end();
  }
}

interface NovelSeed {
  slug: string;
  title: string;
  blurb: string;
  genres: string[];
  visibility: 'PUBLIC' | 'RESTRICTED';
}

async function upsertNovel(sql: Sql, novel: NovelSeed): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO novels (slug, title, blurb, genres, status, visibility, revision)
    VALUES (${novel.slug}, ${novel.title}, ${novel.blurb}, ${novel.genres}, 'live', ${novel.visibility}::novel_visibility, 1)
    ON CONFLICT (slug) DO UPDATE SET title = excluded.title, blurb = excluded.blurb, genres = excluded.genres, visibility = excluded.visibility, revision = excluded.revision, updated_at = now()
    RETURNING id
  `;
  return first(rows).id;
}

async function upsertChapter(sql: Sql, novelId: string, ordinal: number): Promise<void> {
  const content = `Chapter ${ordinal} of the seeded novel. Its body is deliberately distinct so its content hash is unique.`;
  await sql`
    INSERT INTO published_chapters (novel_id, ordinal, title, content, content_hash, revision, word_count, published_at)
    VALUES (${novelId}, ${ordinal}, ${`Chapter ${ordinal}`}, ${content}, ${sha256(content)}, 1, ${content.split(' ').length}, now())
    ON CONFLICT (novel_id, ordinal) DO UPDATE SET title = excluded.title, content = excluded.content, content_hash = excluded.content_hash, revision = excluded.revision, word_count = excluded.word_count, updated_at = now()
  `;
}

interface WikiEntrySeed {
  entryKey: string;
  type: string;
  name: string;
  firstVisibleOrdinal: number;
}

async function upsertWikiEntry(sql: Sql, novelId: string, entry: WikiEntrySeed): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO wiki_entries (novel_id, entry_key, type, name, first_visible_ordinal, content_hash, revision)
    VALUES (${novelId}, ${entry.entryKey}, ${entry.type}, ${entry.name}, ${entry.firstVisibleOrdinal}, ${sha256(entry.entryKey + entry.name)}, 1)
    ON CONFLICT (novel_id, entry_key) DO UPDATE SET type = excluded.type, name = excluded.name, first_visible_ordinal = excluded.first_visible_ordinal, content_hash = excluded.content_hash, revision = excluded.revision, updated_at = now()
    RETURNING id
  `;
  return first(rows).id;
}

interface WikiFacetSeed {
  facetKey: string;
  content: string;
  visibleFromOrdinal: number;
}

async function upsertWikiFacet(sql: Sql, entryId: string, facet: WikiFacetSeed): Promise<void> {
  await sql`
    INSERT INTO wiki_entry_facets (entry_id, facet_key, content, sort_order, visible_from_ordinal)
    VALUES (${entryId}, ${facet.facetKey}, ${facet.content}, 0, ${facet.visibleFromOrdinal})
    ON CONFLICT (entry_id, facet_key) DO UPDATE SET content = excluded.content, sort_order = excluded.sort_order, visible_from_ordinal = excluded.visible_from_ordinal
  `;
}

/**
 * Seeds pulse's delivery infrastructure so a `POST /api/v1/notifications` from any service (identity included)
 * actually delivers: an active `e2e-dev` profile, DEV EMAIL + SMS endpoints, and the global all-NULL routing rule
 * that catches every (service, region, message-type) combination. The catch-all rule is guarded by an existence
 * check rather than `ON CONFLICT`, because its unique index treats the three NULLs as distinct and would let a
 * re-run insert a duplicate.
 */
async function seedPulse(url: string): Promise<void> {
  const sql = connect(url);
  try {
    const profile = await sql<{ id: string }[]>`
      INSERT INTO sender_profiles (key, display_name, is_active)
      VALUES ('e2e-dev', 'E2E Dev Sender', true)
      ON CONFLICT (key) DO UPDATE SET display_name = excluded.display_name, is_active = true, updated_at = now()
      RETURNING id
    `;
    const profileId = first(profile).id;

    for (const [channel, identifier] of [
      ['EMAIL', 'e2e-no-reply@shadow-apps.test'],
      ['SMS', '+10000000000'],
    ] as const) {
      await sql`
        INSERT INTO sender_endpoints (sender_profile_id, channel, provider, identifier, is_active)
        VALUES (${profileId}, ${channel}::notification_channel, 'DEV'::notification_service_providers, ${identifier}, true)
        ON CONFLICT (channel, provider, identifier) DO UPDATE SET sender_profile_id = excluded.sender_profile_id, is_active = true, updated_at = now()
      `;
    }

    const existing = await sql<{ id: string }[]>`SELECT id FROM sender_routing_rules WHERE service IS NULL AND region IS NULL AND message_type IS NULL`;
    if (existing.length > 0) await sql`UPDATE sender_routing_rules SET sender_profile_id = ${profileId}, updated_at = now() WHERE id = ${first(existing).id}`;
    else await sql`INSERT INTO sender_routing_rules (sender_profile_id, service, region, message_type) VALUES (${profileId}, NULL, NULL, NULL)`;

    summary.push('pulse: e2e-dev sender profile + DEV EMAIL/SMS endpoints + global default routing rule');
  } finally {
    await sql.end();
  }
}

/** Deletes every novel-forge project owned by an e2e persona (cascade), so repeated runs don't accumulate authoring state. */
async function cleanNovelForge(url: string, subs: string[]): Promise<void> {
  const sql = connect(url);
  try {
    const deleted = await sql`DELETE FROM projects WHERE owner_id = ANY(${subs}::bigint[]) RETURNING id`;
    summary.push(`novel_forge: deleted ${deleted.count} project(s) owned by e2e personas`);
  } finally {
    await sql.end();
  }
}

/** Writes the computed ids/subs to the gitignored manifest the specs read. */
function writeManifest(users: Record<Persona, SeedManifestUser>): void {
  const manifest: SeedManifest = { generatedAt: new Date().toISOString(), users, webNovel: { publicSlug: PUBLIC_NOVEL_SLUG, restrictedSlug: RESTRICTED_NOVEL_SLUG } };
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(SEED_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  summary.push(`manifest: wrote ${SEED_MANIFEST_PATH}`);
}

async function main(): Promise<void> {
  loadDotEnv(path.join(import.meta.dirname, '..', '.env'));

  const identityUrl = resolveUrl('identity');
  const users = identityUrl ? await seedIdentity(identityUrl) : null;
  if (!identityUrl) summary.push('identity: skipped (E2E_PG_URL_IDENTITY blank)');

  const novelForgeUrl = resolveUrl('novelForge');
  if (novelForgeUrl && users)
    await cleanNovelForge(
      novelForgeUrl,
      Object.values(users).map(u => u.sub),
    );
  else summary.push(`novel_forge: skipped (${novelForgeUrl ? 'no identity subs' : 'E2E_PG_URL_NOVEL_FORGE blank'})`);

  const webNovelUrl = resolveUrl('webNovel');
  if (webNovelUrl && users) await seedWebNovel(webNovelUrl, users.user1.sub);
  else summary.push(`web_novel: skipped (${webNovelUrl ? 'no identity subs' : 'E2E_PG_URL_WEB_NOVEL blank'})`);

  const pulseUrl = resolveUrl('pulse');
  if (pulseUrl) await seedPulse(pulseUrl);
  else summary.push('pulse: skipped (E2E_PG_URL_PULSE blank)');

  if (users) writeManifest(users);

  console.info(['', '=== e2e seed complete ===', ...summary, ''].join('\n'));
}

await main();
