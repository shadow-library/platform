/**
 * Importing npm packages
 */
import { and, eq } from 'drizzle-orm';
import { BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import * as schema from '@server/database/schemas';

import { senderEndpoints, senderProfiles, senderRoutingRules } from './seed-data';
import { BASELINE_LAYOUTS, BASELINE_PARTIALS, BASELINE_TEMPLATES, DEMO_MESSAGES } from './seed-data/baseline.data';

/**
 * Defining types
 */
type Database = BunSQLDatabase<typeof schema>;

/**
 * Declaring the constants
 */
const logger = Logger.getLogger('Scripts', 'Seeder');
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

/** Publishes the baseline design-system layouts, if a layout with the same key is not already present. */
async function bootstrapLayouts(db: Database): Promise<void> {
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

/** Publishes the baseline reusable partials, if a partial with the same key is not already present. */
async function bootstrapPartials(db: Database): Promise<void> {
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
async function bootstrapTemplates(db: Database): Promise<void> {
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

/** Seeds the sender profiles / endpoints / routing rules that back message delivery. Idempotent on their unique keys. */
async function bootstrapSenders(db: Database): Promise<void> {
  await db.insert(schema.senderProfiles).values(senderProfiles).onConflictDoNothing();
  await db.insert(schema.senderEndpoints).values(senderEndpoints).onConflictDoNothing();
  await db.insert(schema.senderRoutingRules).values(senderRoutingRules).onConflictDoNothing();
}

/** Seeds a few pre-rendered messages so the dev message log has data — only when the log is empty. */
async function bootstrapDemoMessages(db: Database): Promise<void> {
  const existing = await db.$count(schema.notificationMessages);
  if (existing > 0) return;

  for (const message of DEMO_MESSAGES) {
    const template = await db.query.templates.findFirst({
      where: eq(schema.templates.templateKey, message.templateKey),
      with: { versions: { where: eq(schema.templateVersions.status, 'PUBLISHED'), limit: 1 } },
    });
    const version = template?.versions[0];
    if (!template || !version) continue;

    const [job] = await db
      .insert(schema.notificationJobs)
      .values({
        templateId: template.id,
        templateVersionId: version.id,
        channel: message.channel,
        locale: message.locale,
        priority: template.priority,
        recipient: message.recipient,
        payload: message.payload,
        status: 'SENT',
        attempt: 1,
        lastAttemptedAt: new Date(),
      })
      .returning();
    if (!job) continue;
    await db.insert(schema.notificationMessages).values({ notificationJobId: job.id, renderedSubject: message.renderedSubject, renderedBody: message.renderedBody });
  }
}

/**
 * Idempotently bootstraps the datastore to its baseline. Safe to run repeatedly (dev, CI template DB, and production):
 * every step creates only what is absent, so nothing an operator has authored is overwritten — no destructive truncate.
 */
export async function seed(db?: Database): Promise<void> {
  if (!db) {
    const url = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost/shadow_pulse';
    db = drizzle(url, { schema });
    logger.debug(`Connected to database '${url.split('/').pop()}' for seeding`);
  }

  await bootstrapLayouts(db);
  await bootstrapPartials(db);
  await bootstrapTemplates(db);
  await bootstrapSenders(db);
  await bootstrapDemoMessages(db);

  await db.execute(SEQUENCE_RESET);
  logger.info('Database seeding completed successfully');
}

if (import.meta.path === Bun.main) {
  Logger.attachTransport('console:pretty');
  await seed().catch(err => logger.error('Seeding failed', err));
}
