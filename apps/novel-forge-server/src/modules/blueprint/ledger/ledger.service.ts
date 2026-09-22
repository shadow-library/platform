import { and, asc, eq, isNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { type AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { assertAuthoringKind } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type Ledger, type PrimaryDatabase, type PrimaryTransaction, schema } from '@server/database';

import { filterLedgerEntries, loadActiveLedger, mergeLedgerLinks } from './ledger-entries';
import { type AuthorLedgerEntry, type AuthorSupersession, type LedgerFilter, type NewLedgerEntry, type SupersedingEntry, TOPIC_KEY_PATTERN } from './ledger.types';

function clearable(value: string | undefined, inherited: string | null): string | null {
  if (value === undefined) return inherited;
  return value.trim() || null;
}

function toRow(projectId: bigint, entry: NewLedgerEntry, supersedesId: bigint | null = null): Ledger.NewEntry {
  return {
    projectId,
    kind: entry.kind,
    phase: entry.phase,
    topic: entry.topic,
    statement: entry.statement.trim(),
    why: entry.why?.trim() || null,
    rejectedAlternatives: entry.rejectedAlternatives ?? [],
    writerLine: entry.writerLine?.trim() || null,
    decidedBy: entry.decidedBy,
    stepKey: entry.stepKey ?? null,
    payload: entry.payload ?? null,
    links: entry.links ?? {},
    supersedesId,
  };
}

/** An author rewords a decision or overrules a system detail into one; every other decision comes from locking a Blueprint step. */
export function authorSuccessor(previous: Ledger.Entry, input: AuthorSupersession): SupersedingEntry {
  const kind = input.kind ?? (previous.kind === 'system' ? 'decision' : previous.kind);
  if (kind === 'decision' && previous.kind !== 'decision' && previous.kind !== 'system') throw AppErrorCode.LDG_003.create();

  const inherits = kind === previous.kind || (kind === 'decision' && previous.kind === 'system');
  return {
    kind,
    decidedBy: 'author',
    statement: input.statement,
    why: clearable(input.why, inherits ? previous.why : null),
    writerLine: clearable(input.writerLine, inherits ? previous.writerLine : null),
    rejectedAlternatives: input.rejectedAlternatives ?? (inherits ? previous.rejectedAlternatives : []),
    payload: input.payload ?? (inherits ? previous.payload : null),
    links: inherits ? previous.links : {},
    stepKey: inherits ? previous.stepKey : null,
  };
}

export function ledgerEntryStatus(entry: Pick<Ledger.Entry, 'supersededAt' | 'withdrawnReason'>): Ledger.Status {
  if (entry.supersededAt === null) return 'active';
  return entry.withdrawnReason === null ? 'superseded' : 'withdrawn';
}

@Injectable()
export class LedgerService {
  private readonly logger = Logger.getLogger(APP_NAME, LedgerService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async listActive(projectId: bigint, filter?: LedgerFilter): Promise<Ledger.Entry[]> {
    return filterLedgerEntries(await loadActiveLedger(this.db, projectId), filter);
  }

  history(projectId: bigint, topic: string): Promise<Ledger.Entry[]> {
    const table = schema.decisionLedgerEntries;
    return this.db.query.decisionLedgerEntries.findMany({ where: and(eq(table.projectId, projectId), eq(table.topic, topic)), orderBy: [asc(table.createdAt), asc(table.id)] });
  }

  async append(projectId: bigint, entries: NewLedgerEntry[], tx?: PrimaryTransaction): Promise<Ledger.Entry[]> {
    if (entries.length === 0) return [];
    const malformed = entries.find(entry => !TOPIC_KEY_PATTERN.test(entry.topic));
    if (malformed) throw AppErrorCode.LDG_004.create({ topic: malformed.topic });
    const executor = tx ?? this.db;
    await this.assertLedgerProject(projectId, executor);

    const rows = await executor
      .insert(schema.decisionLedgerEntries)
      .values(entries.map(entry => toRow(projectId, entry)))
      .returning()
      .catch(err => this.databaseService.translateError(err));
    this.logger.info('ledger entries appended', { projectId, count: rows.length, topics: rows.map(row => row.topic) });
    return rows;
  }

  appendByAuthor(projectId: bigint, entry: AuthorLedgerEntry): Promise<Ledger.Entry> {
    return this.append(projectId, [{ ...entry, phase: entry.phase ?? null, decidedBy: 'author' }]).then(([row]) => row as Ledger.Entry);
  }

  supersede(projectId: bigint, entryId: bigint, next: SupersedingEntry, tx?: PrimaryTransaction): Promise<Ledger.Entry> {
    const table = schema.decisionLedgerEntries;
    const run = async (executor: DbExecutor): Promise<Ledger.Entry> => {
      await this.assertLedgerProject(projectId, executor);
      const [previous] = await executor
        .update(table)
        .set({ supersededAt: new Date() })
        .where(and(eq(table.id, entryId), eq(table.projectId, projectId), isNull(table.supersededAt)))
        .returning();
      if (!previous) throw await this.unsupersedable(projectId, entryId, executor);

      const [successor] = await executor
        .insert(table)
        .values(toRow(projectId, { ...next, topic: previous.topic, phase: previous.phase }, previous.id))
        .returning()
        .catch(err => this.databaseService.translateError(err));
      if (!successor) throw AppErrorCode.S001.create();

      this.logger.info('ledger entry superseded', { projectId, topic: previous.topic, supersededId: previous.id, successorId: successor.id, kind: successor.kind });
      return successor;
    };
    return tx ? run(tx) : this.db.transaction(run);
  }

  async supersedeByAuthor(projectId: bigint, entryId: bigint, input: AuthorSupersession): Promise<Ledger.Entry> {
    const previous = await this.getActive(projectId, entryId);
    return this.supersede(projectId, entryId, authorSuccessor(previous, input));
  }

  /** Deactivates the entry without a successor, so a dropped direction or a lifted rejection leaves nothing behind in the active ledger. */
  async withdraw(projectId: bigint, entryId: bigint, reason: string, tx?: PrimaryTransaction): Promise<Ledger.Entry> {
    const table = schema.decisionLedgerEntries;
    const executor = tx ?? this.db;
    await this.assertLedgerProject(projectId, executor);
    const [withdrawn] = await executor
      .update(table)
      .set({ supersededAt: new Date(), withdrawnReason: reason.trim() })
      .where(and(eq(table.id, entryId), eq(table.projectId, projectId), isNull(table.supersededAt)))
      .returning();
    if (!withdrawn) throw await this.unsupersedable(projectId, entryId, executor);

    this.logger.info('ledger entry withdrawn', { projectId, topic: withdrawn.topic, entryId: withdrawn.id, kind: withdrawn.kind });
    return withdrawn;
  }

  /** Links record what an entry produced, which grows after it is appended, so they are the one in-place write besides retiring an entry. */
  linkEntry(projectId: bigint, entryId: bigint, links: Ledger.Links, tx?: PrimaryTransaction): Promise<Ledger.Entry> {
    const table = schema.decisionLedgerEntries;
    const run = async (executor: DbExecutor): Promise<Ledger.Entry> => {
      const [entry] = await executor
        .select()
        .from(table)
        .where(and(eq(table.id, entryId), eq(table.projectId, projectId)))
        .for('update');
      if (!entry) throw AppErrorCode.LDG_001.create();

      const [linked] = await executor
        .update(table)
        .set({ links: mergeLedgerLinks(entry.links, links) })
        .where(eq(table.id, entryId))
        .returning();
      return linked ?? entry;
    };
    return tx ? run(tx) : this.db.transaction(run);
  }

  private async getActive(projectId: bigint, entryId: bigint): Promise<Ledger.Entry> {
    const table = schema.decisionLedgerEntries;
    const entry = await this.db.query.decisionLedgerEntries.findFirst({ where: and(eq(table.id, entryId), eq(table.projectId, projectId)) });
    if (!entry) throw AppErrorCode.LDG_001.create();
    if (entry.supersededAt) throw AppErrorCode.LDG_002.create();
    return entry;
  }

  private async unsupersedable(projectId: bigint, entryId: bigint, executor: DbExecutor): Promise<AppError> {
    const table = schema.decisionLedgerEntries;
    const entry = await executor.query.decisionLedgerEntries.findFirst({ where: and(eq(table.id, entryId), eq(table.projectId, projectId)), columns: { id: true } });
    return entry ? AppErrorCode.LDG_002.create() : AppErrorCode.LDG_001.create();
  }

  private async assertLedgerProject(projectId: bigint, executor: DbExecutor): Promise<void> {
    const project = await executor.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { kind: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();
    assertAuthoringKind(project);
  }
}
