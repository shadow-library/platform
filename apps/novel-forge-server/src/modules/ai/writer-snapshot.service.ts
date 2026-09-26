import { type BaseMessage } from '@langchain/core/messages';
import { and, desc, eq, lt } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Ai, type PrimaryDatabase, schema } from '@server/database';
import { type WriterSnapshotMessage, type WriterSnapshotModelRoute } from '@server/database/schemas';

import { findCurrentIsolation } from '../review/review-records';

const WALLED_OFF_WRITERS_VIEW: WriterSnapshotMessage[] = [
  { role: 'system', content: 'Prose: walled off. This is an unrestricted chapter, so the messages it sent are not available here.' },
];

/** How many revisions behind a chapter's current one still keep their attempts; older revisions are pruned as newer attempts land. */
const RETAINED_PRIOR_REVISIONS = 2;

export interface WriterSnapshotMeta {
  projectId: bigint;
  chapter: number;
  draftRevision: number;
  attempt: number;
  role: Ai.WriterAttemptRole;
  contextPackId: bigint | null;
  keptBack: Record<string, unknown>;
  planRevision: number | null;
  bibleHash: string | null;
  promptKey: string;
  promptVersion: string;
  modelRoute: WriterSnapshotModelRoute;
  isolated: boolean;
  runId: string | null;
}

export interface WriterSnapshotSummary {
  id: bigint;
  chapter: number;
  draftRevision: number;
  attempt: number;
  role: Ai.WriterAttemptRole;
  promptKey: string;
  promptVersion: string;
  modelRoute: WriterSnapshotModelRoute;
  isolated: boolean;
  createdAt: Date;
}

export interface WriterSnapshotView extends WriterSnapshotSummary {
  contextPackId: bigint | null;
  messages: WriterSnapshotMessage[];
  keptBack: Record<string, unknown> | null;
  planRevision: number | null;
  bibleHash: string | null;
}

function serializeMessage(message: BaseMessage): WriterSnapshotMessage {
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
  return { role: message.getType(), content };
}

export function serializeMessages(messages: readonly BaseMessage[]): WriterSnapshotMessage[] {
  return messages.map(serializeMessage);
}

@Injectable()
export class WriterSnapshotService {
  private readonly logger = Logger.getLogger(APP_NAME, WriterSnapshotService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Builds a one-shot `onMessages` callback for a `TelemetryContext`: a ctx spread onto a follow-up call (draft
   * expansion, title) carries the same reference, so only the first invocation — the writer attempt's own call — is kept.
   */
  onMessages(meta: Omit<WriterSnapshotMeta, 'modelRoute'>): (messages: readonly BaseMessage[], modelRoute: WriterSnapshotModelRoute) => void {
    let captured = false;
    return (messages, modelRoute) => {
      if (captured) return;
      captured = true;
      this.capture({ ...meta, modelRoute }, serializeMessages(messages));
    };
  }

  /** Fire-and-forget: a snapshot write must never fail the generation it is capturing. */
  capture(meta: WriterSnapshotMeta, messages: WriterSnapshotMessage[]): void {
    this.persist(meta, messages).catch(err => {
      this.logger.error('writer snapshot capture failed — the attempt is not recorded', {
        err,
        projectId: meta.projectId.toString(),
        chapter: meta.chapter,
        role: meta.role,
        attempt: meta.attempt,
        draftRevision: meta.draftRevision,
      });
    });
  }

  private async persist(meta: WriterSnapshotMeta, messages: WriterSnapshotMessage[]): Promise<void> {
    await this.db.insert(schema.writerSnapshots).values({
      projectId: meta.projectId,
      chapter: meta.chapter,
      draftRevision: meta.draftRevision,
      attempt: meta.attempt,
      role: meta.role,
      contextPackId: meta.contextPackId,
      messages,
      keptBack: meta.keptBack,
      planRevision: meta.planRevision,
      bibleHash: meta.bibleHash,
      promptKey: meta.promptKey,
      promptVersion: meta.promptVersion,
      modelRoute: meta.modelRoute,
      isolated: meta.isolated,
      runId: meta.runId,
    });
    await this.pruneOldRevisions(meta.projectId, meta.chapter, meta.draftRevision);
  }

  /** Keeps every attempt of the current draft revision plus its `RETAINED_PRIOR_REVISIONS` predecessors; never runs from finalize or approve. */
  private async pruneOldRevisions(projectId: bigint, chapter: number, draftRevision: number): Promise<void> {
    const keepFrom = draftRevision - RETAINED_PRIOR_REVISIONS;
    if (keepFrom <= 0) return;
    await this.db
      .delete(schema.writerSnapshots)
      .where(and(eq(schema.writerSnapshots.projectId, projectId), eq(schema.writerSnapshots.chapter, chapter), lt(schema.writerSnapshots.draftRevision, keepFrom)));
  }

  async list(projectId: bigint, chapter: number): Promise<WriterSnapshotSummary[]> {
    const rows = await this.db.query.writerSnapshots.findMany({
      where: and(eq(schema.writerSnapshots.projectId, projectId), eq(schema.writerSnapshots.chapter, chapter)),
      columns: {
        id: true,
        chapter: true,
        draftRevision: true,
        attempt: true,
        role: true,
        promptKey: true,
        promptVersion: true,
        modelRoute: true,
        isolated: true,
        createdAt: true,
      },
      orderBy: [desc(schema.writerSnapshots.draftRevision), desc(schema.writerSnapshots.attempt)],
    });
    return rows.map(row => ({ ...row, modelRoute: row.modelRoute as WriterSnapshotModelRoute }));
  }

  /** The Writer's view of one attempt — a standard read: an isolated chapter's messages are walled off, never regenerated from today's state. */
  async get(projectId: bigint, chapter: number, id: bigint): Promise<WriterSnapshotView> {
    const row = await this.db.query.writerSnapshots.findFirst({
      where: and(eq(schema.writerSnapshots.projectId, projectId), eq(schema.writerSnapshots.chapter, chapter), eq(schema.writerSnapshots.id, id)),
    });
    if (!row) throw AppErrorCode.WSN_001.create();
    const walledOff = row.isolated || (await findCurrentIsolation(this.db, projectId, chapter));
    return {
      id: row.id,
      chapter: row.chapter,
      draftRevision: row.draftRevision,
      attempt: row.attempt,
      role: row.role,
      contextPackId: row.contextPackId,
      messages: walledOff ? WALLED_OFF_WRITERS_VIEW : (row.messages as WriterSnapshotMessage[]),
      keptBack: row.keptBack as Record<string, unknown> | null,
      planRevision: row.planRevision,
      bibleHash: walledOff ? null : row.bibleHash,
      promptKey: row.promptKey,
      promptVersion: row.promptVersion,
      modelRoute: row.modelRoute as WriterSnapshotModelRoute,
      isolated: walledOff,
      createdAt: row.createdAt,
    };
  }
}
