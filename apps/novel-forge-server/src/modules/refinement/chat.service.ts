import { createHash } from 'node:crypto';

import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { CHAT_HISTORY_BUDGET, ContextAssembler } from '../ai/context/context-assembler.service';
import { countTokens } from '../ai/context/token-budget';
import { type AiRole, isRegisteredModel, isUnrestrictedAllowed, type ResolvedModel } from '../ai/defaults';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig, type ReplyStreamHandlers } from '../ai/model-router.service';
import { buildChatRefinePrompt, HUB_ALLOWED_OPS, HUB_INSTRUCTIONS, PROMPT_REGISTRY, renderTurnRules } from '../ai/prompts';
import { RetrievalService } from '../ai/retrieval';
import { type ChatRefineOutput, type ChatTitleOutput } from '../ai/schemas';
import { type ToolContext, ToolRegistryService } from '../ai/tools';
import { ProjectEventService } from '../events/project-event.service';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import { type ChangeOp } from './change-set';
import { ChatCompactionService } from './chat-compaction.service';
import { requestedNegations } from './negation-echo';
import { type ApplyResult, declinedOpNote, ProposalApplyService } from './proposal-apply.service';
import { ProposalService } from './proposal.service';
import { findNegationEchoWarnings } from './proposal-warnings';
import { PROSE_EDIT_WITHHELD_NOTE, withoutProseEditOps } from './prose-intent';

export interface ChatTurnOptions {
  /** The author's explicit per-turn permission to rewrite chapter prose; without it a prose op is withheld. */
  proseEdits?: boolean;
}

export interface CreateSessionInput {
  mode?: Refinement.ChatMode;
}

export interface PendingTurn {
  runId: string;
  graph: string;
  startedAt: Date;
}

export interface FailedTurn {
  runId: string;
  graph: string;
  /** `cancelled` is the author stopping the turn deliberately — terminal, not a failure, and never retried automatically. */
  status: 'failed' | 'cancelled';
  endedAt: Date;
  code: string | null;
  message: string | null;
}

export interface ChatTurnStatus {
  pendingTurn: PendingTurn | null;
  failedTurn: FailedTurn | null;
  lastOrdinal: number;
}

export interface ChatTurnResult {
  userMessage: Refinement.ChatMessage;
  assistantMessage: Refinement.ChatMessage;
  proposal: Refinement.Proposal | null;
  applied?: Pick<ApplyResult, 'applied' | 'staleMarked' | 'opResults'>;
  applyNote?: string;
  runId: string;
}

export interface ChatLookupEvent {
  round: number;
  tool: string;
  args: Record<string, unknown>;
  status: 'running' | 'ok' | 'error';
}

/**
 * Progress a caller can observe while a turn runs. Its members are the four events the turn
 * itself produces — `ready`, `done` and `error` belong to the transport, which knows things the turn does
 * not — so the SSE route relays rather than translates.
 */
export interface ChatTurnEmitter {
  /** The run this turn was given, reported as soon as it exists — long before the turn settles. */
  onRunId: (runId: string) => void;
  onUserMessage: (message: Refinement.ChatMessage) => void;
  onLookup: (event: ChatLookupEvent) => void;
  onDelta: (text: string) => void;
  onReset: () => void;
}

/**
 * Failure-isolated view of the caller's emitter. The first throw — an SSE write to a browser that has
 * already gone — retires it and the turn runs on unobserved, because the turn persists its exchange
 * whether or not anyone is still listening.
 */
class EmitterRelay {
  private retired = false;
  private shown = false;
  private supersede = false;

  constructor(
    private readonly emitter: ChatTurnEmitter,
    private readonly onError: (err: unknown) => void,
  ) {}

  get streamHandlers(): ReplyStreamHandlers {
    return {
      onDelta: text => {
        if (this.supersede) this.reset();
        this.shown = true;
        this.send(() => this.emitter.onDelta(text));
      },
      onReset: () => this.reset(),
    };
  }

  runId(runId: string): void {
    this.send(() => this.emitter.onRunId(runId));
  }

  userMessage(message: Refinement.ChatMessage): void {
    this.send(() => this.emitter.onUserMessage(message));
  }

  lookup(event: ChatLookupEvent): void {
    this.send(() => this.emitter.onLookup(event));
  }

