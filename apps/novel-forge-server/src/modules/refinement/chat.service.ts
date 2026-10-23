import { randomUUID } from 'node:crypto';

import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { PROGRESS_ITEM_KEYS } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { CHAT_HISTORY_BUDGET, ContextAssembler } from '../ai/context/context-assembler.service';
import { countTokens } from '../ai/context/token-budget';
import { type ResolvedModel } from '../ai/defaults';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { hardLineError, screenTexts } from '../ai/hard-line';
import { type ModelRoute, ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { buildChatRefinePrompt, chatPromptTokens, chatScopeInstructions, HUB_ALLOWED_OPS, renderTurnMessage, renderTurnRules } from '../ai/prompts';
import { type ChatRefineOutput } from '../ai/schemas';
import { NovelForgeCatalogService } from '../ai/novel-forge-catalog.service';
import { gatewaySessionKey, SYNAPSE_CHAT_TASK, SYNAPSE_PROVIDER, synapseAlias, synapseSelectors } from '../ai/synapse-request';
import { resolveUnrestrictedRoute } from '../ai/unrestricted-route';
import { WebResearchService } from '../ai/web';
import { countWords } from '../eval/deterministic-metrics';
import { ProjectEventService } from '../events/project-event.service';
import { NotesStoreService } from '../notes/notes-store.service';
import { ORGANISE_MIN_WORDS } from '../notes/organise-plan';
import { type ForgeCallPolicy, PluginPolicyService } from '../plugins/plugin-policy.service';
import { parseChangeSet } from './change-set';
import { ChatCompactionService, type ChatConversation } from './chat-compaction.service';
import { ChatLookupService } from './chat-lookup.service';
import { contextUpdate, playbookDigest, toExchangeMessage } from './chat-exchange';
import { type ChatTurnEmitter, EmitterRelay } from './chat-turn-emitter';
import { TurnTraceCollector } from './chat-turn-trace';
import { aliasRoutedProject, CHAT_TURN_GRAPH, type ChatSelection, chatSelection, type ChatSelectionOverride } from './chat-selection';
import { type ChatMessageView, ChatSessionService } from './chat-session.service';
import { ChatTurnStagingService, type StagingContext } from './chat-turn-staging.service';
import { sanitizeChatQuestion } from './chat-question';
import { requestedNegations } from './negation-echo';
import { isNotesOrganiseRequest, organiseRouting, withLaterPlansRouted } from './later-plans-guard';
import { authorWords, type PassageContextInput, renderTurnContent, resolvePassageContexts, turnScreens } from './passage-context';
import { chatTurnWarnings } from './planner-only-guard';
import { findNegationEchoWarnings } from './proposal-warnings';
import { proseWithheldNote, withoutProseEditOps } from './prose-intent';
import { type TurnApplied, type TurnHoldReason } from './turn-proposals';

/** `contentMode` and `costTier` apply to this turn's reply only; actions the turn starts inherit its tier, never its mode. */
export interface ChatTurnOptions extends ChatSelectionOverride {
  /** The author's explicit per-turn permission to rewrite chapter prose; without it a prose op is withheld. */
  proseEdits?: boolean;
  /** Just discussing: nothing the turn proposes applies; every op becomes a card. */
  justDiscussing?: boolean;
  contexts?: PassageContextInput[];
}

/** What a reply records when no response named its model, as a call that never answered records itself. */
const UNANSWERED_CHAT: ResolvedModel = { provider: SYNAPSE_PROVIDER, model: SYNAPSE_CHAT_TASK };

function plainConversation(history: BaseMessage[]): ChatConversation {
  return { plain: history, history, segment: null };
}

function authorTexts(content: string, history: readonly BaseMessage[]): string[] {
  const earlier = history.filter(message => message instanceof HumanMessage && typeof message.content === 'string').map(message => message.content as string);
  return [content, ...earlier];
}

interface ChatReplyRoute {
  policy: ForgeCallPolicy;
  project: ProjectConfig;
  route: ModelRoute;
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

interface AuthoredMessage {
  content: string;
  contexts: Refinement.ChatPassageContext[];
  rendered: string;
}

export interface ChatTurnResult {
  userMessage: Refinement.ChatMessage;
  assistantMessage: ChatMessageView;
  /** The turn's suggestion cards, pending review. */
  proposal: Refinement.Proposal | null;
  /** The ops applied in the turn: the author's own words and, under Edit freely, the model's ideas. */
  appliedProposal?: Refinement.Proposal | null;
  applied?: TurnApplied;
  applyNote?: string;
  held?: TurnHoldReason;
  runId: string;
}

// Declared-lookup budget for a hub turn: at most this many lookup rounds
// execute before the model is told to answer with what it has.
const MAX_LOOKUP_ROUNDS = 3;

function withheldProse(output: ChatRefineOutput, proseEdits: boolean): ChatRefineOutput {
  if (proseEdits || !output.changeSet?.length) return output;
  const { kept, withheld } = withoutProseEditOps(output.changeSet);
  if (withheld === 0) return output;
  return {
    reply: `${output.reply}\n\n${proseWithheldNote(output.changeSet)}`,
    ...(kept.length > 0 ? { changeSet: kept } : {}),
    ...(output.question ? { question: output.question } : {}),
  };
}

function negationFixRequest(warnings: string[]): string {
  return `Your changeSet removes things by stating their absence, which hands them straight back to the chapter writer:\n${warnings.map(w => `- ${w}`).join('\n')}\n\nRespond again with the same JSON shape and no lookups: rewrite each of those passages without the removed idea, and keep every other change. Keep any line that withholds knowledge or schedules a reveal ("does not yet learn", "no longer") — that is plot, not a removal.`;
}

// A chat-turn run older than this is treated as orphaned, never "in progress", so a crashed process
// can't leave a session's thinking indicator stuck on forever.
const PENDING_TURN_MAX_AGE_MS = 15 * 60 * 1000;
const TURN_GRAPHS = [CHAT_TURN_GRAPH];

@Injectable()
export class ChatService {
  private readonly logger = Logger.getLogger(APP_NAME, ChatService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly contextAssembler: ContextAssembler,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly compaction: ChatCompactionService,
    private readonly pluginPolicy: PluginPolicyService,
    private readonly events: ProjectEventService,
    private readonly notesStore: NotesStoreService,
    private readonly webResearch: WebResearchService,
    private readonly sessions: ChatSessionService,
    private readonly lookups: ChatLookupService,
    private readonly turnStaging: ChatTurnStagingService,
    private readonly catalog?: NovelForgeCatalogService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  private async validateScopeRef(projectId: bigint, scopeType: Refinement.ChatScope, scopeRef: string | null): Promise<string | null> {
    const value = scopeRef?.includes(':') ? (scopeRef.split(':')[1] ?? '') : '';
    switch (scopeType) {
      case 'project':
      case 'novel':
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
      case 'volume': {
        const volume =
          scopeRef?.startsWith('volume:') && (await this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, value)) }));
        if (!volume) throw AppErrorCode.CHT_003.create();
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

  async authorNotes(projectId: bigint): Promise<string> {
    return (await this.notesStore.read(projectId)).text;
  }

  /** The running turn, the recovery signal for a refresh or second tab; bounded by a cutoff so an orphaned run never pins the indicator. */
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
    await this.sessions.getSession(projectId, sessionId);
    const [pendingTurn, lastOrdinal] = await Promise.all([this.pendingTurn(projectId, sessionId), this.sessions.latestOrdinal(sessionId)]);
    // Only looked up once nothing is running: a live turn is the answer, and the previous failure it is
    // retrying would otherwise be reported alongside it.
    const failedTurn = pendingTurn ? null : await this.failedTurn(projectId, sessionId);
    return { pendingTurn, failedTurn, lastOrdinal };
  }

  /** The turn that died or was stopped, for a transcript ending on an unanswered user message; `cancelled` is deliberate and never auto-retried. */
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

  async turn(projectId: bigint, sessionId: string, content: string, emitter?: ChatTurnEmitter, options: ChatTurnOptions = {}): Promise<ChatTurnResult> {
    const trace = new TurnTraceCollector();
    const session = await this.sessions.getSession(projectId, sessionId);
    if (session.status !== 'active') throw AppErrorCode.CHT_002.create();
    await this.validateScopeRef(projectId, session.scopeType, session.scopeRef);
    const contexts = await resolvePassageContexts(this.db, projectId, options.contexts ?? []);
    if (!content.trim() && contexts.length === 0) throw AppErrorCode.CHT_012.create();
    this.logger.info('chat turn', { projectId, sessionId, scopeType: session.scopeType, mode: session.mode, contexts: contexts.length });
    this.logger.debug('chat turn user message', { projectId, sessionId, content });

    const project = (await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) })) as ProjectConfig | undefined;
    const turnSelection = chatSelection(options, session, project);
    const message = renderTurnContent(content, contexts);
    const compactionRunId = await this.compaction.compactIfNeeded(projectId, session, CHAT_HISTORY_BUDGET, project, turnSelection);

    const { policy, project: routed, route } = await this.routeChatReply(projectId, session, project, turnSelection);
    // Refused before it is saved: a stored message would ride every later turn's history and refuse the session with it.
    const refused = route.contentMode === 'unrestricted' ? screenTexts(turnScreens(content, contexts)) : null;
    if (refused) {
      this.logger.warn('chat turn refused by the hard line before it was saved', { projectId, sessionId, rule: refused.rule, source: refused.source });
      throw hardLineError(refused);
    }
    const proseEdits = options.proseEdits === true;
    const justDiscussing = options.justDiscussing === true;
    const organiseRequest = isNotesOrganiseRequest(content) && countWords(await this.authorNotes(projectId)) >= ORGANISE_MIN_WORDS;
    const organise = organiseRouting(organiseRequest, session.mode, justDiscussing);
    const prompt = buildChatRefinePrompt(session.scopeType, { proseEdits, organiseNotes: organiseRequest });
    const guarded = (output: ChatRefineOutput): ChatRefineOutput => withLaterPlansRouted(withheldProse(output, proseEdits), organise);
    const turnRules = renderTurnRules({ proseEdits, justDiscussing, organiseNotes: organiseRequest, mode: session.mode });
    const webMode = await this.webResearch.modeFor(synapseSelectors(route), synapseAlias('chat', routed));
    const scopeInstructions = chatScopeInstructions(this.lookups.tools(webMode), webMode);
    const playbook = playbookDigest(scopeInstructions);
    const keyed = route.contentMode === 'standard';
    const conversation = keyed
      ? await this.compaction.continueConversation(session, project, playbook)
      : plainConversation(await this.compaction.buildHistory(session, project, route.contentMode));
    const promptTokens = chatPromptTokens(scopeInstructions);
    const historyTexts = conversation.plain.map(message => (typeof message.content === 'string' ? message.content : JSON.stringify(message.content)));
    const requestTokens = [turnRules, message, ...historyTexts].reduce((sum, part) => sum + countTokens(part), 0);
    const pack = await this.contextAssembler.forNovelChat(projectId, session.createdAt, { policy, promptTokens, requestTokens });
    const context = keyed ? contextUpdate(pack, conversation.segment?.sections) : null;
    const stableContext = conversation.segment?.stableContext ?? pack.renderedStable;
    const turnParts = { volatileContext: context?.text ?? (pack.renderedVolatile || 'nothing'), turnRules, userMessage: message };

    const selection: ChatSelection = { contentMode: route.contentMode, costTier: route.costTier };
    const relay = emitter ? new EmitterRelay(emitter, err => this.logger.warn('chat turn emitter failed — running the turn unobserved', { projectId, sessionId, err })) : null;
    const streamHandlers = relay ? trace.observe(relay.streamHandlers) : undefined;
    const supersede = (): void => {
      relay?.supersedeOnNextDelta();
      trace.supersedeOnNextWrite();
    };
    const { runId, result } = await this.workflowRunService.runChain(projectId, CHAT_TURN_GRAPH, `session:${sessionId}`, { content, ...selection }, async runId => {
      relay?.runId(runId);
      await this.workflowRunService.linkContextPack(runId, pack.id);
      // Compaction, when it ran, always precedes this run's creation — it cannot name this run as its
      // parent at its own creation time, so the link is completed here instead, as soon as the id exists.
      if (compactionRunId) await this.workflowRunService.setParentRun(compactionRunId, runId);
      // Persist the user's message before the model call: the running run plus this unanswered message lets a refresh or second tab recover the in-flight turn.
      const userMessage = await this.persistUserMessage(projectId, session, { content, contexts, rendered: message }, runId);
      relay?.userMessage(userMessage);
      // Not awaited: must overlap the turn, not delay it. Its own workflow run, not this one — this
      // run may already be marked complete by the time it resolves.
      if (userMessage.ordinal === 1) this.sessions.nameSession(projectId, session, content, routed, runId);
      // Every call of the turn — lookup rounds, the negation fix and the router's repairs — appends to `rounds`, and `settled` marks the
      // rounds the last answered call sent, which is where the next turn's conversation picks up.
      const rounds: BaseMessage[] = [];
      let settled = 0;
      const gatewaySession = keyed ? gatewaySessionKey(projectId, sessionId) : undefined;
      let answered: ResolvedModel | undefined;
      const ctx = {
        projectId,
        runId,
        node: 'chat-turn',
        promptKey: prompt.key,
        promptVersion: prompt.version,
        role: 'chat',
        webTools: webMode === 'native',
        onAnswered: (model: ResolvedModel) => void (answered = model),
        ...(gatewaySession ? { gatewaySession, onRepair: (reply: string, request: string) => void rounds.push(new AIMessage(reply), new HumanMessage(request)) } : {}),
      };
      const invoke = async (): Promise<ChatRefineOutput> => {
        const input = { scopeInstructions, stableContext, history: conversation.history, ...turnParts, rounds: [...rounds] };
        const output = streamHandlers
          ? await this.modelRouter.streamStructured(prompt, input, ctx, streamHandlers, routed, policy)
          : await this.modelRouter.structured(prompt, input, ctx, routed, policy);
        settled = rounds.length;
        return output as ChatRefineOutput;
      };

      // Declared-lookup rounds: execute the requested read-only tools,
      // fold the results into the conversation, and re-invoke — bounded, audited, hub-only.
      let output = await invoke();
      const lookupCallCounts = new Map<string, number>();
      const planner = { read: false };
      const web = webMode === 'brave' ? this.webResearch.forTurn(authorTexts(authorWords(content, contexts), conversation.plain)) : undefined;
      for (let round = 0; round < MAX_LOOKUP_ROUNDS && (output.lookups?.length ?? 0) > 0; round++) {
        this.logger.debug('chat turn: executing declared lookups', { runId, round, lookups: output.lookups?.map(l => l.tool) });
        const results = await this.lookups.executeLookups(projectId, runId, output.lookups ?? [], lookupCallCounts, { round, relay, trace, planner, web, webMode });
        const exhausted = round === MAX_LOOKUP_ROUNDS - 1 ? '\n\nLookup budget exhausted — answer with what you have; do not request more lookups.' : '';
        rounds.push(new AIMessage(JSON.stringify({ reply: output.reply, lookups: output.lookups })), new HumanMessage(`Lookup results:\n${results}${exhausted}`));
        supersede();
        output = await invoke();
      }
      // A model that still asks for lookups after the budget note answers with its reply alone, dropping any changeSet or question sent alongside it.
      if ((output.lookups?.length ?? 0) > 0) output = { reply: output.reply };

      // A removal written as "no X" gets one chance to be rewritten as a deletion; whatever survives is kept and flagged for review.
      const exempt = requestedNegations(authorWords(content, contexts));
      output = guarded(output);
      let warnings = await this.negationWarnings(projectId, output, exempt);
      if (warnings.length > 0) {
        const unrevised = settled;
        rounds.push(new AIMessage(JSON.stringify({ reply: output.reply, changeSet: output.changeSet })), new HumanMessage(negationFixRequest(warnings)));
        supersede();
        const revised = await invoke().catch((err: unknown) => {
          this.logger.warn('chat turn: negation fix round failed — keeping the flagged change-set', { projectId, sessionId, runId, err });
          return null;
        });
        if (revised && (revised.lookups?.length ?? 0) === 0) {
          output = guarded(revised);
          warnings = await this.negationWarnings(projectId, output, exempt);
        } else {
          // The kept reply is the one before the fix, so the next turn continues from it; the gateway, holding the discarded one, starts over.
          settled = unrevised;
        }
      }

      const turnWarnings = chatTurnWarnings(warnings, planner.read);
      const staging = { justDiscussing, organise, contexts };
      const exchange: Refinement.ChatExchange | null = context && {
        segment: conversation.segment?.id ?? randomUUID(),
        ...(conversation.segment ? {} : { opening: { through: session.summaryThroughOrdinal, playbook, stableContext } }),
        sections: context.sections,
        messages: [{ role: 'user', content: renderTurnMessage(turnParts) }, ...rounds.slice(0, settled).map(toExchangeMessage)],
      };
      const model = answered ?? UNANSWERED_CHAT;
      const persisted = await this.persistAssistantTurn(projectId, session, userMessage, output, runId, { model, exchange }, turnWarnings, staging, trace);
      return { ...persisted, assistantMessage: { ...persisted.assistantMessage, ...selection } };
    });

    this.logger.debug('chat turn complete', { projectId, sessionId, runId, proposalId: result.proposal?.id, appliedProposalId: result.appliedProposal?.id });
    return { ...result, runId };
  }

  /** An unrestricted reply reaches an unrestricted model only where the catalog routes `content_mode: unrestricted` for the tier. */
  private async routeChatReply(projectId: bigint, session: Refinement.ChatSession, project: ProjectConfig | undefined, selection: ChatSelection): Promise<ChatReplyRoute> {
    const call = { role: 'chat' as const };
    const base = aliasRoutedProject(project, session, selection, await this.catalog?.offeredChatAliases(selection));
    const { policy, project: routed } =
      selection.contentMode === 'unrestricted'
        ? await resolveUnrestrictedRoute({ pluginPolicy: this.pluginPolicy }, projectId, call, base)
        : { policy: await this.pluginPolicy.resolve(projectId, call, { contentMode: 'standard' }), project: base };
    const route = this.modelRouter.routeModel(call.role, routed ?? base, policy);
    return { policy, project: routed ?? base, route };
  }

  private async persistUserMessage(projectId: bigint, session: Refinement.ChatSession, authored: AuthoredMessage, runId: string): Promise<Refinement.ChatMessage> {
    const lastOrdinal = await this.sessions.latestOrdinal(session.id);
    const { content, contexts, rendered } = authored;
    const [userMessage] = await this.db
      .insert(schema.chatMessages)
      .values({
        sessionId: session.id,
        projectId,
        ordinal: lastOrdinal + 1,
        role: 'user',
        content,
        contexts: contexts.length > 0 ? contexts : null,
        runId,
        tokens: countTokens(rendered),
      })
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
    { model, exchange }: { model: { provider: string; model: string }; exchange: Refinement.ChatExchange | null },
    warnings: string[],
    staging: StagingContext,
    trace: TurnTraceCollector,
  ): Promise<Omit<ChatTurnResult, 'runId'>> {
    const question = sanitizeChatQuestion(output.question, PROGRESS_ITEM_KEYS);
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
        question: question as Record<string, unknown> | undefined,
        exchange,
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));
    if (!assistantMessage) throw AppErrorCode.CHT_001.create();

    const authored = authorWords(userMessage.content, userMessage.contexts);
    const { replyNote, ...staged } = await this.turnStaging.stageChangeSet(projectId, session, assistantMessage, authored, output, runId, warnings, staging);
    if (staged.cardProposal) await this.turnStaging.linkMessage(assistantMessage, { proposalId: staged.cardProposal.id });
    if (replyNote) await this.appendToReply(assistantMessage, replyNote);
    await this.saveTrace(projectId, assistantMessage, trace.finish());

    await this.db.update(schema.chatSessions).set({ lastTurnAt: new Date(), updatedAt: new Date() }).where(eq(schema.chatSessions.id, session.id));
    const { cardProposal: proposal, appliedProposal, applied, applyNote, held } = staged;
    return { userMessage, assistantMessage, proposal, appliedProposal, applied, applyNote, held };
  }

  private async appendToReply(message: Refinement.ChatMessage, note: string): Promise<void> {
    const content = `${message.content}\n\n${note}`;
    const reply = { content, tokens: countTokens(content) };
    await this.db.update(schema.chatMessages).set(reply).where(eq(schema.chatMessages.id, message.id));
    Object.assign(message, reply);
  }

  /** A turn whose reply and changes are already saved is never failed by its trace; the reply then reads as one from before traces. */
  private async saveTrace(projectId: bigint, message: Refinement.ChatMessage, trace: Refinement.ChatTurnTrace): Promise<void> {
    try {
      await this.db.update(schema.chatMessages).set({ trace }).where(eq(schema.chatMessages.id, message.id));
      Object.assign(message, { trace });
    } catch (err) {
      this.logger.warn('chat turn: saving the turn trace failed — the reply keeps no trace', { projectId, messageId: message.id, runId: message.runId, err });
    }
  }

  private async negationWarnings(projectId: bigint, output: ChatRefineOutput, exempt: ReadonlySet<string>): Promise<string[]> {
    if (!output.changeSet?.length) return [];
    try {
      return await findNegationEchoWarnings(this.db, projectId, parseChangeSet(output.changeSet, HUB_ALLOWED_OPS), { exempt });
    } catch (err) {
      this.logger.warn('chat turn: negation check failed — staging without warnings', { projectId, err });
      return [];
    }
  }
}
