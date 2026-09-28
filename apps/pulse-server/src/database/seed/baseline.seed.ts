import assert from 'node:assert';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { Config, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema, type Template } from '@server/database';

import { BASELINE_LAYOUTS, BASELINE_PARTIALS, BASELINE_SENDER_PROFILE, BASELINE_TEMPLATES } from './baseline.data';
import { type BaselineStep, hashBaseline, hashTemplateContents, isSameContract, planBaselineStep, templateFixtureContents } from './baseline.versioning';

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

type SeedTransaction = Parameters<Parameters<PrimaryDatabase['transaction']>[0]>[0];

interface VersionWriter {
  insert(tx: SeedTransaction, version: number): Promise<unknown>;
  archive(tx: SeedTransaction, versionId: bigint): Promise<unknown>;
  stamp(versionId: bigint): Promise<unknown>;
}

const BASELINE_NOTES = 'Baseline';

/**
 * A superseding publish mirrors rollback: the current PUBLISHED version is archived and the new one inserted in one transaction, so there
 * is never a moment with two or none. A failed update is logged and skipped rather than failing the migration: the old copy keeps serving.
 */
async function applyBaselineStep(db: PrimaryDatabase, subject: string, step: BaselineStep, writer: VersionWriter): Promise<void> {
  switch (step.action) {
    case 'keep':
      if (step.reason === 'draft-open' || step.reason === 'contract-changed') logger.warn('baseline update withheld', { subject, reason: step.reason });
      return;
    case 'create':
      await db.transaction(tx => writer.insert(tx, step.version));
      return;
    case 'adopt':
      await writer.stamp(step.versionId);
      return;
    case 'supersede':
      try {
        await db.transaction(async tx => {
          await writer.archive(tx, step.publishedId);
          await writer.insert(tx, step.version);
        });
        logger.info('published an updated baseline version', { subject, version: step.version });
      } catch (error) {
        logger.error('failed to publish an updated baseline version', { subject, version: step.version, error });
      }
  }
}

export async function bootstrapLayouts(db: PrimaryDatabase): Promise<void> {
  for (const fixture of BASELINE_LAYOUTS) {
    const [inserted] = await db
      .insert(schema.layouts)
      .values({ layoutKey: fixture.layoutKey, name: fixture.name, description: fixture.description })
      .onConflictDoNothing({ target: schema.layouts.layoutKey })
      .returning();
    const [layout] = inserted ? [inserted] : await db.select().from(schema.layouts).where(eq(schema.layouts.layoutKey, fixture.layoutKey));
    if (!layout) continue;

    const baselineHash = hashBaseline({ body: fixture.body });
    const versions = await db.select().from(schema.layoutVersions).where(eq(schema.layoutVersions.layoutId, layout.id));
    const step = await planBaselineStep(baselineHash, versions, published => hashBaseline({ body: published.body }));
    await applyBaselineStep(db, `layout ${fixture.layoutKey}`, step, {
      insert: (tx, version) =>
        tx
          .insert(schema.layoutVersions)
          .values({ layoutId: layout.id, version, status: 'PUBLISHED', body: fixture.body, notes: BASELINE_NOTES, baselineHash, publishedAt: new Date() }),
      archive: (tx, versionId) => tx.update(schema.layoutVersions).set({ status: 'ARCHIVED', updatedAt: new Date() }).where(eq(schema.layoutVersions.id, versionId)),
      stamp: versionId => db.update(schema.layoutVersions).set({ baselineHash }).where(eq(schema.layoutVersions.id, versionId)),
    });
  }
}

