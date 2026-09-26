import { and, eq, isNull, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { type DbExecutor, type PrimaryDatabase, type PrimaryTransaction, schema } from '@server/database';

import { notesParagraphs } from '../ai/context/novel-chat-context';
import { countWords } from '../eval/deterministic-metrics';
import { AUTHOR_BRIEF_TOPIC } from '../ledger/ledger-sections';
import { LedgerService } from '../ledger/ledger.service';
import { normaliseForQuote } from '../refinement/write-policy';

export const NOTES_MAX_WORDS = 10_000;
/** A message as long as notes worth organising is offered as notes; a shorter one is conversation. */
export const NOTES_MESSAGE_MIN_WORDS = 600;

export interface NotesRecord {
  text: string;
  entryId?: bigint;
  updatedAt?: Date;
}

export interface AppendedNotes {
  /** False when the notes already held the text, so nothing changed. */
  saved: boolean;
  paragraphs: number;
  words: number;
}

/** Keys the notes lock apart from every other advisory lock the app may take on a project id ("NOTE"). */
const NOTES_LOCK_NAMESPACE = 0x4e4f5445;
const INT4_MAX = 2_147_483_647;

/**
 * The notes with a text appended as paragraphs of its own, null when the notes already hold it so appending twice adds nothing; the notes
 * are read once for every text tried against them.
 */
export function notesAppender(notes: string): (text: string) => string | null {
  const held = normaliseForQuote(notes);
  const current = notes.trim();
  return text => {
    const appended = normaliseForQuote(text);
    if (appended === '' || held.includes(appended)) return null;
    return current ? `${current}\n\n${text.trim()}` : text.trim();
  };
}

export function notesWithAppended(notes: string, text: string): string | null {
  return notesAppender(notes)(text);
}

function appendedNotes(saved: boolean, notes: string): AppendedNotes {
  return { saved, paragraphs: notesParagraphs(notes).length, words: countWords(notes) };
}

function assertWordLimit(text: string): void {
  const words = countWords(text);
  if (words > NOTES_MAX_WORDS) throw AppErrorCode.PRJ_012.create({ words: String(words), max: String(NOTES_MAX_WORDS) });
}

/** The one place `start.brief` is read or written — by the new-novel flow, the notes edit route, and the chat's "Save this as notes?". */
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

  /** Appends under the same lock and word limit as a replace, as the author's own words: the chat offers it, the author accepts it. */
  append(projectId: bigint, text: string, tx?: PrimaryTransaction): Promise<AppendedNotes> {
    const run = async (executor: PrimaryTransaction): Promise<AppendedNotes> => {
      const current = await this.lockedEntry(executor, projectId);
      const notes = notesWithAppended(current?.statement ?? '', text);
      if (notes === null) return appendedNotes(false, current?.statement ?? '');
      assertWordLimit(notes);
      await this.write(executor, projectId, current, notes);
      return appendedNotes(true, notes);
    };
    return tx ? run(tx) : this.db.transaction(run);
  }

  /** Keeps one of the author's own messages in a chat as notes; only a message long enough to organise is offered, so only one is kept. */
  saveMessage(projectId: bigint, sessionId: string, messageId: bigint): Promise<AppendedNotes> {
    return this.db.transaction(async tx => {
      const messages = schema.chatMessages;
      const [message] = await tx
        .select({ content: messages.content })
        .from(messages)
        .where(and(eq(messages.id, messageId), eq(messages.sessionId, sessionId), eq(messages.projectId, projectId), eq(messages.role, 'user')))
        .limit(1);
      if (!message) throw AppErrorCode.NTS_005.create();
      if (countWords(message.content) < NOTES_MESSAGE_MIN_WORDS) throw AppErrorCode.NTS_006.create({ words: String(NOTES_MESSAGE_MIN_WORDS) });
      return this.append(projectId, message.content, tx);
    });
  }

  private async activeEntry(executor: DbExecutor, projectId: bigint) {
    const table = schema.decisionLedgerEntries;
    const [entry] = await executor
      .select()
      .from(table)
      .where(and(eq(table.projectId, projectId), eq(table.topic, AUTHOR_BRIEF_TOPIC), isNull(table.supersededAt)));
    return entry;
  }

  private async lockedEntry(executor: PrimaryTransaction, projectId: bigint) {
    const key = Number(projectId % BigInt(INT4_MAX));
    await executor.execute(sql`select pg_advisory_xact_lock(${NOTES_LOCK_NAMESPACE}::int, ${key}::int)`);
    const table = schema.decisionLedgerEntries;
    const [current] = await executor
      .select()
      .from(table)
      .where(and(eq(table.projectId, projectId), eq(table.topic, AUTHOR_BRIEF_TOPIC), isNull(table.supersededAt)))
      .for('update');
    return current;
  }

  private async replaceWithin(executor: PrimaryTransaction, projectId: bigint, trimmed: string): Promise<void> {
    const current = await this.lockedEntry(executor, projectId);
    if (!trimmed) {
      if (current) await this.ledger.withdraw(projectId, current.id, 'the author cleared their notes', executor);
      return;
    }
    await this.write(executor, projectId, current, trimmed);
  }

  private async write(executor: PrimaryTransaction, projectId: bigint, current: { id: bigint } | undefined, trimmed: string): Promise<void> {
    if (current) await this.ledger.supersede(projectId, current.id, { kind: 'direction', statement: trimmed, decidedBy: 'author' }, executor);
    else await this.ledger.append(projectId, [{ kind: 'direction', topic: AUTHOR_BRIEF_TOPIC, statement: trimmed, decidedBy: 'author' }], executor);
  }
}
