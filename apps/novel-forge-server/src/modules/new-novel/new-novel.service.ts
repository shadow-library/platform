import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { computeProgress, nextWritableChapter, PROGRESS_ITEM_KEYS, PROGRESS_TOPIC_PREFIX, progressFieldsFrom, progressOverridesFrom } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { LedgerService } from '../ledger/ledger.service';
import { NotesStoreService } from '../notes/notes-store.service';
import { ProjectService } from '../project';
import { ChatService } from '../refinement/chat.service';
import {
  type CreateNovelWithNotesBody,
  type CreateNovelWithNotesResponse,
  type NotesResponse,
  type ProgressOverrideBody,
  type ProgressResponse,
  type UpdateNotesBody,
} from './new-novel.dto';

function assertProgressKey(key: string): void {
  if (!PROGRESS_ITEM_KEYS.includes(key)) throw AppErrorCode.PRJ_013.create({ key });
}

@Injectable()
export class NewNovelService {
  private readonly logger = Logger.getLogger(APP_NAME, NewNovelService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly projectService: ProjectService,
    private readonly ledger: LedgerService,
    private readonly notes: NotesStoreService,
    private readonly chat: ChatService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async createWithNotes(body: CreateNovelWithNotesBody): Promise<CreateNovelWithNotesResponse> {
    const title = body.title.trim();
    if (!title) throw AppErrorCode.PRJ_014.create();

    const result = await this.db.transaction(async tx => {
      const project = await this.projectService.create({ name: title, kind: 'new_novel', title, contentMode: body.contentMode, costTier: body.costTier }, tx);
      await this.notes.replace(project.id, body.notes ?? '', tx);
      const session = await this.chat.createSession(project.id, {}, tx);
      return { projectId: project.id, sessionId: session.id };
    });
    this.logger.info('new novel created', { projectId: result.projectId, sessionId: result.sessionId });
    return result;
  }

  getNotes(projectId: bigint): Promise<NotesResponse> {
    return this.notes.read(projectId).then(record => ({ notes: record.text, entryId: record.entryId, updatedAt: record.updatedAt }));
  }

  updateNotes(projectId: bigint, body: UpdateNotesBody): Promise<void> {
    return this.notes.replace(projectId, body.notes);
  }

  async progress(projectId: bigint): Promise<ProgressResponse> {
    const project = await this.projectService.getOrThrow(projectId);
    const [volumes, nextChapter, overrideEntries] = await Promise.all([
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: schema.volumes.ordinal, columns: { objective: true } }),
      nextWritableChapter(this.db, projectId),
      this.ledger.listActive(projectId, { topics: [`${PROGRESS_TOPIC_PREFIX}*`] }),
    ]);
    const nextBrief = await this.db.query.briefs.findFirst({
      where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, nextChapter)),
      columns: { staleReason: true },
    });
    const overrides = progressOverridesFrom(overrideEntries);
    const fields = progressFieldsFrom(project, volumes, { chapter: nextChapter, brief: nextBrief ?? undefined });
    return { items: computeProgress(fields, overrides) };
  }

  async setProgressOverride(projectId: bigint, key: string, body: ProgressOverrideBody): Promise<ProgressResponse> {
    assertProgressKey(key);
    const topic = `${PROGRESS_TOPIC_PREFIX}${key}`;
    const statement = body.status === 'undecided' ? 'Marked undecided for now.' : 'Dismissed from the checklist.';
    const [current] = await this.ledger.listActive(projectId, { topics: [topic] });
    if (current) await this.ledger.supersede(projectId, current.id, { kind: 'system', statement, decidedBy: 'system', payload: { status: body.status } });
    else await this.ledger.append(projectId, [{ kind: 'system', topic, statement, decidedBy: 'system', payload: { status: body.status } }]);
    return this.progress(projectId);
  }

  async clearProgressOverride(projectId: bigint, key: string): Promise<ProgressResponse> {
    assertProgressKey(key);
    const topic = `${PROGRESS_TOPIC_PREFIX}${key}`;
    const current = await this.ledger.listActive(projectId, { topics: [topic] });
    await Promise.all(current.map(entry => this.ledger.withdraw(projectId, entry.id, 'the author cleared the checklist override')));
    return this.progress(projectId);
  }
}
