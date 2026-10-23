import { and, asc, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type PrimaryTransaction, type Project, type Refinement, schema } from '@server/database';

import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { NovelForgeCatalogService } from '../ai/novel-forge-catalog.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { type ChatTitleOutput } from '../ai/schemas';
import { SYNAPSE_PROVIDER } from '../ai/synapse-request';
import { ProjectEventService } from '../events/project-event.service';
import { type ChatSelection, chatSelection, loadTurnSelections } from './chat-selection';

export interface CreateSessionInput {
  mode?: Refinement.ChatMode;
}

/** `null` clears a field back to the project default; an omitted one is left alone. */
export interface SessionModelUpdate {
  provider?: string | null;
  model?: string | null;
  contentMode?: Project.ContentMode | null;
  costTier?: Project.CostTier | null;
}

interface SessionPin {
  provider: string | null;
  model: string | null;
}

/** The selection is absent on user messages and on turns older than selections. */
export type ChatMessageView = Omit<Refinement.ChatMessage, 'exchange'> & Partial<ChatSelection>;

interface SessionListFilter {
  scopeType?: Refinement.ChatScope;
  status?: Refinement.ChatSessionStatus;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: string;
}

// An opener this short ("fix this") never earns an auto-title — it would name nothing worth keeping.
const CHAT_TITLE_MIN_CONTENT_LENGTH = 15;
const CHAT_TITLE_GRAPH = 'chat-title';

