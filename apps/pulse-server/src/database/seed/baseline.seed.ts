import assert from 'node:assert';

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { Config, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { BASELINE_LAYOUTS, BASELINE_PARTIALS, BASELINE_SENDER_PROFILE, BASELINE_TEMPLATES } from './baseline.data';

const logger = Logger.getLogger(APP_NAME, 'BaselineSeed');
const SEQUENCE_RESET = `
  DO $$
  DECLARE r record;
  BEGIN
    FOR r IN
      SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name,
             pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE c.relkind = 'r' AND n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
        AND pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) IS NOT NULL
    LOOP
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 1), true)', r.seq_name, r.column_name, r.schema_name, r.table_name);
    END LOOP;
  END $$;
`;

async function bootstrapLayouts(db: PrimaryDatabase): Promise<void> {
  for (const fixture of BASELINE_LAYOUTS) {
    const [inserted] = await db
      .insert(schema.layouts)
      .values({ layoutKey: fixture.layoutKey, name: fixture.name, description: fixture.description })
      .onConflictDoNothing({ target: schema.layouts.layoutKey })
      .returning();
    const layout = inserted ?? (await db.query.layouts.findFirst({ where: eq(schema.layouts.layoutKey, fixture.layoutKey) }));
    if (!layout) continue;
    const published = await db.query.layoutVersions.findFirst({ where: and(eq(schema.layoutVersions.layoutId, layout.id), eq(schema.layoutVersions.status, 'PUBLISHED')) });
    if (published) continue;
    await db.insert(schema.layoutVersions).values({ layoutId: layout.id, version: 1, status: 'PUBLISHED', body: fixture.body, notes: 'Baseline', publishedAt: new Date() });
  }
}

async function bootstrapPartials(db: PrimaryDatabase): Promise<void> {
  for (const fixture of BASELINE_PARTIALS) {
    const [inserted] = await db
      .insert(schema.partials)
      .values({ partialKey: fixture.partialKey, name: fixture.name, description: fixture.description })
      .onConflictDoNothing({ target: schema.partials.partialKey })
      .returning();
    const partial = inserted ?? (await db.query.partials.findFirst({ where: eq(schema.partials.partialKey, fixture.partialKey) }));
    if (!partial) continue;
    const published = await db.query.partialVersions.findFirst({ where: and(eq(schema.partialVersions.partialId, partial.id), eq(schema.partialVersions.status, 'PUBLISHED')) });
    if (published) continue;
    await db.insert(schema.partialVersions).values({ partialId: partial.id, version: 1, status: 'PUBLISHED', body: fixture.body, notes: 'Baseline', publishedAt: new Date() });
  }
}

/**
 * Bootstraps each catalogue template: metadata + variable contract + channel enablement, and a published v1 carrying
 * the en-ZZ content — but only when the template has no published version yet. An operator's customised template is
 * therefore never clobbered by a later boot (the "overwritable baseline" contract).
 */
async function bootstrapTemplates(db: PrimaryDatabase): Promise<void> {
  for (const fixture of BASELINE_TEMPLATES) {
    const [inserted] = await db
      .insert(schema.templates)
      .values({
        templateKey: fixture.templateKey,
        name: fixture.name,
        description: fixture.description,
        messageType: fixture.messageType,
        priority: fixture.priority,
        category: fixture.category,
        isActive: fixture.isActive ?? true,
        variableSchema: { variables: fixture.variables },
      })
      .onConflictDoNothing({ target: schema.templates.templateKey })
      .returning();
    const template = inserted ?? (await db.query.templates.findFirst({ where: eq(schema.templates.templateKey, fixture.templateKey) }));
    if (!template) continue;

    for (const content of fixture.channels) {
      await db.insert(schema.templateChannelSettings).values({ templateId: template.id, channel: content.channel, isEnabled: true }).onConflictDoNothing();
    }

    const published = await db.query.templateVersions.findFirst({
      where: and(eq(schema.templateVersions.templateId, template.id), eq(schema.templateVersions.status, 'PUBLISHED')),
    });
    if (published) continue;

    const [version] = await db
      .insert(schema.templateVersions)
      .values({ templateId: template.id, version: 1, status: 'PUBLISHED', notes: 'Baseline', publishedAt: new Date() })
      .returning();
    if (!version) continue;
    await db.insert(schema.templateContents).values(
      fixture.channels.map(content => ({
        templateVersionId: version.id,
        channel: content.channel,
        locale: 'en-ZZ',
        subject: content.subject ?? null,
        body: content.body,
        layoutKey: content.layoutKey ?? null,
      })),
    );
  }
}

/**
 * Bootstraps the catch-all sender profile, its per-channel `DEV` endpoints, and a global fallback routing rule
 * (`service`/`region`/`messageType` all `NULL`) so `resolveSenderRoutingRule` always has a lowest-priority match to
 * fall back to — without one, every notification job hits `SND_RTR_001` and is marked `PERMANENTLY_FAILED` on a
 * fresh deployment. Gated on the sender-profile table being completely empty rather than per-row `onConflictDoNothing`
 * (as the other bootstrap* steps use): `sender_routing_rules`' unique constraint doesn't dedupe all-`NULL` rows
 * (Postgres treats `NULL` as distinct from `NULL`), so there's no constraint to upsert against, and a from-scratch
 * table is the only signal this step can use for "nobody has configured sending yet". Once any sender profile
 * exists — operator-created or seeded by something else — this step steps back permanently and touches nothing.
 *
 * Also gated on `!Config.isProductionDeployment()`: the `DEV` provider only writes to `notification_messages`
 * and never actually sends, so on a real deployment this catch-all would turn every unrouted OTP or security
 * alert into a silent `SENT` — worse than the loud `SND_RTR_001`/`PERMANENTLY_FAILED` it's meant to replace,
 * because that failure is at least alertable. A fresh prod deployment must still have an operator wire up a
 * real sender profile before anything can send; dev, staging, and the CI template DB (which set `APP_STAGE=dev`)
 * keep getting the baseline row so the fixtures that assume it exist stay valid.
 */
async function bootstrapSenderConfiguration(db: PrimaryDatabase): Promise<void> {
  if (Config.isProductionDeployment()) return;

  const existingProfileCount = await db.$count(schema.senderProfiles);
  if (existingProfileCount > 0) return;

  const [profile] = await db.insert(schema.senderProfiles).values({ key: BASELINE_SENDER_PROFILE.key, displayName: BASELINE_SENDER_PROFILE.displayName }).returning();
  assert(profile, 'Failed to create baseline sender profile');

  await db.insert(schema.senderEndpoints).values(
    BASELINE_SENDER_PROFILE.endpoints.map(endpoint => ({
      senderProfileId: profile.id,
      channel: endpoint.channel,
      provider: endpoint.provider,
      identifier: endpoint.identifier,
    })),
  );

  await db.insert(schema.senderRoutingRules).values({ senderProfileId: profile.id, service: null, region: null, messageType: null });
}

/** Re-syncs every serial sequence to its column's current max, so explicit-id inserts elsewhere never leave a sequence behind. */
export async function resetSequences(db: PrimaryDatabase): Promise<void> {
  await db.execute(SEQUENCE_RESET);
}

/**
 * Idempotently bootstraps the datastore to its overwritable baseline — the branded layouts, reusable partials, and
 * the template catalogue (including the identity `auth.*`/`security.*`/`user.*` keys) run unconditionally on every
 * environment. The catch-all `DEV` sender profile and its global fallback routing rule are dev/staging/CI-only
 * (`!Config.isProductionDeployment()`): they let a fresh dev or CI deployment deliver every baseline template out
 * of the box, but a fresh *production* deployment gets none of it — an operator must configure a real sender
 * profile before anything can send, so a misrouted OTP or security alert fails loudly instead of being silently
 * swallowed by the `DEV` provider. Safe to run repeatedly: every step creates only what is absent, so nothing an
 * operator has authored — including a real, more specific routing rule or provider — is overwritten. It seeds no
 * demo messages.
 */
export async function seedBaseline(db?: PrimaryDatabase): Promise<void> {
  if (!db) {
    const url = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost/shadow_pulse';
    db = drizzle(url, { schema });
    logger.debug(`Connected to database '${url.split('/').pop()}' for baseline seeding`);
  }

  await bootstrapLayouts(db);
  await bootstrapPartials(db);
  await bootstrapTemplates(db);
  await bootstrapSenderConfiguration(db);
  await resetSequences(db);
  logger.info('Baseline seeding completed successfully');
}
