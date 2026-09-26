import { and, eq, isNull, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { type DbExecutor, type PrimaryDatabase, type PrimaryTransaction, schema } from '@server/database';

import { countWords } from '../eval/deterministic-metrics';
import { AUTHOR_BRIEF_TOPIC } from '../ledger/ledger-sections';
import { LedgerService } from '../ledger/ledger.service';

export const NOTES_MAX_WORDS = 10_000;

export interface NotesRecord {
  text: string;
  entryId?: bigint;
  updatedAt?: Date;
}

function assertWordLimit(text: string): void {
  const words = countWords(text);
  if (words > NOTES_MAX_WORDS) throw AppErrorCode.PRJ_012.create({ words: String(words), max: String(NOTES_MAX_WORDS) });
}

/** The one place `start.brief` is read or written — by the new-novel flow, the notes edit route, and (from organise) the from-message capture. */
@Injectable()
export class NotesStoreService {
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly ledger: LedgerService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async read(projectId: bigint, tx?: PrimaryTransaction): Promise<NotesRecord> {
    const entry = await this.activeEntry(tx ?? this.db, projectId);
    return { text: entry?.statement ?? '', entryId: entry?.id, updatedAt: entry?.createdAt };
  }

  /**
   * Runs in its own transaction unless the caller already holds one (`new-novel` creating a project). Either way, an
   * advisory lock scoped to the project serialises two concurrent replaces that would otherwise both see no active
   * row and both insert one; `FOR UPDATE` then holds that row once it exists.
   */
  async replace(projectId: bigint, text: string, tx?: PrimaryTransaction): Promise<void> {
    const trimmed = text.trim();
    if (trimmed) assertWordLimit(trimmed);
    const run = (executor: PrimaryTransaction): Promise<void> => this.replaceWithin(executor, projectId, trimmed);
    return tx ? run(tx) : this.db.transaction(run);
  }

  private async activeEntry(executor: DbExecutor, projectId: bigint) {
    const table = schema.decisionLedgerEntries;
    const [entry] = await executor
      .select()
      .from(table)
      .where(and(eq(table.projectId, projectId), eq(table.topic, AUTHOR_BRIEF_TOPIC), isNull(table.supersededAt)));
    return entry;
  }

  private async replaceWithin(executor: PrimaryTransaction, projectId: bigint, trimmed: string): Promise<void> {
    await executor.execute(sql`select pg_advisory_xact_lock(${projectId})`);
    const table = schema.decisionLedgerEntries;
    const [current] = await executor
      .select()
      .from(table)
      .where(and(eq(table.projectId, projectId), eq(table.topic, AUTHOR_BRIEF_TOPIC), isNull(table.supersededAt)))
      .for('update');

    if (!trimmed) {
      if (current) await this.ledger.withdraw(projectId, current.id, 'the author cleared their notes', executor);
      return;
    }
    if (current) await this.ledger.supersede(projectId, current.id, { kind: 'direction', statement: trimmed, decidedBy: 'author' }, executor);
    else await this.ledger.append(projectId, [{ kind: 'direction', topic: AUTHOR_BRIEF_TOPIC, statement: trimmed, decidedBy: 'author' }], executor);
  }
}
