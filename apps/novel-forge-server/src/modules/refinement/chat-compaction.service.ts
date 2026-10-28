import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { and, asc, desc, eq, gt, isNotNull, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Project, type Refinement, schema } from '@server/database';

import { countTokens } from '../ai/context/token-budget';
import { isContentMode } from '../ai/defaults';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { findHardLine, isHardLineRefusal } from '../ai/hard-line';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { type ChatCompactOutput } from '../ai/schemas';
import { resolveUnrestrictedRoute } from '../ai/unrestricted-route';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import { type ChatSelection, loadTurnSelections } from './chat-selection';
import { renderQuestionForHistory } from './chat-question';
import { type ChatSegment, heldSegment, replayWindow } from './chat-exchange';
import { renderTurnContent, turnScreens } from './passage-context';

// Fold history once the verbatim window outgrows its token budget or trails the watermark by MAX_VERBATIM_TURNS; the newest KEEP_VERBATIM_TURNS stay verbatim.
const MAX_VERBATIM_TURNS = 12;
const KEEP_VERBATIM_TURNS = 6;
const CHAT_COMPACT_GRAPH = 'chat-compact';

// A segment replays every context update and lookup result since it opened; past this it starts over from the plain window instead.
const MAX_SEGMENT_TOKENS = 24_000;

export const UNRESTRICTED_REPLY_PLACEHOLDER = '[reply written with the unrestricted model — omitted]';
export const UNRESTRICTED_SUMMARY_PLACEHOLDER = '[earlier conversation summarised with the unrestricted model — omitted]';

export interface ChatConversation {
  /** The summary and each stored message as written, whatever the turn sends: what the history budget and the turn's web links read. */
  plain: BaseMessage[];
  history: BaseMessage[];
  segment: ChatSegment | null;
}

interface ChatWindow {
  rows: Refinement.ChatMessage[];
  opening: BaseMessage[];
  render: (message: Refinement.ChatMessage) => BaseMessage[];
}

function countMessageTokens(messages: readonly BaseMessage[]): number {
  return messages.reduce((sum, message) => sum + countTokens(typeof message.content === 'string' ? message.content : JSON.stringify(message.content)), 0);
}

