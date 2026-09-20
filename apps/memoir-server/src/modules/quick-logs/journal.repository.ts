/**
 * Importing npm packages
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type DatabaseTransaction, type JournalEntry, schema } from '@server/database';

/**
 * Defining types
 */

export interface JournalEntryDraft {
  id: string;
  date: string;
  text: string;
  mood: number | null;
  tags: string[] | null;
}

/**
 * Declaring the constants
 */

@Injectable()
export class JournalRepository extends OwnerScopedRepository {
  async create(tx: DatabaseTransaction, draft: JournalEntryDraft, rewarded: boolean): Promise<JournalEntry.Row> {
    const accountId = this.requireAccountId();
    const [entry] = await tx
      .insert(schema.journalEntries)
      .values({ id: draft.id, accountId, date: draft.date, text: draft.text, mood: draft.mood, tags: draft.tags, rewarded })
      .returning();
    if (!entry) throw AppError.internal('journal entry insert returned no row');
    return entry;
  }

  /** Count of entries in `[from, to]` (inclusive, ISO dates) — the PRD §4.13 monthly cap's input. */
  async countInRange(tx: DatabaseTransaction, from: string, to: string): Promise<number> {
    const accountId = this.requireAccountId();
    const [row] = await tx
      .select({ count: sql<string>`count(*)` })
      .from(schema.journalEntries)
      .where(and(eq(schema.journalEntries.accountId, accountId), gte(schema.journalEntries.date, from), lte(schema.journalEntries.date, to)));
    return Number(row?.count ?? 0);
  }
}
