import { and, eq, inArray, isNotNull, lt, notInArray, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import * as schema from '@server/database/schemas';

import { parseTransferOptions, type TransferOptions, USAGE } from './transfer-curated-projects.options';

/**
 * Hands the projects the retired `nfk_` ingest keys created to the organisation's curation bot, so the
 * curated novels an organisation already holds keep working once the ingest surface authenticates bots.
 * It cannot be a schema migration: the bot only exists after an admin has created it in identity.
 *
 * A project's ingest provenance is its `ingest_audit_log` rows — nothing else on the row says a scraper put
 * it there. That alone is not enough to identify a *legacy* one: a human curator may still ingest, and keeps
 * ownership when they do, and the pre-cutover rows backfilled by migration 0037 carry `actor_kind = 'user'`
 * exactly like a genuine human ingest. `--before` is what separates the two (an audit row older than the
 * cutover), and `--owner` bounds the run to the curators whose projects are actually being handed over —
 * nothing links a pre-cutover project to an organisation, because that link lived on `api_keys`.
 *
 * Usage:
 *   bun src/transfer-curated-projects.ts --org <id> --bot <id> --owner <userId>[,<userId>…] [--before <ISO instant>] [--dry-run]
 *
 * In a deployed image the entry is bundled alongside the migration runner:
 *   bun dist/transfer-curated-projects.js --org 7 --bot 42 --owner 42 --dry-run
 *
 * Re-running with the same arguments is a no-op: only user-owned projects are selected, and a transferred
 * one is bot-owned. That is the only idempotence claimed — run it unbounded and it would take projects a
 * curator legitimately owns, and a project handed back by `/internal/bots/:botId/transfer` keeps its old
 * `organisation_id`, so an unbounded run could move it into a different organisation. Illustration rows keep
 * their own owner; project access follows the project, so only identity's ownership counts are affected.
 */
const logger = Logger.getLogger(APP_NAME, 'transfer-curated-projects');

type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Projects with an ingest audit row, optionally only ones older than `before`. A subquery rather than a
 * materialised id list: a deployment with enough projects would otherwise blow Postgres's 65535
 * bind-parameter ceiling on the `IN` list. It cannot yield a null, so the `NOT IN` below is safe.
 */
function ingestedProjects(db: Database, before?: Date) {
  return db
    .selectDistinct({ projectId: schema.ingestAuditLog.projectId })
    .from(schema.ingestAuditLog)
    .where(and(isNotNull(schema.ingestAuditLog.projectId), before && lt(schema.ingestAuditLog.createdAt, before)));
}

const heldByOwners = (options: TransferOptions): SQL | undefined => and(eq(schema.projects.ownerKind, 'user'), inArray(schema.projects.ownerId, options.owners));

/** The same predicate drives the preview and the write, so the write acts on what the database matches at that moment rather than on a stale list. */
const candidatePredicate = (db: Database, options: TransferOptions): SQL | undefined =>
  and(heldByOwners(options), inArray(schema.projects.id, ingestedProjects(db, options.before)));

/** Held by the named owners and ingested, but never before the cutover — a curator's own post-cutover ingest, or a cutover date set too early. */
const excludedPredicate = (db: Database, options: TransferOptions): SQL | undefined =>
  and(heldByOwners(options), inArray(schema.projects.id, ingestedProjects(db)), notInArray(schema.projects.id, ingestedProjects(db, options.before)));

const url = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';

// json rather than migrate.ts's stage-dependent choice: the pretty transport drops the metadata object, and
// the dry run's whole output is that metadata.
Logger.attachTransport('console:json');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  logger.info(USAGE);
  process.exit(0);
}

const parsed = parseTransferOptions(process.argv.slice(2));
if (!parsed.ok) {
  logger.error('curated project transfer refused', { reason: parsed.reason });
  logger.info(USAGE);
  process.exit(1);
}

const options = parsed.options;
const db = drizzle(url, { schema });

try {
  const predicate = candidatePredicate(db, options);
  const candidates = await db.select({ id: schema.projects.id, name: schema.projects.name, ownerId: schema.projects.ownerId }).from(schema.projects).where(predicate);
  const ingestedOnlyAfterCutover = await db.$count(schema.projects, excludedPredicate(db, options));
  const scope = { ingestedOnlyAfterCutover, botId: options.botId.toString(), organisationId: options.organisationId.toString(), before: options.before.toISOString() };

  // Reported on every run, because a count of transferred projects alone cannot tell a complete transfer from
  // one whose `--before` was earlier than the deployment and left legacy novels behind.
  if (ingestedOnlyAfterCutover > 0) {
    logger.warn('projects held by these owners were ingested only after the cutover and were left alone', { ingestedOnlyAfterCutover, before: scope.before });
  }

  if (candidates.length === 0) {
    logger.info('no user-owned project ingested before the cutover is held by those owners', scope);
  } else if (options.dryRun) {
    for (const project of candidates) logger.info('would transfer', { projectId: project.id.toString(), name: project.name, fromUserId: project.ownerId?.toString() ?? null });
    logger.info('dry run complete — nothing written', { projects: candidates.length, ...scope });
  } else {
    const transferred = await db
      .update(schema.projects)
      .set({ ownerKind: 'bot', ownerId: options.botId, organisationId: options.organisationId, sharedWithOrg: true })
      .where(predicate)
      .returning({ id: schema.projects.id });
    logger.info('transferred curated projects to the bot', { projects: transferred.length, ...scope });
  }

  await db.$client.close();
} catch (error) {
  logger.error('curated project transfer failed', { reason: error instanceof Error ? error.message : String(error) });
  await db.$client.close();
  process.exit(1);
}
