import assert from 'node:assert';

import { and, eq } from 'drizzle-orm';
import { Config, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema, type Template } from '@server/database';
import { TemplateEngineService } from '@modules/template/rendering/template-engine.service';

import { BASELINE_LAYOUTS, BASELINE_PARTIALS, BASELINE_SENDER_PROFILE, BASELINE_TEMPLATES, type LayoutFixture, type PartialFixture, type TemplateFixture } from './baseline.data';
import { BaselineRenderGate, loadPublishedDesignSystem } from './baseline.render-gate';
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
  renders(): Promise<boolean>;
  insert(tx: SeedTransaction, version: number): Promise<unknown>;
  archivePublished(tx: SeedTransaction): Promise<unknown>;
  stamp(versionId: bigint): Promise<unknown>;
}

export type BaselineGate = Pick<BaselineRenderGate, 'catalogueRenders' | 'layoutRenders' | 'templateRenders'>;

const BASELINE_NOTES = 'Baseline';

/** Superseding archives the old PUBLISHED version and inserts the new one in one transaction; a failed update is logged, not thrown, because the old copy keeps serving. */
async function applyBaselineStep(db: PrimaryDatabase, subject: string, step: BaselineStep, writer: VersionWriter): Promise<void> {
  if (step.action === 'keep') {
    if (step.reason === 'draft-open' || step.reason === 'contract-changed') logger.warn('baseline update withheld', { subject, reason: step.reason });
    return;
  }
  if (step.action === 'adopt') return void (await writer.stamp(step.versionId));
  if (!(await writer.renders())) return logger.warn('baseline update withheld', { subject, reason: 'render-failed' });
  if (step.action === 'create') return void (await db.transaction(tx => writer.insert(tx, step.version)));

  try {
    await db.transaction(async tx => {
      await writer.archivePublished(tx);
      await writer.insert(tx, step.version);
    });
    logger.info('published an updated baseline version', { subject, version: step.version, superseded: step.publishedId });
  } catch (error) {
    logger.error('failed to publish an updated baseline version', { subject, version: step.version, error });
  }
}

export async function bootstrapPartials(db: PrimaryDatabase, gate: BaselineGate, fixtures: PartialFixture[] = BASELINE_PARTIALS): Promise<void> {
  let catalogueRenders: Promise<boolean> | undefined;
  for (const fixture of fixtures) {
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
    const published = and(eq(schema.partialVersions.partialId, partial.id), eq(schema.partialVersions.status, 'PUBLISHED'));
    await applyBaselineStep(db, `partial ${fixture.partialKey}`, step, {
      renders: () => (catalogueRenders ??= gate.catalogueRenders()),
      insert: (tx, version) =>
        tx
          .insert(schema.partialVersions)
          .values({ partialId: partial.id, version, status: 'PUBLISHED', body: fixture.body, notes: BASELINE_NOTES, baselineHash, publishedAt: new Date() }),
      archivePublished: tx => tx.update(schema.partialVersions).set({ status: 'ARCHIVED', updatedAt: new Date() }).where(published),
      stamp: versionId => db.update(schema.partialVersions).set({ baselineHash }).where(eq(schema.partialVersions.id, versionId)),
    });
  }
}

export async function bootstrapLayouts(db: PrimaryDatabase, gate: BaselineGate, fixtures: LayoutFixture[] = BASELINE_LAYOUTS): Promise<void> {
  for (const fixture of fixtures) {
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
    const published = and(eq(schema.layoutVersions.layoutId, layout.id), eq(schema.layoutVersions.status, 'PUBLISHED'));
    await applyBaselineStep(db, `layout ${fixture.layoutKey}`, step, {
      renders: () => gate.layoutRenders(fixture),
      insert: (tx, version) =>
        tx
          .insert(schema.layoutVersions)
          .values({ layoutId: layout.id, version, status: 'PUBLISHED', body: fixture.body, notes: BASELINE_NOTES, baselineHash, publishedAt: new Date() }),
      archivePublished: tx => tx.update(schema.layoutVersions).set({ status: 'ARCHIVED', updatedAt: new Date() }).where(published),
      stamp: versionId => db.update(schema.layoutVersions).set({ baselineHash }).where(eq(schema.layoutVersions.id, versionId)),
    });
  }
}

/** Metadata, variable contract and channel enablement are insert-only: they are unversioned, so the seed cannot tell an operator's edit from an older fixture. */
export async function bootstrapTemplates(db: PrimaryDatabase, gate: BaselineGate, fixtures: TemplateFixture[] = BASELINE_TEMPLATES): Promise<void> {
  for (const fixture of fixtures) {
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
    const published = and(eq(schema.templateVersions.templateId, template.id), eq(schema.templateVersions.status, 'PUBLISHED'));
    await applyBaselineStep(db, `template ${fixture.templateKey}`, step, {
      renders: () => gate.templateRenders(fixture),
      insert: async (tx, version) => {
        const [row] = await tx
          .insert(schema.templateVersions)
          .values({ templateId: template.id, version, status: 'PUBLISHED', notes: BASELINE_NOTES, baselineHash, publishedAt: new Date() })
          .returning();
        assert(row, `Failed to seed a baseline version of template ${fixture.templateKey}`);
        await tx.insert(schema.templateContents).values(contents.map(content => ({ templateVersionId: row.id, ...content })));
      },
      archivePublished: tx => tx.update(schema.templateVersions).set({ status: 'ARCHIVED', updatedAt: new Date() }).where(published),
      stamp: versionId => db.update(schema.templateVersions).set({ baselineHash }).where(eq(schema.templateVersions.id, versionId)),
    });
  }
}

/**
 * Skipped in production: the `DEV` provider only writes to `notification_messages`, so a catch-all rule there would turn an unrouted OTP or security alert into a
 * silent `SENT` instead of the loud, alertable `SND_RTR_001` failure. Gated on an empty profile table because all-`NULL` routing rules never conflict on the unique constraint.
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

export async function resetSequences(db: PrimaryDatabase): Promise<void> {
  await db.execute(SEQUENCE_RESET);
}

export async function seedBaseline(db: PrimaryDatabase): Promise<void> {
  const gate = new BaselineRenderGate(new TemplateEngineService(), () => loadPublishedDesignSystem(db));
  await bootstrapPartials(db, gate);
  await bootstrapLayouts(db, gate);
  await bootstrapTemplates(db, gate);
  await bootstrapSenderConfiguration(db);
  await resetSequences(db);
  logger.info('Baseline seeding completed successfully');
}