  /**
   * A lookup round re-invokes the model for a reply that replaces the one already displayed, but the
   * replacement is only worth a blank composer once its own text starts arriving: a round that streams
   * nothing would otherwise leave the author staring at nothing until the turn lands.
   */
  supersedeOnNextDelta(): void {
    this.supersede = this.shown;
  }

  private reset(): void {
    this.supersede = false;
    if (!this.shown) return;
    this.shown = false;
    this.send(() => this.emitter.onReset());
  }

  private send(emit: () => void): void {
    if (this.retired) return;
    try {
      emit();
    } catch (err) {
      this.retired = true;
      this.onError(err);
    }
  }
}

interface SessionListFilter {
  scopeType?: Refinement.ChatScope;
  status?: Refinement.ChatSessionStatus;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: string;
}

// Declared-lookup budget for a hub turn: at most this many lookup rounds
// execute before the model is told to answer with what it has.
const MAX_LOOKUP_ROUNDS = 3;
const CHAT_HUB_NODE = 'chat-hub';

const AUTO_APPLY_HELD_NOTE = 'Not applied automatically: review the warnings on this proposal first.';

function withheldProse(output: ChatRefineOutput, proseEdits: boolean): ChatRefineOutput {
  if (proseEdits || !output.changeSet?.length) return output;
  const { kept, withheld } = withoutProseEditOps(output.changeSet);
  if (withheld === 0) return output;
  return { reply: `${output.reply}\n\n${PROSE_EDIT_WITHHELD_NOTE}`, ...(kept.length > 0 ? { changeSet: kept } : {}) };
}

function negationFixRequest(warnings: string[]): string {
  return `Your changeSet removes things by stating their absence, which hands them straight back to the chapter writer:\n${warnings.map(w => `- ${w}`).join('\n')}\n\nRespond again with the same JSON shape and no lookups: rewrite each of those passages without the removed idea, and keep every other change. Keep any line that withholds knowledge or schedules a reveal ("does not yet learn", "no longer") — that is plot, not a removal.`;
}

// An opener this short ("fix this") never earns an auto-title — it would name nothing worth keeping.
const CHAT_TITLE_MIN_CONTENT_LENGTH = 15;
const CHAT_TITLE_GRAPH = 'chat-title';