/** The conversation window every chat-shaped turn pipeline shares: the rolling summary, the watermark that moves it, and the prompt messages read back off it. */
@Injectable()
export class ChatCompactionService {
  private readonly logger = Logger.getLogger(APP_NAME, ChatCompactionService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly pluginPolicy: PluginPolicyService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Summary plus post-watermark turns as prompt messages; a standard turn never sees what the unrestricted model wrote (replies and its summary become placeholders). */
  async buildHistory(session: Refinement.ChatSession, project: ProjectConfig | undefined, turnMode: Project.ContentMode): Promise<BaseMessage[]> {
    const window = await this.window(session, project, turnMode);
    return [...window.opening, ...window.rows.flatMap(window.render)];
  }

  /** A standard turn's history when the gateway keeps a session: the open segment's turns as sent, so requests only append; otherwise the plain window, opening a new segment. */
  async continueConversation(session: Refinement.ChatSession, project: ProjectConfig | undefined, playbook: string): Promise<ChatConversation> {
    const window = await this.window(session, project, 'standard');
    const plain = [...window.opening, ...window.rows.flatMap(window.render)];
    const segment = heldSegment(window.rows, session.summaryThroughOrdinal, playbook);
    if (!segment) return { plain, history: plain, segment: null };
    const history = [...window.opening, ...replayWindow(window.rows, segment.id, window.render)];
    if (countMessageTokens(history) > MAX_SEGMENT_TOKENS) return { plain, history: plain, segment: null };
    return { plain, history, segment };
  }

  private async window(session: Refinement.ChatSession, project: ProjectConfig | undefined, turnMode: Project.ContentMode): Promise<ChatWindow> {
    const rows = await this.verbatimWindow(session);
    const fallback = modeOf(project?.contentMode);
    const standard = turnMode === 'standard';
    const unrestricted = standard ? await this.unrestrictedReplies(rows, fallback) : new Set<bigint>();
    const hideSummary = standard && session.summary !== null && (await this.summaryMode(session, fallback)) === 'unrestricted';

    const opening: BaseMessage[] = [];
    if (session.summary) {
      const summary = hideSummary ? UNRESTRICTED_SUMMARY_PLACEHOLDER : session.summary;
      opening.push(new HumanMessage(`Conversation so far (compacted summary):\n${summary}`));
    }
    const render = (message: Refinement.ChatMessage): BaseMessage[] => {
      if (message.role !== 'assistant') return !standard && refusesAuthored(message) ? [] : [new HumanMessage(renderTurnContent(message.content, message.contexts))];
      if (unrestricted.has(message.id)) return [new AIMessage(UNRESTRICTED_REPLY_PLACEHOLDER)];
      const askedLine = renderQuestionForHistory(message.question);
      return [new AIMessage(askedLine ? `${message.content}\n\n${askedLine}` : message.content)];
    };
    return { rows, opening, render };
  }

  /**
   * Folds older messages into the rolling summary once the window exceeds `historyBudget` or MAX_VERBATIM_TURNS;
   * messages are never deleted, the watermark is a read-time window over the intact transcript. Advances the passed session in place.
   * The fold runs unrestricted if the novel, turn, prior summary or any folded reply is, and the summary is then recorded unrestricted so standard turns never read it.
   * Returns the compaction run's id (undefined if nothing needed folding) so the caller can link it to the turn run once that run exists — compaction always runs before it.
   */
  async compactIfNeeded(
    projectId: bigint,
    session: Refinement.ChatSession,
    historyBudget: number,
    project: ProjectConfig | undefined,
    turn: ChatSelection,
  ): Promise<string | undefined> {
    const verbatim = await this.verbatimWindow(session);
    if (verbatim.length <= KEEP_VERBATIM_TURNS) return undefined;

    const totalTokens = verbatim.reduce((sum, m) => sum + (m.tokens ?? countTokens(m.content)), 0);
    if (totalTokens <= historyBudget && verbatim.length <= MAX_VERBATIM_TURNS) return undefined;

    const toFold = verbatim.slice(0, verbatim.length - KEEP_VERBATIM_TURNS);
    const watermark = toFold[toFold.length - 1]?.ordinal ?? session.summaryThroughOrdinal;
    const transcript = toFold
      .filter(m => m.role === 'assistant' || !refusesAuthored(m))
      .map(m => `${m.role}: ${m.role === 'assistant' ? m.content : renderTurnContent(m.content, m.contexts)}`)
      .join('\n\n');

    const fallback = modeOf(project?.contentMode);
    const folded = await this.unrestrictedReplies(toFold, fallback);
    const priorMode = session.summary ? await this.summaryMode(session, fallback) : 'standard';
    const raised = [fallback, turn.contentMode, priorMode].includes('unrestricted') || folded.size > 0;
    const contentMode: Project.ContentMode = raised ? 'unrestricted' : 'standard';
    const selected: ProjectConfig = { ...project, contentMode, costTier: turn.costTier };

    const prompt = PROMPT_REGISTRY['chat-compact'];
    const target = `session:${session.id}`;
    const folding = this.workflowRunService.runChain(projectId, CHAT_COMPACT_GRAPH, target, { watermark, contentMode }, async runId => {
      const ctx = { projectId, runId, node: CHAT_COMPACT_GRAPH, promptKey: prompt.key, promptVersion: prompt.version, role: 'compact' };
      const route = raised ? await resolveUnrestrictedRoute({ pluginPolicy: this.pluginPolicy }, projectId, { role: 'compact' }, selected) : undefined;
      const input = { priorSummary: session.summary ?? 'none', transcript };
      const output = (await this.modelRouter.structured(prompt, input, ctx, route?.project ?? selected, route?.policy)) as ChatCompactOutput;
      return output.summary;
    });
    // A refused fold is skipped, not failed: the turn runs on the uncompacted window and the next turn tries again.
    const compacted = await folding.catch((err: unknown) => {
      if (!isHardLineRefusal(err)) throw err;
      this.logger.warn('chat compaction refused by the hard line — keeping the verbatim window', {
        projectId,
        sessionId: session.id,
        rule: err.data?.['rule'],
        source: err.data?.['source'],
      });
      return null;
    });
    if (!compacted) return undefined;
    const { runId: compactionRunId, result: summary } = compacted;

    await this.db.update(schema.chatSessions).set({ summary, summaryThroughOrdinal: watermark, updatedAt: new Date() }).where(eq(schema.chatSessions.id, session.id));
    // Every segment opened before this fold is over, so no exchange in the chat can be replayed again.
    await this.db
      .update(schema.chatMessages)
      .set({ exchange: null })
      .where(and(eq(schema.chatMessages.sessionId, session.id), isNotNull(schema.chatMessages.exchange)));
    session.summary = summary;
    session.summaryThroughOrdinal = watermark;
    this.logger.debug(`compacted session ${session.id} through ordinal ${watermark}`, { contentMode });
    return compactionRunId;
  }

  // A reply whose turn recorded no selection predates selections and ran in the novel's mode, which is the best evidence left.
  private async unrestrictedReplies(messages: Refinement.ChatMessage[], fallback: Project.ContentMode): Promise<Set<bigint>> {
    const replies = messages.filter(message => message.role === 'assistant');
    const selections = await loadTurnSelections(this.db, [...new Set(replies.flatMap(reply => (reply.runId ? [reply.runId] : [])))]);
    const modeFor = (reply: Refinement.ChatMessage): Project.ContentMode => (reply.runId ? selections.get(reply.runId)?.contentMode : undefined) ?? fallback;
    return new Set(replies.filter(reply => modeFor(reply) === 'unrestricted').map(reply => reply.id));
  }

  private async summaryMode(session: Refinement.ChatSession, fallback: Project.ContentMode): Promise<Project.ContentMode> {
    const [run] = await this.db
      .select({ contentMode: sql<string | null>`${schema.workflowRuns.input}->>'contentMode'` })
      .from(schema.workflowRuns)
      .where(and(eq(schema.workflowRuns.graph, CHAT_COMPACT_GRAPH), eq(schema.workflowRuns.target, `session:${session.id}`), eq(schema.workflowRuns.status, 'completed')))
      .orderBy(desc(schema.workflowRuns.startedAt))
      .limit(1);
    return isContentMode(run?.contentMode) ? run.contentMode : fallback;
  }

  private verbatimWindow(session: Refinement.ChatSession): Promise<Refinement.ChatMessage[]> {
    return this.db.query.chatMessages.findMany({
      where: and(eq(schema.chatMessages.sessionId, session.id), gt(schema.chatMessages.ordinal, session.summaryThroughOrdinal)),
      orderBy: asc(schema.chatMessages.ordinal),
    });
  }
}

function refusesAuthored(message: Refinement.ChatMessage): boolean {
  return findHardLine(turnScreens(message.content, message.contexts).map(screen => screen.text)) !== null;
}

function modeOf(value: string | undefined): Project.ContentMode {
  return value === 'unrestricted' ? 'unrestricted' : 'standard';
}
