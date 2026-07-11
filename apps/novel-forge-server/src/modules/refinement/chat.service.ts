/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPaginationResult, utils } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { type ChangeOp } from './change-set';
import { ProposalService } from './proposal.service';
import { CHAT_HISTORY_BUDGET, ContextAssembler } from '../ai/context/context-assembler.service';
import { countTokens } from '../ai/context/token-budget';
import { type AiRole, type ResolvedModel } from '../ai/defaults';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY, buildChatRefinePrompt, renderScopeInstructions, scopeAllowedOps } from '../ai/prompts';
import { type ChatCompactOutput, type ChatRefineOutput } from '../ai/schemas';

/**
 * Defining types
 */

export interface CreateSessionInput {
  scopeType: Refinement.ChatScope;
  scopeRef?: string;
  title?: string;
}

export interface ChatTurnResult {
  userMessage: Refinement.ChatMessage;
  assistantMessage: Refinement.ChatMessage;
  proposal: Refinement.Proposal | null;
  runId: string;
}

interface SessionListFilter {
  scopeType?: Refinement.ChatScope;
  status?: Refinement.ChatSessionStatus;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: string;
}

/**
 * Declaring the constants
 */

// Compaction thresholds (design §5.4): fold history once the verbatim window outgrows its token
// budget or trails the watermark by more than MAX_VERBATIM_TURNS messages; the newest
// KEEP_VERBATIM_TURNS messages always stay verbatim.
const MAX_VERBATIM_TURNS = 12;
const KEEP_VERBATIM_TURNS = 6;

// Which planning discipline each chat scope belongs to. A chat scoped to an arc IS arc-planning
// work, so it defaults to the model the author configured for arc planning in the project settings —
// not to a one-size-fits-all chat model. See resolveSessionModel for the full resolution ladder.
export const SCOPE_CHAT_ROLE: Record<Refinement.ChatScope, AiRole> = {
  project: 'chat',
  novel: 'chat',
  volume_plan: 'plan',
  volume: 'plan',
  arc_plan: 'arc',
  arc: 'arc',
  brief: 'outline',
  bible_document: 'bible',
};