// A chat-turn run older than this is treated as orphaned, never "in progress", so a crashed process
// can't leave a session's thinking indicator stuck on forever.
const PENDING_TURN_MAX_AGE_MS = 15 * 60 * 1000;
const TURN_GRAPHS = ['chat-turn'];

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
    private readonly compaction: ChatCompactionService,
    private readonly pluginPolicy: PluginPolicyService,
    private readonly events: ProjectEventService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async createSession(projectId: bigint, input: CreateSessionInput): Promise<Refinement.ChatSession> {
    const [session] = await this.db
      .insert(schema.chatSessions)
      .values({ projectId, scopeType: 'project', scopeRef: null, title: null, mode: input.mode ?? 'manual' })
      .returning();
    if (!session) throw AppErrorCode.CHT_001.create();
    this.logger.info('chat session created', { projectId, sessionId: session.id, mode: session.mode });
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
        if (!doc) throw AppErrorCode.CHT_003.create();
        return scopeRef as string;
      }
      case 'volume':
      case 'arc_plan': {
        const volume =
          scopeRef?.startsWith('volume:') && (await this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, value)) }));
        if (!volume) throw AppErrorCode.CHT_003.create();
        return scopeRef as string;
      }
      case 'arc': {
        const arc = scopeRef?.startsWith('arc:') && (await this.db.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.arcKey, value)) }));
        if (!arc) throw AppErrorCode.CHT_003.create();
        return scopeRef as string;
      }
      case 'brief': {
        const chapter = parseInt(value, 10);
        const brief =
          scopeRef?.startsWith('chapter:') &&
          Number.isInteger(chapter) &&
          (await this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }));
        if (!brief) throw AppErrorCode.CHT_003.create();
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

  async updateSessionModel(projectId: bigint, sessionId: string, provider: string | null, model: string | null): Promise<Refinement.ChatSession> {
    const session = await this.getSession(projectId, sessionId);
    // Clearing (both null) restores the project/profile default; a pin must name a registry model with
    // the matching provider, regardless of contentMode, so a raw pick never reaches the platform key.
    if (provider !== null || model !== null) {
      if (!provider || !model || !isRegisteredModel({ provider, model })) throw AppErrorCode.AI_002.create();
    }
    const [updated] = await this.db
      .update(schema.chatSessions)
      .set({ modelProvider: provider, modelId: model, updatedAt: new Date() })
      .where(eq(schema.chatSessions.id, session.id))
      .returning();
    if (!updated) throw AppErrorCode.CHT_001.create();
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
   * The turn currently running for this session — the recovery signal a refresh or a second tab uses to
   * show that Forge is working (the user message is already persisted, the reply is not yet). `graph`
   * and `startedAt` are what let the client name the phase and count the wait rather than showing a bare
   * spinner. Bounded by a generous cutoff so an orphaned run can never pin the indicator on.
   */
  async pendingTurn(projectId: bigint, sessionId: string): Promise<PendingTurn | null> {
    const cutoff = new Date(Date.now() - PENDING_TURN_MAX_AGE_MS);
    const row = await this.db.query.workflowRuns.findFirst({
      where: and(
        eq(schema.workflowRuns.projectId, projectId),
        inArray(schema.workflowRuns.graph, TURN_GRAPHS),
        eq(schema.workflowRuns.target, `session:${sessionId}`),
        eq(schema.workflowRuns.status, 'running'),
        gt(schema.workflowRuns.startedAt, cutoff),
      ),
      columns: { id: true, graph: true, startedAt: true },
      orderBy: desc(schema.workflowRuns.startedAt),
    });
    return row ? { runId: row.id, graph: row.graph, startedAt: row.startedAt } : null;
  }

  async turnStatus(projectId: bigint, sessionId: string): Promise<ChatTurnStatus> {
    await this.getSession(projectId, sessionId);
    const [pendingTurn, lastOrdinal] = await Promise.all([this.pendingTurn(projectId, sessionId), this.latestOrdinal(sessionId)]);
    // Only looked up once nothing is running: a live turn is the answer, and the previous failure it is
    // retrying would otherwise be reported alongside it.
    const failedTurn = pendingTurn ? null : await this.failedTurn(projectId, sessionId);
    return { pendingTurn, failedTurn, lastOrdinal };
  }

  async hasPendingTurn(projectId: bigint, sessionId: string): Promise<boolean> {
    return Boolean(await this.pendingTurn(projectId, sessionId));
  }

  /**
   * The turn that died or was stopped, for a session whose transcript ends on an unanswered user message.
   * Without this the transcript is a mystery on reload — a `cancelled` run is the author stopping the turn
   * deliberately (terminal, not a failure, never auto-retried) and must read as that, not as a generic
   * failure or a phantom pending state. Reported only while it is the last thing that happened — any
   * assistant message written after the run ended means the author has already moved past it.
   */
  async failedTurn(projectId: bigint, sessionId: string): Promise<FailedTurn | null> {
    const run = await this.db.query.workflowRuns.findFirst({
      where: and(
        eq(schema.workflowRuns.projectId, projectId),
        inArray(schema.workflowRuns.graph, TURN_GRAPHS),
        eq(schema.workflowRuns.target, `session:${sessionId}`),
        inArray(schema.workflowRuns.status, ['failed', 'cancelled']),
      ),
      columns: { id: true, graph: true, status: true, error: true, endedAt: true, startedAt: true },
      orderBy: desc(schema.workflowRuns.startedAt),
    });
    if (!run) return null;

    const last = await this.db.query.chatMessages.findFirst({
      where: eq(schema.chatMessages.sessionId, sessionId),
      columns: { role: true, runId: true },
      orderBy: desc(schema.chatMessages.ordinal),
    });
    // Matched by run, not by time: the message is stamped by the database clock and the failure by the app's, so a
    // turn that fails within the millisecond its message was stored would otherwise read as already moved past.
    if (!last || last.role !== 'user' || last.runId !== run.id) return null;

    const endedAt = run.endedAt ?? run.startedAt;

    const error = run.error as { code?: unknown; message?: unknown } | null;
    return {
      runId: run.id,
      graph: run.graph,
      status: run.status === 'cancelled' ? 'cancelled' : 'failed',
      endedAt,
      code: typeof error?.code === 'string' ? error.code : null,
      message: typeof error?.message === 'string' ? error.message : null,
    };
  }

  /**
   * One chat turn: guard, compact if needed, assemble the hub pack, one structured
   * call through the repair ladder, then persist the exchange and stage any proposed change-set —
   * all correlated under a fresh workflow run.
   *
   * With an `emitter` the reply streams as it decodes and the declared lookups are reported as they run;
   * without one the turn is byte-for-byte what it was, down to going through `modelRouter.structured`.
   */
  async turn(projectId: bigint, sessionId: string, content: string, emitter?: ChatTurnEmitter, options: ChatTurnOptions = {}): Promise<ChatTurnResult> {
    const session = await this.getSession(projectId, sessionId);
    if (session.status !== 'active') throw AppErrorCode.CHT_002.create();
    await this.validateScopeRef(projectId, session.scopeType, session.scopeRef);
    this.logger.info('chat turn', { projectId, sessionId, scopeType: session.scopeType, mode: session.mode });
    this.logger.debug('chat turn user message', { projectId, sessionId, content });

    await this.compaction.compactIfNeeded(projectId, session, CHAT_HISTORY_BUDGET);

    const policy = await this.pluginPolicy.resolve(projectId, { role: 'chat' });
    const [pack, history, project] = await Promise.all([
      this.contextAssembler.forChatTurn(projectId, session, { policy }),
      this.compaction.buildHistory(session),
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);

    const proseEdits = options.proseEdits === true;
    const prompt = buildChatRefinePrompt(session.scopeType, { proseEdits });
    const turnRules = renderTurnRules({ proseEdits });
    const scopeInstructions = `${HUB_INSTRUCTIONS}\n\n${this.renderLookupVocabulary()}`;

    // Resolve which model this turn runs on, then inject it as the `config.models.chat` override the
    // router already reads — the turn keeps the `chat` role for prompts/telemetry either way.
    const resolvedModel = await this.resolveSessionModel(session, projectId, project as ProjectConfig | undefined);
    const baseConfig = (project?.config as { models?: Record<string, unknown> } | null) ?? {};
    const effectiveProject = { ...project, config: { ...baseConfig, models: { ...(baseConfig.models ?? {}), chat: resolvedModel } } } as typeof project;
    const relay = emitter ? new EmitterRelay(emitter, err => this.logger.warn('chat turn emitter failed — running the turn unobserved', { projectId, sessionId, err })) : null;
    const streamHandlers = relay?.streamHandlers;
    const { runId, result } = await this.workflowRunService.runChain(projectId, 'chat-turn', `session:${sessionId}`, { content }, async runId => {
      relay?.runId(runId);
      await this.workflowRunService.linkContextPack(runId, pack.id);
      // Persist the user's message before the model call: the running chat-turn run plus this
      // as-yet-unanswered message is what lets a refresh or a second tab recover the in-flight turn
      // (design recovery). The reply lands in persistAssistantTurn once the model returns.
      const userMessage = await this.persistUserMessage(projectId, session, content, runId);
      relay?.userMessage(userMessage);
      // Not awaited: must overlap the turn, not delay it. Its own workflow run, not this one — this
      // run may already be marked complete by the time it resolves.
      if (userMessage.ordinal === 1) this.nameSession(projectId, session, content, project as ProjectConfig | undefined);
      const ctx = { projectId, runId, node: 'chat-turn', promptKey: prompt.key, promptVersion: prompt.version, role: 'chat' };
      const turnHistory = [...history];
      const invoke = (): Promise<ChatRefineOutput> => {
        const input = {
          scopeInstructions,
          stableContext: pack.renderedStable,
          history: turnHistory,
          volatileContext: pack.renderedVolatile || 'nothing',
          turnRules,
          userMessage: content,
        };
        const routed = effectiveProject as ProjectConfig | undefined;
        const output = streamHandlers
          ? this.modelRouter.streamStructured(prompt, input, ctx, streamHandlers, routed, policy)
          : this.modelRouter.structured(prompt, input, ctx, routed, policy);
        return output as Promise<ChatRefineOutput>;
      };

      // Declared-lookup rounds: execute the requested read-only tools,
      // fold the results into the conversation, and re-invoke — bounded, audited, hub-only.
      let output = await invoke();
      const lookupCallCounts = new Map<string, number>();
      for (let round = 0; round < MAX_LOOKUP_ROUNDS && (output.lookups?.length ?? 0) > 0; round++) {
        this.logger.debug('chat turn: executing declared lookups', { runId, round, lookups: output.lookups?.map(l => l.tool) });
        const results = await this.executeLookups(projectId, runId, output.lookups ?? [], lookupCallCounts, round, relay);
        const exhausted = round === MAX_LOOKUP_ROUNDS - 1 ? '\n\nLookup budget exhausted — answer with what you have; do not request more lookups.' : '';
        turnHistory.push(new AIMessage(JSON.stringify({ reply: output.reply, lookups: output.lookups })), new HumanMessage(`Lookup results:\n${results}${exhausted}`));
        relay?.supersedeOnNextDelta();
        output = await invoke();
      }
      // A model that still asks for lookups after the budget note answers with its reply alone.
      if ((output.lookups?.length ?? 0) > 0) output = { reply: output.reply };

      // A removal written as "no X" gets one chance to be rewritten as a deletion; whatever survives is kept and flagged for review.
      const exempt = requestedNegations(content);
      output = withheldProse(output, proseEdits);
      let warnings = await this.negationWarnings(projectId, output, exempt);
      if (warnings.length > 0) {
        turnHistory.push(new AIMessage(JSON.stringify({ reply: output.reply, changeSet: output.changeSet })), new HumanMessage(negationFixRequest(warnings)));
        relay?.supersedeOnNextDelta();
        const revised = await invoke().catch((err: unknown) => {
          this.logger.warn('chat turn: negation fix round failed — keeping the flagged change-set', { projectId, sessionId, runId, err });
          return null;
        });
        if (revised && (revised.lookups?.length ?? 0) === 0) {
          output = withheldProse(revised, proseEdits);
          warnings = await this.negationWarnings(projectId, output, exempt);
        }
      }

      return this.persistAssistantTurn(projectId, session, userMessage, output, runId, resolvedModel, warnings);
    });

    this.logger.debug('chat turn complete', { projectId, sessionId, runId, hasProposal: !!result.proposal, proposalId: result.proposal?.id });

    if (session.mode === 'auto' && result.proposal?.warnings?.length) return { ...result, applyNote: AUTO_APPLY_HELD_NOTE, runId };
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
      return {
        proposal: applied.proposal,
        applied: { applied: applied.applied, staleMarked: applied.staleMarked, opResults: applied.opResults },
        applyNote: declinedOpNote(applied.opResults),
      };
    } catch (err) {
      const fresh = await this.proposalService.get(projectId, proposal.id);
      const note = AppError.is(err) || err instanceof Error ? err.message : String(err);
      this.logger.warn(`auto-apply of proposal ${proposal.id} failed: ${note}`);
      return { proposal: fresh, applyNote: note };
    }
  }

  /** Names a session from its opening message alone. */
  private nameSession(projectId: bigint, session: Refinement.ChatSession, content: string, project: ProjectConfig | undefined): void {
    if (session.title !== null) return;
    const message = content.trim();
    if (message.length < CHAT_TITLE_MIN_CONTENT_LENGTH) return;
    this.runNameSession(projectId, session.id, message, project).catch(err => this.logger.warn('chat session naming failed', { projectId, sessionId: session.id, err }));
  }

  private async runNameSession(projectId: bigint, sessionId: string, message: string, project: ProjectConfig | undefined): Promise<void> {
    const prompt = PROMPT_REGISTRY['chat-title'];
    const { result: named } = await this.workflowRunService.runChain(projectId, CHAT_TITLE_GRAPH, `session:${sessionId}`, { message }, async runId => {
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
    });
    if (named) this.events.publish(projectId, { type: 'chat', sessionId });
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

  /**
   * Runs declared lookups through the registry handlers with the same audit and budgets as the tool loop.
   * `callCounts` is threaded in by the caller so `maxCallsPerRun` is enforced across every round of one turn,
   * not reset per round — the map lives on the turn's call stack, never on the (singleton, cross-project) service.
   */
  private async executeLookups(
    projectId: bigint,
    runId: string,
    lookups: { tool: string; args?: Record<string, unknown> }[],
    callCounts: Map<string, number>,
    round: number,
    relay: EmitterRelay | null,
  ): Promise<string> {
    const rawTools = this.toolRegistry.getRaw(CHAT_HUB_NODE);
    const ctx: ToolContext = { chapter: null, db: this.db, node: CHAT_HUB_NODE, projectId, retrieval: this.retrievalService, runId };
    const blocks: string[] = [];

    for (const lookup of lookups) {
      const args = lookup.args ?? {};
      relay?.lookup({ round, tool: lookup.tool, args: { ...args }, status: 'running' });
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
        const parsed = rawTool.inputSchema.safeParse(args);
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

      // Copied, not shared: `args` is the object the audit row below stores, and a subscriber that
      // redacts what it is handed in place would rewrite that row.
      relay?.lookup({ round, tool: lookup.tool, args: { ...args }, status: auditStatus === 'ok' ? 'ok' : 'error' });

      const digest = createHash('sha256').update(resultStr).digest('hex').slice(0, 16);
      await this.db
        .insert(schema.toolCalls)
        .values({ args, latencyMs: Date.now() - startedAt, node: CHAT_HUB_NODE, resultDigest: digest, runId, status: auditStatus, tool: lookup.tool })
        .catch(err => this.logger.error('failed to write lookup audit row', { err }));
      blocks.push(`### ${lookup.tool}\n${resultStr}`);
    }
    return blocks.join('\n\n');
  }

  /**
   * The chat model resolution ladder, most specific first:
   *  1. the chat's own override (the author picked a model for this conversation),
   *  2. otherwise the model routed for the `chat` role — the router folds in the project's group
   *     selection, then the owner's defaults.
   */
  private async resolveSessionModel(session: Refinement.ChatSession, projectId: bigint, project?: ProjectConfig): Promise<ResolvedModel> {
    const role: AiRole = 'chat';
    if (session.modelProvider && session.modelId) {
      const picked = { provider: session.modelProvider, model: session.modelId };
      if (project?.contentMode !== 'unrestricted' || isUnrestrictedAllowed(role, picked)) return picked;
    }
    return this.modelRouter.resolveFor(role, project, projectId);
  }

  private async persistUserMessage(projectId: bigint, session: Refinement.ChatSession, content: string, runId: string): Promise<Refinement.ChatMessage> {
    const lastOrdinal = await this.latestOrdinal(session.id);
    const [userMessage] = await this.db
      .insert(schema.chatMessages)
      .values({ sessionId: session.id, projectId, ordinal: lastOrdinal + 1, role: 'user', content, runId, tokens: countTokens(content) })
      .returning()
      .catch(err => this.databaseService.translateError(err));
    if (!userMessage) throw AppErrorCode.CHT_001.create();
    this.events.publish(projectId, { type: 'chat', sessionId: session.id });
    return userMessage;
  }

  private async persistAssistantTurn(
    projectId: bigint,
    session: Refinement.ChatSession,
    userMessage: Refinement.ChatMessage,
    output: ChatRefineOutput,
    runId: string,
    model: { provider: string; model: string },
    warnings: string[],
  ): Promise<Omit<ChatTurnResult, 'runId'>> {
    const [assistantMessage] = await this.db
      .insert(schema.chatMessages)
      .values({
        sessionId: session.id,
        projectId,
        ordinal: userMessage.ordinal + 1,
        role: 'assistant',
        content: output.reply,
        runId,
        modelProvider: model.provider,
        modelId: model.model,
        tokens: countTokens(output.reply),
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));
    if (!assistantMessage) throw AppErrorCode.CHT_001.create();

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
        allowedOps: HUB_ALLOWED_OPS,
        runId,
        warnings,
      });
      await this.db.update(schema.chatMessages).set({ proposalId: proposal.id }).where(eq(schema.chatMessages.id, assistantMessage.id));
      assistantMessage.proposalId = proposal.id;
    }

    await this.db.update(schema.chatSessions).set({ lastTurnAt: new Date(), updatedAt: new Date() }).where(eq(schema.chatSessions.id, session.id));
    return { userMessage, assistantMessage, proposal };
  }

  private async negationWarnings(projectId: bigint, output: ChatRefineOutput, exempt: ReadonlySet<string>): Promise<string[]> {
    if (!output.changeSet?.length) return [];
    try {
      return await findNegationEchoWarnings(this.db, projectId, output.changeSet as unknown as ChangeOp[], { exempt });
    } catch (err) {
      this.logger.warn('chat turn: negation check failed — staging without warnings', { projectId, err });
      return [];
    }
  }

  private async latestOrdinal(sessionId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number | null>`max(${schema.chatMessages.ordinal})` })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.sessionId, sessionId));
    return row?.max ?? 0;
  }
}
