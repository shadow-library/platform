import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { and, asc, eq, gt } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { countTokens } from '../ai/context/token-budget';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { type ChatCompactOutput } from '../ai/schemas';

// Compaction thresholds (design §5.4): fold history once the verbatim window outgrows its token
// budget or trails the watermark by more than MAX_VERBATIM_TURNS messages; the newest
// KEEP_VERBATIM_TURNS messages always stay verbatim.
const MAX_VERBATIM_TURNS = 12;
const KEEP_VERBATIM_TURNS = 6;

/**
 * The conversation window every chat-shaped turn pipeline shares: the rolling summary, the watermark
 * that moves it, and the prompt messages read back off it. ChatService and the Ideation Studio differ
 * in everything around the turn and in nothing here, so this is a collaborator rather than a base class.
 */
@Injectable()
export class ChatCompactionService {
  private readonly logger = Logger.getLogger(APP_NAME, ChatCompactionService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Summary + post-watermark verbatim turns as real prompt messages (design §10.2). */
  async buildHistory(session: Refinement.ChatSession): Promise<BaseMessage[]> {
    const verbatim = await this.verbatimWindow(session);

    const history: BaseMessage[] = [];
    if (session.summary) history.push(new HumanMessage(`Conversation so far (compacted summary):\n${session.summary}`));
    for (const message of verbatim) history.push(message.role === 'assistant' ? new AIMessage(message.content) : new HumanMessage(message.content));
    return history;
  }

  /**
   * Folds everything up to the newest KEEP_VERBATIM_TURNS messages into the rolling summary once the
   * verbatim window exceeds `historyBudget` or MAX_VERBATIM_TURNS. Messages are never deleted — the
   * watermark is a read-time window over the intact transcript. The passed session is advanced in
   * place so a caller that already loaded it reads the new watermark without a second query.
   */
  async compactIfNeeded(projectId: bigint, session: Refinement.ChatSession, historyBudget: number): Promise<void> {
    const verbatim = await this.verbatimWindow(session);
    if (verbatim.length <= KEEP_VERBATIM_TURNS) return;

    const totalTokens = verbatim.reduce((sum, m) => sum + (m.tokens ?? countTokens(m.content)), 0);
    if (totalTokens <= historyBudget && verbatim.length <= MAX_VERBATIM_TURNS) return;

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

  private verbatimWindow(session: Refinement.ChatSession): Promise<Refinement.ChatMessage[]> {
    return this.db.query.chatMessages.findMany({
      where: and(eq(schema.chatMessages.sessionId, session.id), gt(schema.chatMessages.ordinal, session.summaryThroughOrdinal)),
      orderBy: asc(schema.chatMessages.ordinal),
    });
  }
}
