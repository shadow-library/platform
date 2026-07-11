/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPaginationResult, utils } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { z } from 'zod';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { type ChangeOp } from './change-set';
import { type ApplyResult, ProposalApplyService } from './proposal-apply.service';
import { ProposalService } from './proposal.service';
import { CHAT_HISTORY_BUDGET, ContextAssembler } from '../ai/context/context-assembler.service';
import { countTokens } from '../ai/context/token-budget';
import { type AiRole, type ResolvedModel } from '../ai/defaults';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY, buildChatRefinePrompt, renderScopeInstructions, scopeAllowedOps } from '../ai/prompts';
import { RetrievalService } from '../ai/retrieval';
import { type ChatCompactOutput, type ChatRefineOutput } from '../ai/schemas';
import { type ToolContext, ToolRegistryService } from '../ai/tools';

/**
 * Defining types
 */

export interface CreateSessionInput {
  scopeType: Refinement.ChatScope;
  scopeRef?: string;
  title?: string;
  mode?: Refinement.ChatMode;
}

export interface ChatTurnResult {
  userMessage: Refinement.ChatMessage;
  assistantMessage: Refinement.ChatMessage;
  proposal: Refinement.Proposal | null;
  applied?: Pick<ApplyResult, 'applied' | 'staleMarked' | 'opResults'>;
  applyNote?: string;
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

// Declared-lookup budget for a hub turn (chat-hub design §6 step 4): at most this many lookup rounds
// execute before the model is told to answer with what it has.
const MAX_LOOKUP_ROUNDS = 3;
const CHAT_HUB_NODE = 'chat-hub';

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
    private readonly proposalApplyService: ProposalApplyService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly retrievalService: RetrievalService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async createSession(projectId: bigint, input: CreateSessionInput): Promise<Refinement.ChatSession> {
    const scopeRef = await this.validateScopeRef(projectId, input.scopeType, input.scopeRef ?? null);
    const [session] = await this.db
      .insert(schema.chatSessions)
      .values({ projectId, scopeType: input.scopeType, scopeRef, title: input.title, mode: input.mode ?? 'manual' })
      .returning();
    if (!session) throw new ServerError(AppErrorCode.CHT_001);
    return session;
  }

  /** Updates the session's mode and/or title — the mode switch is the manual ⇄ auto toggle (chat-hub design §6.2). */
  async updateSession(projectId: bigint, sessionId: string, update: { mode?: Refinement.ChatMode; title?: string }): Promise<Refinement.ChatSession> {
    const session = await this.getSession(projectId, sessionId);
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (update.mode !== undefined) set['mode'] = update.mode;
    if (update.title !== undefined) set['title'] = update.title;
    const [updated] = await this.db.update(schema.chatSessions).set(set).where(eq(schema.chatSessions.id, session.id)).returning();
    if (!updated) throw new ServerError(AppErrorCode.CHT_001);
    return updated;
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
    const isHub = session.scopeType === 'project';
    const scopeInstructions = isHub ? `${renderScopeInstructions(session.scopeType)}\n\n${this.renderLookupVocabulary()}` : renderScopeInstructions(session.scopeType);

    // Resolve which model this turn runs on, then inject it as the `config.models.chat` override the
    // router already reads — the turn keeps the `chat` role for prompts/telemetry either way.
    const resolvedModel = this.resolveSessionModel(session, project as ProjectConfig | undefined);
    const baseConfig = (project?.config as { models?: Record<string, unknown> } | null) ?? {};
    const effectiveProject = { ...project, config: { ...baseConfig, models: { ...(baseConfig.models ?? {}), chat: resolvedModel } } } as typeof project;
    const { runId, result } = await this.workflowRunService.runChain(projectId, 'chat-turn', `session:${sessionId}`, { content }, async runId => {
      const ctx = { projectId, runId, node: 'chat-turn', promptKey: prompt.key, promptVersion: prompt.version, role: 'chat' };
      const turnHistory = [...history];
      const invoke = (): Promise<ChatRefineOutput> => {
        const input = { scopeInstructions, stableContext: pack.renderedStable, history: turnHistory, volatileContext: pack.renderedVolatile || 'nothing', userMessage: content };
        return this.modelRouter.structured(prompt, input, ctx, effectiveProject as ProjectConfig | undefined) as Promise<ChatRefineOutput>;
      };

      // Declared-lookup rounds (chat-hub design §6 step 4): execute the requested read-only tools,
      // fold the results into the conversation, and re-invoke — bounded, audited, hub-only.
      let output = await invoke();
      for (let round = 0; round < MAX_LOOKUP_ROUNDS && (output.lookups?.length ?? 0) > 0; round++) {
        const results = await this.executeLookups(projectId, runId, output.lookups ?? []);
        const exhausted = round === MAX_LOOKUP_ROUNDS - 1 ? '\n\nLookup budget exhausted — answer with what you have; do not request more lookups.' : '';
        turnHistory.push(new AIMessage(JSON.stringify({ reply: output.reply, lookups: output.lookups })), new HumanMessage(`Lookup results:\n${results}${exhausted}`));
        output = await invoke();
      }
      // A model that still asks for lookups after the budget note answers with its reply alone.
      if ((output.lookups?.length ?? 0) > 0) output = { reply: output.reply };

      return this.persistTurn(projectId, session, content, output, runId, resolvedModel);
    });

    // Auto mode lands the change-set in the same turn (rule 13: still through the proposal apply).
    if (session.mode === 'auto' && result.proposal) {
      const settled = await this.autoApply(projectId, result.proposal);
      return { ...result, ...settled, runId };
    }
    return { ...result, runId };
  }