@Injectable()
export class ChatSessionService {
  private readonly logger = Logger.getLogger(APP_NAME, ChatSessionService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly events: ProjectEventService,
    private readonly catalog?: NovelForgeCatalogService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async createSession(projectId: bigint, input: CreateSessionInput, tx?: PrimaryTransaction): Promise<Refinement.ChatSession> {
    const [session] = await (tx ?? this.db)
      .insert(schema.chatSessions)
      .values({ projectId, scopeType: 'project', scopeRef: null, title: null, mode: input.mode ?? 'auto' })
      .returning();
    if (!session) throw AppErrorCode.CHT_001.create();
    // Logged only outside a caller's transaction: inside one, the row isn't committed yet, and the caller logs once it is.
    if (!tx) this.logger.info('chat session created', { projectId, sessionId: session.id, mode: session.mode });
    return session;
  }

  async updateSession(projectId: bigint, sessionId: string, update: { mode?: Refinement.ChatMode; title?: string }): Promise<Refinement.ChatSession> {
    const session = await this.getSession(projectId, sessionId);
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (update.mode !== undefined) set['mode'] = update.mode;
    if (update.title !== undefined) set['title'] = update.title;
    const [updated] = await this.db.update(schema.chatSessions).set(set).where(eq(schema.chatSessions.id, session.id)).returning();
    if (!updated) throw AppErrorCode.CHT_001.create();
    return updated;
  }

  async listSessions(projectId: bigint, filter: SessionListFilter): Promise<OffsetPaginationResult<Refinement.ChatSession>> {
    const query = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' } });

    const conditions = [eq(schema.chatSessions.projectId, projectId)];
    if (filter.scopeType) conditions.push(eq(schema.chatSessions.scopeType, filter.scopeType));
    if (filter.status) conditions.push(eq(schema.chatSessions.status, filter.status));
    const where = and(...conditions);

    const column = query.sortBy === 'createdAt' ? schema.chatSessions.createdAt : schema.chatSessions.updatedAt;
    const order = query.sortOrder === 'asc' ? asc(column) : desc(column);

    const [total, items] = await Promise.all([
      this.db.$count(schema.chatSessions, where),
      this.db.query.chatSessions.findMany({ where, limit: query.limit, offset: query.offset, orderBy: order }),
    ]);
    return utils.pagination.createResult(query, items, total);
  }

  async getSession(projectId: bigint, sessionId: string): Promise<Refinement.ChatSession> {
    const session = await this.db.query.chatSessions.findFirst({ where: and(eq(schema.chatSessions.projectId, projectId), eq(schema.chatSessions.id, sessionId)) });
    if (!session) throw AppErrorCode.CHT_001.create();
    return session;
  }

  async setSessionStatus(projectId: bigint, sessionId: string, status: Refinement.ChatSessionStatus): Promise<Refinement.ChatSession> {
    const session = await this.getSession(projectId, sessionId);
    const [updated] = await this.db.update(schema.chatSessions).set({ status, updatedAt: new Date() }).where(eq(schema.chatSessions.id, session.id)).returning();
    if (!updated) throw AppErrorCode.CHT_001.create();
    return updated;
  }

  /** Deletes a chat and its whole history (messages cascade); staged proposals survive with the session detached. */
  async deleteSession(projectId: bigint, sessionId: string): Promise<Refinement.ChatSession> {
    const session = await this.getSession(projectId, sessionId);
    await this.db.delete(schema.chatSessions).where(eq(schema.chatSessions.id, session.id));
    return session;
  }

  async updateSessionModel(projectId: bigint, sessionId: string, update: SessionModelUpdate): Promise<Refinement.ChatSession> {
    const session = await this.getSession(projectId, sessionId);
    const set: Partial<typeof schema.chatSessions.$inferInsert> = { updatedAt: new Date() };
    if (update.contentMode !== undefined) set.contentMode = update.contentMode;
    if (update.costTier !== undefined) set.costTier = update.costTier;
    if (update.provider !== undefined || update.model !== undefined) {
      const pin = { provider: update.provider ?? null, model: update.model ?? null };
      // The registry slug columns are cleared on every pin change, so the alias backfill cannot bring an old slug back.
      const aliasKey = pin.provider === null && pin.model === null ? null : await this.offeredAlias(projectId, { ...session, ...set }, pin);
      Object.assign(set, { modelProvider: null, modelId: null, aliasKey });
    }
    const [updated] = await this.db.update(schema.chatSessions).set(set).where(eq(schema.chatSessions.id, session.id)).returning();
    if (!updated) throw AppErrorCode.CHT_001.create();
    return updated;
  }

  /** An alias pin must be one the catalog offers this chat's chat task under the model type and cost tier the chat will have after this update. */
  private async offeredAlias(projectId: bigint, session: Pick<Refinement.ChatSession, 'contentMode' | 'costTier'>, pin: SessionPin): Promise<string> {
    if (pin.provider !== SYNAPSE_PROVIDER || !pin.model) throw AppErrorCode.AI_002.create();
    if (!this.catalog) throw AppErrorCode.AI_007.create({ transient: true });
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { contentMode: true, costTier: true } });
    return (await this.catalog.requireChatAlias(pin.model, chatSelection({}, session, project))).key;
  }

  async listMessages(projectId: bigint, sessionId: string, opts: { before?: number; limit?: number }): Promise<ChatMessageView[]> {
    await this.getSession(projectId, sessionId);
    const conditions = [eq(schema.chatMessages.sessionId, sessionId)];
    if (opts.before !== undefined) conditions.push(lt(schema.chatMessages.ordinal, opts.before));
    const rows = await this.db.query.chatMessages.findMany({
      columns: { exchange: false },
      where: and(...conditions),
      orderBy: desc(schema.chatMessages.ordinal),
      limit: opts.limit ?? 50,
    });
    const runIds = [...new Set(rows.flatMap(row => (row.role === 'assistant' && row.runId ? [row.runId] : [])))];
    const selections = await loadTurnSelections(this.db, runIds);
    return rows.reverse().map(row => (row.role === 'assistant' && row.runId ? { ...row, ...selections.get(row.runId) } : row));
  }

  async latestOrdinal(sessionId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number | null>`max(${schema.chatMessages.ordinal})` })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.sessionId, sessionId));
    return row?.max ?? 0;
  }

  /** Names a session from its opening message alone. */
  nameSession(projectId: bigint, session: Refinement.ChatSession, content: string, project: ProjectConfig | undefined, turnRunId: string): void {
    if (session.title !== null) return;
    const message = content.trim();
    if (message.length < CHAT_TITLE_MIN_CONTENT_LENGTH) return;
    this.runNameSession(projectId, session.id, message, project, turnRunId).catch(err => this.logger.warn('chat session naming failed', { projectId, sessionId: session.id, err }));
  }

  private async runNameSession(projectId: bigint, sessionId: string, message: string, project: ProjectConfig | undefined, turnRunId: string): Promise<void> {
    const prompt = PROMPT_REGISTRY['chat-title'];
    const { result: named } = await this.workflowRunService.runChain(
      projectId,
      CHAT_TITLE_GRAPH,
      `session:${sessionId}`,
      { message },
      async runId => {
        const ctx = { projectId, runId, node: CHAT_TITLE_GRAPH, promptKey: prompt.key, promptVersion: prompt.version, role: 'title' };
        const output = (await this.modelRouter.structured(prompt, { message }, ctx, project)) as ChatTitleOutput;
        const title = output.title.trim();
        if (!title) return false;

        // Guarded in the query, not read-then-write: a rename the author makes mid-turn must never be clobbered.
        const [written] = await this.db
          .update(schema.chatSessions)
          .set({ title, updatedAt: new Date() })
          .where(and(eq(schema.chatSessions.id, sessionId), isNull(schema.chatSessions.title)))
          .returning({ id: schema.chatSessions.id });
        return Boolean(written);
      },
      undefined,
      turnRunId,
    );
    if (named) this.events.publish(projectId, { type: 'chat', sessionId });
  }
}