@Injectable()
export class ChatService {
  private readonly logger = Logger.getLogger(APP_NAME, ChatService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly contextAssembler: ContextAssembler,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly proposalService: ProposalService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async createSession(projectId: bigint, input: CreateSessionInput): Promise<Refinement.ChatSession> {
    const scopeRef = await this.validateScopeRef(projectId, input.scopeType, input.scopeRef ?? null);
    const [session] = await this.db.insert(schema.chatSessions).values({ projectId, scopeType: input.scopeType, scopeRef, title: input.title }).returning();
    if (!session) throw new ServerError(AppErrorCode.CHT_001);
    return session;
  }

  /** Resolves and verifies the scope target; the ref grammar is the artifact-ref grammar of the proposals. */
  private async validateScopeRef(projectId: bigint, scopeType: Refinement.ChatScope, scopeRef: string | null): Promise<string | null> {
    const value = scopeRef?.includes(':') ? (scopeRef.split(':')[1] ?? '') : '';
    switch (scopeType) {
      case 'project':
      case 'novel':
      case 'volume_plan':
        return null;
      case 'bible_document': {
        const [section = '', ...rest] = value.split('/');
        const doc =
          scopeRef?.startsWith('doc:') &&
          (await this.db.query.bibleDocuments.findFirst({
            where: and(
              eq(schema.bibleDocuments.projectId, projectId),
              eq(schema.bibleDocuments.section, section as schema.Bible.Section),
              eq(schema.bibleDocuments.slug, rest.join('/')),
            ),
          }));
        if (!doc) throw new ServerError(AppErrorCode.CHT_003);
        return scopeRef as string;
      }
      case 'volume':
      case 'arc_plan': {
        const volume =
          scopeRef?.startsWith('volume:') && (await this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, value)) }));
        if (!volume) throw new ServerError(AppErrorCode.CHT_003);
        return scopeRef as string;
      }
      case 'arc': {
        const arc = scopeRef?.startsWith('arc:') && (await this.db.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.arcKey, value)) }));
        if (!arc) throw new ServerError(AppErrorCode.CHT_003);
        return scopeRef as string;
      }
      case 'brief': {
        const chapter = parseInt(value, 10);
        const brief =
          scopeRef?.startsWith('chapter:') &&
          Number.isInteger(chapter) &&
          (await this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }));
        if (!brief) throw new ServerError(AppErrorCode.CHT_003);
        return scopeRef as string;
      }
    }
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
    if (!session) throw new ServerError(AppErrorCode.CHT_001);
    return session;
  }

  async setSessionStatus(projectId: bigint, sessionId: string, status: Refinement.ChatSessionStatus): Promise<Refinement.ChatSession> {
    const session = await this.getSession(projectId, sessionId);
    const [updated] = await this.db.update(schema.chatSessions).set({ status, updatedAt: new Date() }).where(eq(schema.chatSessions.id, session.id)).returning();
    if (!updated) throw new ServerError(AppErrorCode.CHT_001);
    return updated;
  }

  /** Deletes a chat and its whole history (messages cascade); staged proposals survive with the session detached. */
  async deleteSession(projectId: bigint, sessionId: string): Promise<Refinement.ChatSession> {
    const session = await this.getSession(projectId, sessionId);
    await this.db.delete(schema.chatSessions).where(eq(schema.chatSessions.id, session.id));
    return session;
  }

  /** Sets (or clears, with nulls) the per-session model override used for every turn in this chat. */
  async updateSessionModel(projectId: bigint, sessionId: string, provider: string | null, model: string | null): Promise<Refinement.ChatSession> {
    const session = await this.getSession(projectId, sessionId);
    const [updated] = await this.db
      .update(schema.chatSessions)
      .set({ modelProvider: provider, modelId: model, updatedAt: new Date() })
      .where(eq(schema.chatSessions.id, session.id))
      .returning();
    if (!updated) throw new ServerError(AppErrorCode.CHT_001);
    return updated;
  }

  async listMessages(projectId: bigint, sessionId: string, opts: { before?: number; limit?: number }): Promise<Refinement.ChatMessage[]> {
    await this.getSession(projectId, sessionId);
    const conditions = [eq(schema.chatMessages.sessionId, sessionId)];
    if (opts.before !== undefined) conditions.push(lt(schema.chatMessages.ordinal, opts.before));
    const rows = await this.db.query.chatMessages.findMany({ where: and(...conditions), orderBy: desc(schema.chatMessages.ordinal), limit: opts.limit ?? 50 });
    return rows.reverse();
  }

  /**
   * One chat turn (design §5.1): guard, compact if needed, assemble the scoped pack, one structured
   * call through the repair ladder, then persist the exchange and stage any proposed change-set —
   * all correlated under a fresh workflow run (Appendix A rules 9/11/12/13).
   */
  async turn(projectId: bigint, sessionId: string, content: string): Promise<ChatTurnResult> {
    const session = await this.getSession(projectId, sessionId);
    if (session.status !== 'active') throw new ServerError(AppErrorCode.CHT_002);
    await this.validateScopeRef(projectId, session.scopeType, session.scopeRef);

    await this.compactIfNeeded(projectId, session);

    const [pack, history, project] = await Promise.all([
      this.contextAssembler.forChatTurn(projectId, session),
      this.buildHistory(session),
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);

    const prompt = buildChatRefinePrompt(session.scopeType);
    const input = {
      scopeInstructions: renderScopeInstructions(session.scopeType),
      stableContext: pack.renderedStable,
      history,
      volatileContext: pack.renderedVolatile || 'nothing',
      userMessage: content,
    };

    // Resolve which model this turn runs on, then inject it as the `config.models.chat` override the
    // router already reads — the turn keeps the `chat` role for prompts/telemetry either way.
    const resolvedModel = this.resolveSessionModel(session, project as ProjectConfig | undefined);
    const baseConfig = (project?.config as { models?: Record<string, unknown> } | null) ?? {};
    const effectiveProject = { ...project, config: { ...baseConfig, models: { ...(baseConfig.models ?? {}), chat: resolvedModel } } } as typeof project;
    const { runId, result } = await this.workflowRunService.runChain(projectId, 'chat-turn', `session:${sessionId}`, { content }, async runId => {
      const ctx = { projectId, runId, node: 'chat-turn', promptKey: prompt.key, promptVersion: prompt.version, role: 'chat' };
      const output = (await this.modelRouter.structured(prompt, input, ctx, effectiveProject as ProjectConfig | undefined)) as ChatRefineOutput;
      return this.persistTurn(projectId, session, content, output, runId, resolvedModel);
    });

    return { ...result, runId };
  }

  /**
   * The chat model resolution ladder, most specific first:
   *  1. the chat's own override (the author picked a model for this conversation),
   *  2. otherwise the model routed for the scope's role — the router folds in the project's group
   *     selection and the chat → planning default (arc chat → the planning model, and so on).
   */
  private resolveSessionModel(session: Refinement.ChatSession, project?: ProjectConfig): ResolvedModel {
    if (session.modelProvider && session.modelId) return { provider: session.modelProvider, model: session.modelId };
    return this.modelRouter.resolveModel(SCOPE_CHAT_ROLE[session.scopeType], project);
  }

  private async persistTurn(
    projectId: bigint,
    session: Refinement.ChatSession,
    content: string,
    output: ChatRefineOutput,
    runId: string,
    model: { provider: string; model: string },
  ): Promise<Omit<ChatTurnResult, 'runId'>> {
    const lastOrdinal = await this.latestOrdinal(session.id);

    const [userMessage] = await this.db
      .insert(schema.chatMessages)
      .values({ sessionId: session.id, projectId, ordinal: lastOrdinal + 1, role: 'user', content, runId, tokens: countTokens(content) })
      .returning();
    const [assistantMessage] = await this.db
      .insert(schema.chatMessages)
      .values({
        sessionId: session.id,
        projectId,
        ordinal: lastOrdinal + 2,
        role: 'assistant',
        content: output.reply,
        runId,
        modelProvider: model.provider,
        modelId: model.model,
        tokens: countTokens(output.reply),
      })
      .returning();
    if (!userMessage || !assistantMessage) throw new ServerError(AppErrorCode.CHT_001);

    let proposal: Refinement.Proposal | null = null;
    if (output.changeSet && output.changeSet.length > 0) {
      proposal = await this.proposalService.create(projectId, {
        sessionId: session.id,
        messageId: assistantMessage.id,
        scopeType: session.scopeType,
        scopeRef: session.scopeRef,
        kind: 'chat',
        summary: output.reply.split('\n', 1)[0]?.slice(0, 300),
        changeSet: output.changeSet as unknown as ChangeOp[],
        allowedOps: scopeAllowedOps(session.scopeType),
        runId,
      });
      await this.db.update(schema.chatMessages).set({ proposalId: proposal.id }).where(eq(schema.chatMessages.id, assistantMessage.id));
      assistantMessage.proposalId = proposal.id;
    }

    await this.db.update(schema.chatSessions).set({ lastTurnAt: new Date(), updatedAt: new Date() }).where(eq(schema.chatSessions.id, session.id));
    return { userMessage, assistantMessage, proposal };
  }

  private async latestOrdinal(sessionId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number | null>`max(${schema.chatMessages.ordinal})` })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.sessionId, sessionId));
    return row?.max ?? 0;
  }

  /** Summary + post-watermark verbatim turns as real prompt messages (design §10.2). */
  private async buildHistory(session: Refinement.ChatSession): Promise<BaseMessage[]> {
    const verbatim = await this.db.query.chatMessages.findMany({
      where: and(eq(schema.chatMessages.sessionId, session.id), gt(schema.chatMessages.ordinal, session.summaryThroughOrdinal)),
      orderBy: asc(schema.chatMessages.ordinal),
    });

    const history: BaseMessage[] = [];
    if (session.summary) history.push(new HumanMessage(`Conversation so far (compacted summary):\n${session.summary}`));
    for (const message of verbatim) history.push(message.role === 'assistant' ? new AIMessage(message.content) : new HumanMessage(message.content));
    return history;
  }

  /**
   * Folds everything up to the newest KEEP_VERBATIM_TURNS messages into the rolling summary once the
   * verbatim window exceeds its token budget or MAX_VERBATIM_TURNS. Messages are never deleted — the
   * watermark is a read-time window over the intact transcript.
   */
  private async compactIfNeeded(projectId: bigint, session: Refinement.ChatSession): Promise<void> {
    const verbatim = await this.db.query.chatMessages.findMany({
      where: and(eq(schema.chatMessages.sessionId, session.id), gt(schema.chatMessages.ordinal, session.summaryThroughOrdinal)),
      orderBy: asc(schema.chatMessages.ordinal),
    });
    if (verbatim.length <= KEEP_VERBATIM_TURNS) return;

    const totalTokens = verbatim.reduce((sum, m) => sum + (m.tokens ?? countTokens(m.content)), 0);
    if (totalTokens <= CHAT_HISTORY_BUDGET && verbatim.length <= MAX_VERBATIM_TURNS) return;

    const toFold = verbatim.slice(0, verbatim.length - KEEP_VERBATIM_TURNS);
    const watermark = toFold[toFold.length - 1]?.ordinal ?? session.summaryThroughOrdinal;
    const transcript = toFold.map(m => `${m.role}: ${m.content}`).join('\n\n');

    const prompt = PROMPT_REGISTRY['chat-compact'];
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const { result: summary } = await this.workflowRunService.runChain(projectId, 'chat-compact', `session:${session.id}`, { watermark }, async runId => {
      const ctx = { projectId, runId, node: 'chat-compact', promptKey: prompt.key, promptVersion: prompt.version, role: 'compact' };
      const output = (await this.modelRouter.structured(
        prompt,
        { priorSummary: session.summary ?? 'none', transcript },
        ctx,
        project as ProjectConfig | undefined,
      )) as ChatCompactOutput;
      return output.summary;
    });

    await this.db.update(schema.chatSessions).set({ summary, summaryThroughOrdinal: watermark, updatedAt: new Date() }).where(eq(schema.chatSessions.id, session.id));
    session.summary = summary;
    session.summaryThroughOrdinal = watermark;
    this.logger.debug(`compacted session ${session.id} through ordinal ${watermark}`);
  }
}
