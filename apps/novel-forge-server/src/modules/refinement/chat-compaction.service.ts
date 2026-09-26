import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
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

// Compaction thresholds: fold history once the verbatim window outgrows its token
// budget or trails the watermark by more than MAX_VERBATIM_TURNS messages; the newest
// KEEP_VERBATIM_TURNS messages always stay verbatim.
const MAX_VERBATIM_TURNS = 12;
const KEEP_VERBATIM_TURNS = 6;
const CHAT_COMPACT_GRAPH = 'chat-compact';

export const UNRESTRICTED_REPLY_PLACEHOLDER = '[reply written with the unrestricted model — omitted]';
export const UNRESTRICTED_SUMMARY_PLACEHOLDER = '[earlier conversation summarised with the unrestricted model — omitted]';

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

  /**
   * Summary + post-watermark verbatim turns as real prompt messages. A standard turn never sees what the unrestricted model wrote: its
   * replies and a summary it produced are replaced by placeholders, while the author's own messages stay.
   */
  async buildHistory(session: Refinement.ChatSession, project: ProjectConfig | undefined, turnMode: Project.ContentMode): Promise<BaseMessage[]> {
    const verbatim = await this.verbatimWindow(session);
    const fallback = modeOf(project?.contentMode);
    const standard = turnMode === 'standard';
    const unrestricted = standard ? await this.unrestrictedReplies(verbatim, fallback) : new Set<bigint>();
    const hideSummary = standard && session.summary !== null && (await this.summaryMode(session, fallback)) === 'unrestricted';

    const history: BaseMessage[] = [];
    if (session.summary) {
      const summary = hideSummary ? UNRESTRICTED_SUMMARY_PLACEHOLDER : session.summary;
      history.push(new HumanMessage(`Conversation so far (compacted summary):\n${summary}`));
    }
    for (const message of verbatim) {
      if (message.role !== 'assistant' && !standard && findHardLine([message.content])) continue;
      if (message.role !== 'assistant') {
        history.push(new HumanMessage(message.content));
        continue;
      }
      if (unrestricted.has(message.id)) {
        history.push(new AIMessage(UNRESTRICTED_REPLY_PLACEHOLDER));
        continue;
      }
      const askedLine = renderQuestionForHistory(message.question);
      history.push(new AIMessage(askedLine ? `${message.content}\n\n${askedLine}` : message.content));
    }
    return history;
  }

  /**
   * Folds everything up to the newest KEEP_VERBATIM_TURNS messages into the rolling summary once the
   * verbatim window exceeds `historyBudget` or MAX_VERBATIM_TURNS. Messages are never deleted — the
   * watermark is a read-time window over the intact transcript. The passed session is advanced in
   * place so a caller that already loaded it reads the new watermark without a second query.
   *
   * The model type only ever rises: the fold runs unrestricted when the novel, the chat, this turn, the prior summary or any folded
   * reply is unrestricted, and the summary it writes is recorded as unrestricted so standard turns never read it.
   */
  /** Returns the compaction run's id (undefined if nothing needed folding) so the caller can link it to the turn run once that run exists — compaction always runs before it. */
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
      .filter(m => m.role === 'assistant' || !findHardLine([m.content]))
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n');

    const fallback = modeOf(project?.contentMode);
    const folded = await this.unrestrictedReplies(toFold, fallback);
    const priorMode = session.summary ? await this.summaryMode(session, fallback) : 'standard';
    const raised = [fallback, session.contentMode, turn.contentMode, priorMode].includes('unrestricted') || folded.size > 0;
    const contentMode: Project.ContentMode = raised ? 'unrestricted' : 'standard';
    const selected: ProjectConfig = { ...project, contentMode, costTier: turn.costTier };

    const prompt = PROMPT_REGISTRY['chat-compact'];
    const target = `session:${session.id}`;
    const folding = this.workflowRunService.runChain(projectId, CHAT_COMPACT_GRAPH, target, { watermark, contentMode }, async runId => {
      const ctx = { projectId, runId, node: CHAT_COMPACT_GRAPH, promptKey: prompt.key, promptVersion: prompt.version, role: 'compact' };
      const route = raised
        ? await resolveUnrestrictedRoute({ pluginPolicy: this.pluginPolicy, modelRouter: this.modelRouter }, projectId, { role: 'compact' }, selected)
        : undefined;
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

function modeOf(value: string | undefined): Project.ContentMode {
  return value === 'unrestricted' ? 'unrestricted' : 'standard';
}
