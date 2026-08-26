import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, utils } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { seedContentHash } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Ideation, type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { ContextAssembler, IDEATION_HISTORY_BUDGET } from '../ai/context/context-assembler.service';
import { countTokens } from '../ai/context/token-budget';
import { type ResolvedModel } from '../ai/defaults';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { buildIdeationStressPrompt, buildIdeationTurnPrompt, PROMPT_REGISTRY, renderReadinessPrecheck, scopeAllowedOps } from '../ai/prompts';
import { type IdeationConceptsOutput, type IdeationStressOutput, type IdeationTurnOutput } from '../ai/schemas';
import { type ChangeOp } from '../refinement/change-set';
import { ChatCompactionService } from '../refinement/chat-compaction.service';
import { SCOPE_CHAT_ROLE } from '../refinement/chat.service';
import { type ScopedTurnResult } from '../refinement/chat-turn.registry';
import { ProposalApplyService } from '../refinement/proposal-apply.service';
import { ProposalService } from '../refinement/proposal.service';
import { ProjectService } from '../project/project/project.service';
import { matchPlaybooks } from './constraint-playbooks';
import { type CreateSeedBody, type ListSeedsQuery, type ListSeedsResponse, type SeedResponse, type SeedStressResponse, type SeedSummaryResponse } from './ideation.dto';
import { getQuestion } from './question-bank';
import { nextQuestions, readinessDimensions, recordOffered, type RouterResult, toRouterSeedState } from './question-router';

const PLACEHOLDER_SEED_NAME = 'Untitled idea';
const STUDIO_SESSION_TITLE = 'Ideation Studio';
const SPARK_EXCERPT_LENGTH = 160;
const STRESS_QUESTION_ID = 'stress.readiness';
const DIVERGE_QUESTION_ID = 'diverge.cards';

// How many consecutive offers of the same re-offered question the studio tolerates before it stops
// asking and commits (T3 design note N4). The router has no memory of attempts — it re-offers a
// stranded question forever — so the bound lives here, read off the payloads of the last turns.
const CIRCLING_LIMIT = 3;

interface StudioTurnContext {
  session: Refinement.ChatSession;
  seed: Ideation.StorySeed;
  project: { id: bigint; config: unknown } | undefined;
}

/** A card the generation round produced, paired with the playbook filter it failed. */
interface FilterRejection {
  playbookKey: string;
  card: string;
  mustReplace: string;
}