export async function bootstrapPartials(db: PrimaryDatabase): Promise<void> {
  for (const fixture of BASELINE_PARTIALS) {
    const [inserted] = await db
      .insert(schema.partials)
      .values({ partialKey: fixture.partialKey, name: fixture.name, description: fixture.description })
      .onConflictDoNothing({ target: schema.partials.partialKey })
      .returning();
    const [partial] = inserted ? [inserted] : await db.select().from(schema.partials).where(eq(schema.partials.partialKey, fixture.partialKey));
    if (!partial) continue;

    const baselineHash = hashBaseline({ body: fixture.body });
    const versions = await db.select().from(schema.partialVersions).where(eq(schema.partialVersions.partialId, partial.id));
    const step = await planBaselineStep(baselineHash, versions, published => hashBaseline({ body: published.body }));
    await applyBaselineStep(db, `partial ${fixture.partialKey}`, step, {
      insert: (tx, version) =>
        tx
          .insert(schema.partialVersions)
          .values({ partialId: partial.id, version, status: 'PUBLISHED', body: fixture.body, notes: BASELINE_NOTES, baselineHash, publishedAt: new Date() }),
      archive: (tx, versionId) => tx.update(schema.partialVersions).set({ status: 'ARCHIVED', updatedAt: new Date() }).where(eq(schema.partialVersions.id, versionId)),
      stamp: versionId => db.update(schema.partialVersions).set({ baselineHash }).where(eq(schema.partialVersions.id, versionId)),
    });
  }
}

/**
 * Template metadata, variable contract and channel enablement are created once and never updated: they are not versioned, so the seed
 * cannot tell an operator's edit from an older fixture. Content is versioned (see `planBaselineStep`).
 */
export async function bootstrapTemplates(db: PrimaryDatabase): Promise<void> {
  for (const fixture of BASELINE_TEMPLATES) {
    const variableSchema: Template.VariableSchema = { variables: fixture.variables };
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
        variableSchema,
      })
      .onConflictDoNothing({ target: schema.templates.templateKey })
      .returning();
    const [template] = inserted ? [inserted] : await db.select().from(schema.templates).where(eq(schema.templates.templateKey, fixture.templateKey));
    if (!template) continue;

    for (const content of fixture.channels) {
      await db.insert(schema.templateChannelSettings).values({ templateId: template.id, channel: content.channel, isEnabled: true }).onConflictDoNothing();
    }

    const contents = templateFixtureContents(fixture);
    const baselineHash = hashTemplateContents(contents);
    const versions = await db.select().from(schema.templateVersions).where(eq(schema.templateVersions.templateId, template.id));
    const storedHash = async (published: Template.Version): Promise<string> =>
      hashTemplateContents(await db.select().from(schema.templateContents).where(eq(schema.templateContents.templateVersionId, published.id)));
    const step = await planBaselineStep(baselineHash, versions, storedHash, { contractChanged: !isSameContract(template.variableSchema, variableSchema) });
    await applyBaselineStep(db, `template ${fixture.templateKey}`, step, {
      insert: async (tx, version) => {
        const [row] = await tx
          .insert(schema.templateVersions)
          .values({ templateId: template.id, version, status: 'PUBLISHED', notes: BASELINE_NOTES, baselineHash, publishedAt: new Date() })
          .returning();
        assert(row, `Failed to seed a baseline version of template ${fixture.templateKey}`);
        await tx.insert(schema.templateContents).values(contents.map(content => ({ templateVersionId: row.id, ...content })));
      },
      archive: (tx, versionId) => tx.update(schema.templateVersions).set({ status: 'ARCHIVED', updatedAt: new Date() }).where(eq(schema.templateVersions.id, versionId)),
      stamp: versionId => db.update(schema.templateVersions).set({ baselineHash }).where(eq(schema.templateVersions.id, versionId)),
    });
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
 * Idempotently bootstraps the datastore to its baseline — the branded layouts, reusable partials, and the template catalogue (including the
 * identity `auth.*`/`security.*`/`user.*` keys) run on every environment. Each is created when absent and, while the seed still owns its
 * PUBLISHED version, superseded by a new version when its fixture changes; once an operator publishes their own version it is never touched
 * again. The catch-all `DEV` sender profile and its global fallback routing rule are dev/staging/CI-only (`!Config.isProductionDeployment()`):
 * a fresh *production* deployment gets none of it, so a misrouted OTP or security alert fails loudly instead of being silently swallowed by
 * the `DEV` provider. It seeds no demo messages.
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