  /** Applies an auto-mode turn's proposal immediately; failures downgrade to a pending proposal with a note, never a failed turn. */
  private async autoApply(projectId: bigint, proposal: Refinement.Proposal): Promise<Pick<ChatTurnResult, 'proposal' | 'applied' | 'applyNote'>> {
    try {
      const applied = await this.proposalApplyService.apply(projectId, proposal.id, { autoApplied: true });
      return { proposal: applied.proposal, applied: { applied: applied.applied, staleMarked: applied.staleMarked, opResults: applied.opResults } };
    } catch (err) {
      const fresh = await this.proposalService.get(projectId, proposal.id);
      const note = err instanceof ServerError ? err.getMessage() : err instanceof Error ? err.message : String(err);
      this.logger.warn(`auto-apply of proposal ${proposal.id} failed: ${note}`);
      return { proposal: fresh, applyNote: note };
    }
  }

  /** The lookup half of the hub playbook: names, argument shapes, and purposes of the read-only tools. */
  private renderLookupVocabulary(): string {
    const tools = this.toolRegistry.getRaw(CHAT_HUB_NODE);
    const lines = tools.map(tool => {
      const shape = tool.inputSchema instanceof z.ZodObject ? Object.keys(tool.inputSchema.shape).join(', ') : 'see description';
      return `- ${tool.name} (args: ${shape}) — ${tool.description}`;
    });
    return `Lookup tools available this scope (read-only):\n${lines.join('\n')}`;
  }

  /** Runs declared lookups through the registry handlers with the same audit and budgets as the tool loop. */
  private async executeLookups(projectId: bigint, runId: string, lookups: { tool: string; args?: Record<string, unknown> }[]): Promise<string> {
    const rawTools = this.toolRegistry.getRaw(CHAT_HUB_NODE);
    const ctx: ToolContext = { chapter: null, db: this.db, node: CHAT_HUB_NODE, projectId, retrieval: this.retrievalService, runId };
    const callCounts = new Map<string, number>();
    const blocks: string[] = [];

    for (const lookup of lookups) {
      const rawTool = rawTools.find(t => t.name === lookup.tool);
      const callCount = (callCounts.get(lookup.tool) ?? 0) + 1;
      callCounts.set(lookup.tool, callCount);
      const startedAt = Date.now();

      let resultStr: string;
      let auditStatus: 'budget_exceeded' | 'handler_error' | 'invalid_args' | 'ok';
      if (!rawTool) {
        resultStr = `error: unknown tool '${lookup.tool}'`;
        auditStatus = 'invalid_args';
      } else if (callCount > rawTool.maxCallsPerRun) {
        resultStr = `error: tool '${lookup.tool}' has exceeded its call budget for this turn`;
        auditStatus = 'budget_exceeded';
      } else {
        const parsed = rawTool.inputSchema.safeParse(lookup.args ?? {});
        if (!parsed.success) {
          resultStr = `error: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
          auditStatus = 'invalid_args';
        } else {
          try {
            const result = await rawTool.handler(parsed.data, ctx);
            resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            if (rawTool.tokensBudget > 0 && resultStr.length > rawTool.tokensBudget * 4) resultStr = resultStr.slice(0, rawTool.tokensBudget * 4) + '\n...[truncated]';
            auditStatus = 'ok';
          } catch (err) {
            this.logger.error('lookup handler error', { err, tool: lookup.tool });
            resultStr = 'error: lookup failed';
            auditStatus = 'handler_error';
          }
        }
      }

      const digest = createHash('sha256').update(resultStr).digest('hex').slice(0, 16);
      await this.db
        .insert(schema.toolCalls)
        .values({ args: lookup.args ?? {}, latencyMs: Date.now() - startedAt, node: CHAT_HUB_NODE, resultDigest: digest, runId, status: auditStatus, tool: lookup.tool })
        .catch(err => this.logger.error('failed to write lookup audit row', { err }));
      blocks.push(`### ${lookup.tool}\n${resultStr}`);
    }
    return blocks.join('\n\n');
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
        kind: session.scopeType === 'project' ? 'hub' : 'chat',
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