@Injectable()
export class IdeationService {
  private readonly logger = Logger.getLogger(APP_NAME, IdeationService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly context: ContextService,
    private readonly projectService: ProjectService,
    private readonly contextAssembler: ContextAssembler,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly proposalService: ProposalService,
    private readonly proposalApplyService: ProposalApplyService,
    private readonly compaction: ChatCompactionService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  private ownerId(): bigint {
    return BigInt(this.context.getAuthPrincipal().sub);
  }

  private present(seed: Ideation.StorySeed, sessionId: string | null): SeedResponse {
    return {
      id: seed.id,
      projectId: seed.projectId,
      sessionId,
      fields: seed.fields ?? {},
      provenance: seed.provenance ?? {},
      constraints: seed.constraints ?? [],
      tasteAnchors: seed.tasteAnchors ?? { comps: [], preferences: [] },
      concepts: seed.concepts ?? [],
      readiness: seed.readiness ?? [],
      askedQuestions: seed.askedQuestions ?? [],
      revision: seed.revision,
      createdAt: seed.createdAt,
      updatedAt: seed.updatedAt,
    };
  }

  /**
   * Mints an idea: a seed-status project, its sheet, and the studio conversation. The chat session is
   * inserted here rather than through `ChatService.createSession`, which refuses the `ideation` scope
   * (IDE_005) so no HTTP caller can open a studio session out of band. A spark is persisted as the
   * conversation's first user message so the turn pipeline reads it as an ordinary opening turn.
   */
  async createSeed(body: CreateSeedBody): Promise<SeedResponse> {
    const spark = body.spark?.trim();
    const project = await this.projectService.create({ name: PLACEHOLDER_SEED_NAME, kind: 'new_novel' }, { status: 'seed' });

    try {
      return await this.db.transaction(async tx => {
        const [seed] = await tx
          .insert(schema.storySeeds)
          .values({
            projectId: project.id,
            fields: {},
            provenance: {},
            constraints: [],
            tasteAnchors: { comps: [], preferences: [] },
            concepts: [],
            readiness: [],
            askedQuestions: [],
            contentHash: seedContentHash({}),
          })
          .returning()
          .catch(err => this.databaseService.translateError(err));
        if (!seed) throw AppErrorCode.S001.create();

        const [session] = await tx
          .insert(schema.chatSessions)
          .values({ projectId: project.id, scopeType: 'ideation', mode: 'auto', title: STUDIO_SESSION_TITLE })
          .returning()
          .catch(err => this.databaseService.translateError(err));
        if (!session) throw AppErrorCode.CHT_001.create();

        if (spark) {
          await tx
            .insert(schema.chatMessages)
            .values({ sessionId: session.id, projectId: project.id, ordinal: 1, role: 'user', content: spark })
            .catch(err => this.databaseService.translateError(err));
        }

        this.logger.info('seed created', { projectId: project.id, seedId: seed.id, sessionId: session.id, hasSpark: Boolean(spark) });
        return this.present(seed, session.id);
      });
    } catch (err) {
      // The project insert already committed outside this transaction (ProjectService.create owns no
      // tx of its own and inserts nothing else for seeds), so a failure here would otherwise strand a
      // seed-status project with no sheet — invisible everywhere but the /seeds listing's join. Delete
      // it and surface the original failure.
      await this.db
        .delete(schema.projects)
        .where(eq(schema.projects.id, project.id))
        .catch(deleteErr => this.logger.error('failed to compensate orphan seed project', { projectId: project.id, error: deleteErr }));
      throw err;
    }
  }

  /** The Ideas shelf: every seed-status project the caller owns, newest activity first, page by page. */
  async listSeeds(filter: ListSeedsQuery): Promise<ListSeedsResponse> {
    const query = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' } });

    const ownedSeedProjectIds = this.db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.ownerId, this.ownerId()), eq(schema.projects.status, 'seed')));
    const where = inArray(schema.storySeeds.projectId, ownedSeedProjectIds);
    const column = query.sortBy === 'createdAt' ? schema.storySeeds.createdAt : schema.storySeeds.updatedAt;
    const order = query.sortOrder === 'asc' ? asc(column) : desc(column);

    const [total, seeds] = await Promise.all([
      this.db.$count(schema.storySeeds, where),
      this.db.query.storySeeds.findMany({ where, orderBy: order, limit: query.limit, offset: query.offset }),
    ]);
    if (seeds.length === 0) return utils.pagination.createResult(query, [], total);

    const sessions = await this.studioSessions(seeds.map(seed => seed.projectId));
    const sparks = await this.sparkExcerpts([...sessions.values()]);

    const items: SeedSummaryResponse[] = seeds.map(seed => {
      const sessionId = sessions.get(seed.projectId) ?? null;
      return {
        id: seed.id,
        projectId: seed.projectId,
        sessionId,
        workingTitle: seed.fields?.workingTitle ?? null,
        sparkExcerpt: (sessionId && sparks.get(sessionId)) ?? null,
        createdAt: seed.createdAt,
        updatedAt: seed.updatedAt,
      };
    });
    return utils.pagination.createResult(query, items, total);
  }

  /** The full sheet for one seed. Ownership is enforced a stage earlier by `ProjectOwnershipGuard`. */
  async getSeed(projectId: bigint): Promise<SeedResponse> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { status: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (project.status !== 'seed') throw AppErrorCode.IDE_001.create();

    const seed = await this.db.query.storySeeds.findFirst({ where: eq(schema.storySeeds.projectId, projectId) });
    if (!seed) throw AppErrorCode.IDE_001.create();

    const sessions = await this.studioSessions([projectId]);
    return this.present(seed, sessions.get(projectId) ?? null);
  }

  /**
   * One project can end up with more than one `ideation` session; the newest one is the live studio
   * conversation. Sessions minted in the same transaction share a timestamp, so the id breaks the tie
   * and the same session is returned on every read.
   */
  private async studioSessions(projectIds: bigint[]): Promise<Map<bigint, string>> {
    const sessions = await this.db.query.chatSessions.findMany({
      where: and(inArray(schema.chatSessions.projectId, projectIds), eq(schema.chatSessions.scopeType, 'ideation')),
      columns: { id: true, projectId: true },
      orderBy: [desc(schema.chatSessions.createdAt), desc(schema.chatSessions.id)],
    });

    const newest = new Map<bigint, string>();
    for (const session of sessions as Pick<Refinement.ChatSession, 'id' | 'projectId'>[]) {
      if (!newest.has(session.projectId)) newest.set(session.projectId, session.id);
    }
    return newest;
  }

  /**
   * The spark is the conversation's first user message, not a sheet field — a brand-new seed has an
   * empty sheet, so it is the only thing that can label its shelf card.
   */
  private async sparkExcerpts(sessionIds: string[]): Promise<Map<string, string>> {
    if (sessionIds.length === 0) return new Map();
    const messages = await this.db.query.chatMessages.findMany({
      where: and(inArray(schema.chatMessages.sessionId, sessionIds), eq(schema.chatMessages.ordinal, 1), eq(schema.chatMessages.role, 'user')),
      columns: { sessionId: true, content: true },
    });
    return new Map(messages.map((message: Pick<Refinement.ChatMessage, 'sessionId' | 'content'>) => [message.sessionId, this.excerpt(message.content)]));
  }

  private excerpt(content: string): string {
    const text = content.trim();
    return text.length <= SPARK_EXCERPT_LENGTH ? text : `${text.slice(0, SPARK_EXCERPT_LENGTH).trimEnd()}…`;
  }

  /**
   * One studio turn (ideation-studio design §4.2). The router runs first and decides which of three
   * turns this is — the interview, the concept round, or the stress pass — and the shape of the rest
   * mirrors `ChatService.turn`: compact, assemble, one structured call through the repair ladder,
   * persist the exchange, stage the change-set, apply it in the same request because studio sessions
   * are auto by default and a sheet edit is trivially revertible.
   *
   * `askedQuestions` is written on EVERY turn, answered or not: it records what was *offered*, and a
   * turn that records only what the author answered re-offers forced questions forever. It is written
   * directly rather than through a proposal — it is the router's memory, not authored content — and
   * it is outside `contentHash`, which covers `fields` alone, so it cannot invalidate a baseline.
   */
  async turn(projectId: bigint, sessionId: string, content: string): Promise<ScopedTurnResult> {
    const ctx = await this.loadStudio(projectId, sessionId);
    await this.compaction.compactIfNeeded(projectId, ctx.session, IDEATION_HISTORY_BUDGET);

    const round = nextQuestions(toRouterSeedState(ctx.seed));
    this.logger.info('studio turn', { projectId, sessionId, stage: round.stage, questions: round.questions.map(question => question.id), done: round.done });

    if (round.questions.some(question => question.id === STRESS_QUESTION_ID)) return this.stressTurn(ctx, round, content);
    if (round.stage === 'diverge' && round.questions.some(question => question.id === DIVERGE_QUESTION_ID)) return this.conceptsTurn(ctx, round, content);
    return this.interviewTurn(ctx, round, content);
  }

  /** The stress pass on demand — the same critic the router fires once, re-runnable from the sheet screen. */
  async stress(projectId: bigint): Promise<SeedStressResponse> {
    const seed = await this.loadSeed(projectId);
    const sessionId = (await this.studioSessions([projectId])).get(projectId) ?? null;
    const session = sessionId ? await this.db.query.chatSessions.findFirst({ where: eq(schema.chatSessions.id, sessionId) }) : undefined;
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    const { runId, readiness } = await this.runStress({ seed, session: session ?? null, project });
    return { seed: this.present(await this.loadSeed(projectId), sessionId), runId, readiness };
  }

  private async interviewTurn(ctx: StudioTurnContext, round: RouterResult, content: string): Promise<ScopedTurnResult> {
    const { session, seed } = ctx;
    const projectId = seed.projectId;
    const commitIds = await this.circlingIds(session.id, round);
    if (commitIds.length > 0) this.logger.info('studio turn: committing on the author’s behalf', { projectId, sessionId: session.id, commitIds });

    const [pack, history] = await Promise.all([this.contextAssembler.forIdeationTurn(seed, round, { commitIds }), this.compaction.buildHistory(session)]);
    const prompt = buildIdeationTurnPrompt(round);
    const model = this.resolveSessionModel(session, ctx.project as ProjectConfig | undefined);

    const { runId, result } = await this.workflowRunService.runChain(projectId, 'ideation-turn', `session:${session.id}`, { content }, async runId => {
      await this.workflowRunService.linkContextPack(runId, pack.id);
      const userMessage = await this.persistUserMessage(session, content, runId);
      const output = (await this.modelRouter.structured(
        prompt,
        { stableContext: pack.renderedStable, history, volatileContext: pack.renderedVolatile || 'nothing', userMessage: content },
        { projectId, runId, node: 'ideation-turn', promptKey: prompt.key, promptVersion: prompt.version, role: 'chat' },
        this.withSessionModel(ctx.project, model),
      )) as IdeationTurnOutput;

      const assistantMessage = await this.persistAssistantMessage(
        session,
        userMessage.ordinal + 1,
        output.reply,
        output.payload as unknown as Record<string, unknown>,
        runId,
        model,
      );
      const proposal = await this.stageProposal(session, assistantMessage, output.changeSet, output.reply, runId);
      await this.recordAsked(seed, round);
      return { userMessage, assistantMessage, proposal };
    });

    const settled = session.mode === 'auto' && result.proposal ? await this.autoApply(projectId, result.proposal) : {};
    return { ...result, ...settled, runId, seed: await this.presentFresh(projectId, session.id) };
  }

  /**
   * The concept round. Playbook `conceptFilter`s are floors, not taste: a rejected set is re-generated
   * once with the reasons in front of the model, and if the second set still fails the cards are shown
   * anyway with the failures named in the payload. A lexical gate that rejects everything must not be
   * able to leave the author with no cards — author judgement outranks the filter (T3/T4 review).
   */
  private async conceptsTurn(ctx: StudioTurnContext, round: RouterResult, content: string): Promise<ScopedTurnResult> {
    const { session, seed } = ctx;
    const projectId = seed.projectId;
    const pack = await this.contextAssembler.forIdeationConcepts(seed);
    const prompt = PROMPT_REGISTRY['ideation-concepts'];
    const model = this.resolveSessionModel(session, ctx.project as ProjectConfig | undefined);
    const filters = matchPlaybooks(seed.constraints ?? []).matched.filter(match => match.playbook.conceptFilter);

    const { runId, result } = await this.workflowRunService.runChain(projectId, 'ideation-concepts', `session:${session.id}`, { content }, async runId => {
      await this.workflowRunService.linkContextPack(runId, pack.id);
      const userMessage = await this.persistUserMessage(session, content, runId);
      const telemetry = { projectId, runId, node: 'ideation-concepts', promptKey: prompt.key, promptVersion: prompt.version, role: 'chat' };
      const generate = async (volatileContext: string): Promise<IdeationConceptsOutput> =>
        (await this.modelRouter.structured(
          prompt,
          { stableContext: pack.renderedStable, volatileContext },
          telemetry,
          this.withSessionModel(ctx.project, model),
        )) as IdeationConceptsOutput;

      const volatile = pack.renderedVolatile || 'nothing';
      let output = await generate(volatile);
      let rejections = this.rejectedCards(output, filters);
      if (rejections.length > 0) {
        this.logger.warn('studio concepts: playbook filters rejected the first set', { projectId, runId, rejections });
        output = await generate(`${volatile}\n\n${renderFilterRejections(rejections)}`);
        rejections = this.rejectedCards(output, filters);
      }
      if (rejections.length > 0) this.logger.warn('studio concepts: filters still rejecting — presenting the cards with the failures noted', { projectId, runId, rejections });

      const cards = await this.persistConcepts(seed, output);
      const payload = { kind: 'cards', round: cards[0]?.round ?? 1, cards, ...(rejections.length > 0 ? { filtersFailed: rejections } : {}) };
      const assistantMessage = await this.persistAssistantMessage(session, userMessage.ordinal + 1, coachingOf(DIVERGE_QUESTION_ID), payload, runId, model);
      await this.recordAsked(seed, round);
      return { userMessage, assistantMessage, proposal: null };
    });

    return { ...result, runId, seed: await this.presentFresh(projectId, session.id) };
  }

  private async stressTurn(ctx: StudioTurnContext, round: RouterResult, content: string): Promise<ScopedTurnResult> {
    const { session, seed } = ctx;
    const projectId = seed.projectId;

    const userMessage = await this.persistUserMessage(session, content, null);
    const { runId, assistantMessage } = await this.runStress({ seed, session, project: ctx.project, ordinal: userMessage.ordinal + 1 });
    await this.recordAsked(seed, round);
    if (!assistantMessage) throw AppErrorCode.CHT_001.create();

    return { userMessage, assistantMessage, proposal: null, runId, seed: await this.presentFresh(projectId, session.id) };
  }

  /**
   * The critic pass itself, shared by the router-triggered turn and the on-demand endpoint. The
   * `judge` role is cacheable on purpose: the verdict is a function of the sheet, so re-running it on
   * an unchanged sheet is served from `llm_cache` rather than re-billed.
   */
  private async runStress(input: {
    seed: Ideation.StorySeed;
    session: Refinement.ChatSession | null;
    project: { config: unknown } | undefined;
    ordinal?: number;
  }): Promise<{ runId: string; readiness: Ideation.ReadinessEntry[]; assistantMessage?: Refinement.ChatMessage }> {
    const { seed, session } = input;
    const projectId = seed.projectId;
    const dimensions = readinessDimensions(toRouterSeedState(seed));
    const prompt = buildIdeationStressPrompt(dimensions);
    const pack = await this.contextAssembler.forIdeationConcepts(seed);
    const target = session ? `session:${session.id}` : `seed:${seed.id}`;

    const { runId, result } = await this.workflowRunService.runChain(projectId, 'ideation-stress', target, {}, async runId => {
      await this.workflowRunService.linkContextPack(runId, pack.id);
      const output = (await this.modelRouter.structured(
        prompt,
        { stableContext: pack.renderedStable, precheck: renderReadinessPrecheck(dimensions) },
        { projectId, runId, node: 'ideation-stress', promptKey: prompt.key, promptVersion: prompt.version, role: prompt.role ?? 'judge' },
        input.project as ProjectConfig | undefined,
      )) as IdeationStressOutput;

      const readiness = output.readiness as unknown as Ideation.ReadinessEntry[];
      await this.db.update(schema.storySeeds).set({ readiness, updatedAt: new Date() }).where(eq(schema.storySeeds.id, seed.id));

      const assistantMessage = session
        ? await this.persistAssistantMessage(
            session,
            input.ordinal ?? (await this.latestOrdinal(session.id)) + 1,
            coachingOf(STRESS_QUESTION_ID),
            { kind: 'readiness', readiness },
            runId,
            null,
          )
        : undefined;
      return { readiness, assistantMessage };
    });

    return { runId, ...result };
  }

  private async loadStudio(projectId: bigint, sessionId: string): Promise<StudioTurnContext> {
    const seed = await this.loadSeed(projectId);
    const session = await this.db.query.chatSessions.findFirst({ where: and(eq(schema.chatSessions.projectId, projectId), eq(schema.chatSessions.id, sessionId)) });
    if (!session) throw AppErrorCode.CHT_001.create();
    // The reverse of ChatService's guard: a non-studio session reaching here was misrouted, and the
    // studio's router would read a sheet the conversation is not about.
    if (session.scopeType !== 'ideation') throw AppErrorCode.IDE_005.create();
    if (session.status !== 'active') throw AppErrorCode.CHT_002.create();

    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    return { session, seed, project };
  }

  private async loadSeed(projectId: bigint): Promise<Ideation.StorySeed> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { status: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (project.status !== 'seed') throw AppErrorCode.IDE_001.create();

    const seed = await this.db.query.storySeeds.findFirst({ where: eq(schema.storySeeds.projectId, projectId) });
    if (!seed) throw AppErrorCode.IDE_001.create();
    return seed;
  }

  private async presentFresh(projectId: bigint, sessionId: string): Promise<SeedResponse> {
    return this.present(await this.loadSeed(projectId), sessionId);
  }

  /**
   * The circling bound. `backfilled` says a question is being re-offered but not how often, so the
   * count comes off the payloads of the last turns: an id the two most recent studio replies both
   * offered is being asked a third time, and the turn is told to commit instead of asking again.
   */
  private async circlingIds(sessionId: string, round: RouterResult): Promise<string[]> {
    if (round.backfilled.length === 0) return [];
    const recent = await this.db.query.chatMessages.findMany({
      where: and(eq(schema.chatMessages.sessionId, sessionId), eq(schema.chatMessages.role, 'assistant')),
      orderBy: desc(schema.chatMessages.ordinal),
      limit: CIRCLING_LIMIT - 1,
      columns: { payload: true },
    });
    if (recent.length < CIRCLING_LIMIT - 1) return [];

    const offers = recent.map(message => new Set(offeredQuestionIds(message.payload)));
    return round.backfilled.filter(id => offers.every(offered => offered.has(id)));
  }

  private rejectedCards(output: IdeationConceptsOutput, filters: ReturnType<typeof matchPlaybooks>['matched']): FilterRejection[] {
    const rejections: FilterRejection[] = [];
    for (const card of output.cards ?? []) {
      for (const { playbook } of filters) {
        if (playbook.conceptFilter?.(card) === false) rejections.push({ playbookKey: playbook.key, card: card.title, mustReplace: playbook.mustReplace });
      }
    }
    return rejections;
  }

  /** Cards land as `offered` — a fate is the author's verdict, and inventing one before they speak fakes it. */
  private async persistConcepts(seed: Ideation.StorySeed, output: IdeationConceptsOutput): Promise<Ideation.ConceptCard[]> {
    const existing = seed.concepts ?? [];
    const round = existing.reduce((highest, card) => Math.max(highest, card.round), 0) + 1;
    const fresh: Ideation.ConceptCard[] = (output.cards ?? []).map(card => ({
      round,
      title: card.title,
      logline: card.logline,
      engine: card.engine,
      ladder: card.ladder,
      posture: card.posture,
      fate: 'offered',
    }));

    await this.db
      .update(schema.storySeeds)
      .set({ concepts: [...existing, ...fresh], updatedAt: new Date() })
      .where(eq(schema.storySeeds.id, seed.id));
    return fresh;
  }

  private async recordAsked(seed: Ideation.StorySeed, round: RouterResult): Promise<void> {
    const askedQuestions = recordOffered(toRouterSeedState(seed), round);
    if (askedQuestions.length === (seed.askedQuestions ?? []).length) return;
    await this.db.update(schema.storySeeds).set({ askedQuestions, updatedAt: new Date() }).where(eq(schema.storySeeds.id, seed.id));
  }

  private async stageProposal(
    session: Refinement.ChatSession,
    assistantMessage: Refinement.ChatMessage,
    changeSet: Record<string, unknown>[] | undefined,
    reply: string,
    runId: string,
  ): Promise<Refinement.Proposal | null> {
    if (!changeSet || changeSet.length === 0) return null;
    const proposal = await this.proposalService.create(session.projectId, {
      sessionId: session.id,
      messageId: assistantMessage.id,
      scopeType: 'ideation',
      scopeRef: null,
      kind: 'ideation',
      summary: reply.split('\n', 1)[0]?.slice(0, 300),
      changeSet: changeSet as unknown as ChangeOp[],
      allowedOps: scopeAllowedOps('ideation'),
      runId,
    });
    await this.db.update(schema.chatMessages).set({ proposalId: proposal.id }).where(eq(schema.chatMessages.id, assistantMessage.id));
    assistantMessage.proposalId = proposal.id;
    return proposal;
  }

  /** Auto-mode apply, same semantics as the hub's: a conflict downgrades the turn to a pending proposal, never fails it. */
  private async autoApply(projectId: bigint, proposal: Refinement.Proposal): Promise<Pick<ScopedTurnResult, 'proposal' | 'applied' | 'applyNote'>> {
    try {
      const applied = await this.proposalApplyService.apply(projectId, proposal.id, { autoApplied: true });
      return { proposal: applied.proposal, applied: { applied: applied.applied, staleMarked: applied.staleMarked, opResults: applied.opResults } };
    } catch (err) {
      const fresh = await this.proposalService.get(projectId, proposal.id);
      const note = AppError.is(err) || err instanceof Error ? err.message : String(err);
      this.logger.warn(`auto-apply of studio proposal ${proposal.id} failed: ${note}`);
      return { proposal: fresh, applyNote: note };
    }
  }

  private resolveSessionModel(session: Refinement.ChatSession, project?: ProjectConfig): ResolvedModel {
    if (session.modelProvider && session.modelId) return { provider: session.modelProvider, model: session.modelId };
    return this.modelRouter.resolveModel(SCOPE_CHAT_ROLE[session.scopeType], project);
  }

  /** The resolved model reaches the router as the `config.models.chat` override it already reads. */
  private withSessionModel(project: { config: unknown } | undefined, model: ResolvedModel): ProjectConfig | undefined {
    if (!project) return undefined;
    const base = (project.config as { models?: Record<string, unknown> } | null) ?? {};
    return { ...project, config: { ...base, models: { ...(base.models ?? {}), chat: model } } } as ProjectConfig;
  }

  private async persistUserMessage(session: Refinement.ChatSession, content: string, runId: string | null): Promise<Refinement.ChatMessage> {
    const ordinal = (await this.latestOrdinal(session.id)) + 1;
    const [message] = await this.db
      .insert(schema.chatMessages)
      .values({ sessionId: session.id, projectId: session.projectId, ordinal, role: 'user', content, runId, tokens: countTokens(content) })
      .returning();
    if (!message) throw AppErrorCode.CHT_001.create();
    return message;
  }

  private async persistAssistantMessage(
    session: Refinement.ChatSession,
    ordinal: number,
    content: string,
    payload: Record<string, unknown>,
    runId: string,
    model: ResolvedModel | null,
  ): Promise<Refinement.ChatMessage> {
    const [message] = await this.db
      .insert(schema.chatMessages)
      .values({
        sessionId: session.id,
        projectId: session.projectId,
        ordinal,
        role: 'assistant',
        content,
        payload,
        runId,
        modelProvider: model?.provider,
        modelId: model?.model,
        tokens: countTokens(content),
      })
      .returning();
    if (!message) throw AppErrorCode.CHT_001.create();

    await this.db.update(schema.chatSessions).set({ lastTurnAt: new Date(), updatedAt: new Date() }).where(eq(schema.chatSessions.id, session.id));
    return message;
  }

  private async latestOrdinal(sessionId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number | null>`max(${schema.chatMessages.ordinal})` })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.sessionId, sessionId));
    return row?.max ?? 0;
  }
}

/** The coaching line is reviewed prose written to be shown as-is, so it is what a card or readiness turn says. */
function coachingOf(questionId: string): string {
  const coaching = getQuestion(questionId)?.coaching;
  if (!coaching) throw AppErrorCode.IDE_003.create();
  return coaching;
}

function offeredQuestionIds(payload: Record<string, unknown> | null): string[] {
  if (payload?.['kind'] !== 'questions') return [];
  const questions = payload['questions'];
  if (!Array.isArray(questions)) return [];
  return questions.map(question => (question as { id?: unknown }).id).filter((id): id is string => typeof id === 'string');
}

function renderFilterRejections(rejections: FilterRejection[]): string {
  const lines = rejections.map(rejection => `- "${rejection.card}" breaks the ${rejection.playbookKey} shape the author locked. ${rejection.mustReplace}`);
  return `The previous four cards were rejected against the locked shapes:\n${lines.join('\n')}\n\nGenerate four new cards that carry those loads on the card itself, still differing from each other on engine, ladder and posture.`;
}
