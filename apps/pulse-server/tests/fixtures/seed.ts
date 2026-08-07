/* eslint-disable perfectionist/sort-imports -- Preserve the established import order. */
import { eq } from 'drizzle-orm';
import { BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';
import { Logger } from '@shadow-library/common';

import * as schema from '@server/database/schemas';
import { resetSequences, seedBaseline } from '@server/database/seed';

import { senderEndpoints, senderProfiles, senderRoutingRules } from './seed-data';
import { DEMO_MESSAGES } from './seed-data/baseline.data';

type Database = BunSQLDatabase<typeof schema>;

const logger = Logger.getLogger('Scripts', 'Seeder');

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
 * Idempotently bootstraps the datastore for dev and the CI template DB: the production baseline (layouts, partials, the
 * template catalogue) via the shared `seedBaseline`, plus the test-only operator config (sender profiles / endpoints /
 * routing rules) and demo messages that only the test and dev surfaces need. Safe to run repeatedly — every step
 * creates only what is absent, so nothing an operator has authored is overwritten.
 */
export async function seed(db?: Database): Promise<void> {
  if (!db) {
    const url = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost/shadow_pulse';
    db = drizzle(url, { schema });
    logger.debug(`Connected to database '${url.split('/').pop()}' for seeding`);
  }

  await seedBaseline(db);
  await bootstrapSenders(db);
  await bootstrapDemoMessages(db);

  await resetSequences(db);
  logger.info('Database seeding completed successfully');
}

if (import.meta.path === Bun.main) {
  Logger.attachTransport('console:pretty');
  await seed().catch(err => logger.error('Seeding failed', err));
}
