import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { and, desc, eq, isNull, lt, ne, type SQL, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { parseKnowledgeContract, revokeProvisionalReveals } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type ChapterReviewFinding, type Generation, type Job, type PrimaryDatabase, type PrimaryTransaction, type Project, type Review, schema } from '@server/database';

import { chapterContentMode, routeChapterCall } from '../ai/chapter-route';
import { ContextAssembler } from '../ai/context/context-assembler.service';
import { loadWriterBrief } from '../ai/context/writer-brief';
import { runWithCostTier } from '../ai/cost-tier-scope';
import { parseJudgeOutput } from '../ai/graphs/chapter-generation.graph';
import { assessReadability, renderReadabilityEvidence } from '../ai/graphs/readability-check';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { RetrievalService } from '../ai/retrieval/retrieval.service';
import { type ReviewOutput } from '../ai/schemas/review.schema';
import { runToolLoop } from '../ai/tools/tool-loop';
import { ToolRegistryService } from '../ai/tools/tool-registry.service';
import { type CallRoute } from '../ai/unrestricted-route';
import { type FactLike, loadKnowledgeView, scanKnowledgeLeaks, writerVisibleFactKeys } from '../bible/fact/knowledge-view';
import { loadWriterDisclosurePolicy } from '../bible/fact/writer-disclosure-policy';
import { resolveWordTarget } from '../eval/deterministic-metrics';
import { JobHandlerRegistry } from '../jobs/job-handler.registry';
import { JobExecutor } from '../jobs/job.executor';
import { JobService } from '../jobs/job.service';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import { editorialOutcome, isReviewStale, judgeOutcome, mechanicsOutcome, openFindings, readabilityOutcome, type ReviewedText, type ReviewOutcome } from './review-findings';
import { renderJudgeTask, renderSettledFindings, type SettledFinding } from './review-prompts';
import { findReviewedText, KIND_ORDER, type UsedModel, usedModel } from './review-records';

export interface ReviewRequest {
  kind: Review.Kind;
  costTier?: Project.CostTier;
  contentMode?: Project.ContentMode;
}

export interface RemedyRequest {
  action: Review.RemedyAction;
  reason?: string;
}

export interface ReviewFindingView extends Omit<ChapterReviewFinding, 'fingerprint'> {
  remedy: { action: Review.RemedyAction; reason: string | null; updatedAt: Date } | null;
}

export interface ChapterReviewView extends Omit<Review.ChapterReview, 'projectId' | 'bodyHash' | 'findings'> {
  stale: boolean;
  findings: ReviewFindingView[];
  openFindings: number;
  openBlocking: number;
}

export interface ChapterReviewList {
  chapter: number;
  currentRevision: number | null;
  latest: ChapterReviewView[];
  history: ChapterReviewView[];
}

export interface QueuedReview {
  jobId: string;
  runId: string;
  kind: Review.Kind;
  status: Job.Status;
}

export type StartedReview = { queued: false; review: ChapterReviewView } | { queued: true; job: QueuedReview };

interface ReviewSource extends ReviewedText {
  body: string;
  draftId: bigint | null;
  saveSeq: number | null;
  isolated: boolean;
  final: boolean;
  generating: boolean;
}

interface ChapterSetting {
  project: Project.Row | undefined;
  brief: Generation.Brief | undefined;
  mode: Project.ContentMode;
}

interface ModelKindContext {
  projectId: bigint;
  chapter: number;
  source: ReviewSource;
  brief: Generation.Brief | undefined;
  route: CallRoute;
  settled: SettledFinding[];
  runId: string;
}

interface ReviewJobPayload {
  chapter: number;
  kind: Review.Kind;
  contentMode?: Project.ContentMode;
}

type ReviewWithRemedies = Review.ChapterReview & { remedies: Review.Remedy[] };

const REVIEW_GRAPH = 'chapter-review';
const MODEL_KINDS: ReadonlySet<Review.Kind> = new Set(['judge', 'editorial']);
const HISTORY_LIMIT = 50;
const MECHANICAL_PRIOR_WINDOW = 10;
const JUDGE_TOOL_ROUNDS = 4;

/**
 * Reviews a chapter as it stands — generated, hand-written or final — and keeps each review bound to the text it read. It never edits
 * prose: the author answers findings (dismiss, fix it themselves, override), and an open blocking finding on the latest judge review gates
 * the next chapter until they do.
 */
@Injectable()
export class ChapterReviewService {
  private readonly logger = Logger.getLogger(APP_NAME, ChapterReviewService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly modelRouter: ModelRouterService,
    private readonly contextAssembler: ContextAssembler,
    private readonly toolRegistry: ToolRegistryService,
    private readonly retrievalService: RetrievalService,
    private readonly pluginPolicy: PluginPolicyService,
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
    private readonly jobHandlers: JobHandlerRegistry,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  onModuleInit(): void {
    this.jobHandlers.register('review', job => this.runJob(job));
  }

  /** Model reviews run as a durable job; the deterministic kinds are quick and answer at once. */
  async start(projectId: bigint, chapter: number, request: ReviewRequest): Promise<StartedReview> {
    if (!MODEL_KINDS.has(request.kind)) return { queued: false, review: await this.run(projectId, chapter, request) };
    const source = await this.reviewableSource(projectId, chapter);
    const setting = await this.chapterSetting(projectId, chapter, source, request.contentMode);
    await this.routeFor(projectId, request.kind === 'judge' ? 'judge' : 'review', chapter, setting);
    const payload: ReviewJobPayload & { costTier?: Project.CostTier } = { chapter, kind: request.kind, contentMode: request.contentMode, costTier: request.costTier };
    const jobId = await this.jobService.enqueue(projectId, 'review', `chapter-${chapter}-${request.kind}`, payload);
    const runId = await this.workflowRunService.createRun(projectId, REVIEW_GRAPH, `chapter-${chapter}`, { kind: request.kind, chapter }, jobId);
    this.jobExecutor.dispatch(jobId).catch(err => this.logger.error('review job dispatch failed', { err, jobId }));
    const status = (await this.jobService.get(jobId))?.status ?? 'pending';
    return { queued: true, job: { jobId, runId, kind: request.kind, status } };
  }

  run(projectId: bigint, chapter: number, request: ReviewRequest, jobId?: string): Promise<ChapterReviewView> {
    const execute = () => this.review(projectId, chapter, request, jobId);
    return request.costTier ? runWithCostTier(request.costTier, execute) : execute();
  }

  async list(projectId: bigint, chapter: number): Promise<ChapterReviewList> {
    const [reviews, source] = await Promise.all([
      this.db.query.chapterReviews.findMany({
        where: and(eq(schema.chapterReviews.projectId, projectId), eq(schema.chapterReviews.chapter, chapter)),
        orderBy: [desc(schema.chapterReviews.createdAt), desc(schema.chapterReviews.id)],
        limit: HISTORY_LIMIT,
        with: { remedies: true },
      }),
      this.findSource(projectId, chapter),
    ]);
    const history = reviews.map(review => present(review, source));
    const latest = KIND_ORDER.flatMap(kind => history.find(review => review.kind === kind) ?? []);
    return { chapter, currentRevision: source?.draftRevision ?? null, latest, history };
  }

  async get(projectId: bigint, chapter: number, reviewId: bigint): Promise<ChapterReviewView> {
    const [review, source] = await Promise.all([this.findReview(projectId, chapter, reviewId), this.findSource(projectId, chapter)]);
    return present(review, source);
  }

  async remedy(projectId: bigint, chapter: number, reviewId: bigint, findingId: string, request: RemedyRequest): Promise<ChapterReviewView> {
    const { review, finding, source } = await this.answerable(projectId, chapter, reviewId, findingId);
    const reason = request.reason?.trim() || null;
    if (request.action === 'dismissed' && !reason) throw AppErrorCode.REV_004.create();
    if (request.action === 'overridden' && finding.severity !== 'blocking') throw AppErrorCode.REV_005.create();

    await this.db.transaction(async tx => {
      await lockDraft(tx, source);
      await tx
        .insert(schema.chapterReviewRemedies)
        .values({ reviewId: review.id, findingId, fingerprint: finding.fingerprint, action: request.action, reason })
        .onConflictDoUpdate({
          target: [schema.chapterReviewRemedies.reviewId, schema.chapterReviewRemedies.findingId],
          set: { action: request.action, reason, updatedAt: new Date() },
        });
      if (review.kind === 'judge') await this.applyGate(tx, review, source);
    });
    this.logger.info('remedy recorded', { projectId, chapter, reviewId, findingId, action: request.action });
    return this.get(projectId, chapter, reviewId);
  }

  /** Withdraws the author's answer: the finding is open again, stops carrying to later runs, and a blocking one gates the chapter again. */
  async clearRemedy(projectId: bigint, chapter: number, reviewId: bigint, findingId: string): Promise<ChapterReviewView> {
    const { review, source } = await this.answerable(projectId, chapter, reviewId, findingId);
    await this.db.transaction(async tx => {
      await lockDraft(tx, source);
      await tx.delete(schema.chapterReviewRemedies).where(and(eq(schema.chapterReviewRemedies.reviewId, review.id), eq(schema.chapterReviewRemedies.findingId, findingId)));
      if (review.kind === 'judge') await this.applyGate(tx, review, source);
    });
    this.logger.info('remedy cleared', { projectId, chapter, reviewId, findingId });
    return this.get(projectId, chapter, reviewId);
  }

  // `attempts` is read before this dispatch counted itself, so above zero means an earlier attempt started — and may have stored the review
  // before the worker died unsettled; running again would store it twice.
  private async runJob(job: Job.Row): Promise<void> {
    const { chapter, kind, contentMode } = job.payload as ReviewJobPayload;
    if (job.attempts > 0 && (await this.alreadyReviewed(job.id))) {
      this.logger.info('review job retried after its review was stored — settling it as done', { jobId: job.id, projectId: job.projectId, chapter, kind });
      await this.workflowRunService.settleJobRuns(job.id, 'completed');
      return;
    }
    await this.run(job.projectId, chapter, { kind, contentMode }, job.id);
  }

  private async alreadyReviewed(jobId: string): Promise<boolean> {
    const run = await this.db.query.workflowRuns.findFirst({
      where: and(eq(schema.workflowRuns.jobId, jobId), eq(schema.workflowRuns.graph, REVIEW_GRAPH)),
      orderBy: desc(schema.workflowRuns.startedAt),
      columns: { id: true },
    });
    if (!run) return false;
    const review = await this.db.query.chapterReviews.findFirst({ where: eq(schema.chapterReviews.runId, run.id), columns: { id: true } });
    return review !== undefined;
  }

  private async review(projectId: bigint, chapter: number, request: ReviewRequest, jobId?: string): Promise<ChapterReviewView> {
    const source = await this.reviewableSource(projectId, chapter);
    const setting = await this.chapterSetting(projectId, chapter, source, request.contentMode);
    const settled = await this.settledFindings(projectId, chapter, request.kind, source);

    let outcome: ReviewOutcome;
    let runId: string | null = null;
    let model: UsedModel | null = null;
    if (request.kind === 'mechanics') outcome = await this.mechanics(projectId, chapter, source, setting.project);
    else if (request.kind === 'readability') outcome = readabilityOutcome(source.body);
    else
      ({
        runId,
        result: { outcome, model },
      } = await this.modelReview(projectId, chapter, source, setting, settled, request.kind, jobId));

    const review = await this.db.transaction(async tx => {
      await lockDraft(tx, source);
      const [row] = await tx
        .insert(schema.chapterReviews)
        .values({
          projectId,
          chapter,
          draftRevision: source.draftRevision,
          bodyHash: source.bodyHash,
          isolated: setting.mode === 'unrestricted',
          kind: request.kind,
          ...outcome,
          runId,
          costTier: model?.costTier ?? null,
          contentMode: model?.contentMode ?? null,
          modelProvider: model?.modelProvider ?? null,
          model: model?.model ?? null,
        })
        .returning();
      if (!row) throw AppError.internal('chapter review insert returned no row');
      const remedies = await this.carrySettled(tx, row, settled);
      if (request.kind === 'judge') await this.recordVerdictOnDraft(tx, { ...row, remedies }, source);
      return { ...row, remedies };
    });
    this.logger.info('chapter reviewed', { projectId, chapter, kind: request.kind, disposition: review.disposition, findings: review.findings.length });
    return present(review, source);
  }

  private async modelReview(
    projectId: bigint,
    chapter: number,
    source: ReviewSource,
    setting: ChapterSetting,
    settled: SettledFinding[],
    kind: Review.Kind,
    jobId?: string,
  ): Promise<{ runId: string; result: { outcome: ReviewOutcome; model: UsedModel } }> {
    const role = kind === 'judge' ? 'judge' : 'review';
    const route = await this.routeFor(projectId, role, chapter, setting);
    const input = { kind, chapter, draftRevision: source.draftRevision, contentMode: route.project?.contentMode ?? 'standard' };
    return this.workflowRunService.runChain(
      projectId,
      REVIEW_GRAPH,
      `chapter-${chapter}`,
      input,
      async runId => {
        const context: ModelKindContext = { projectId, chapter, source, brief: setting.brief, route, settled, runId };
        const outcome = kind === 'judge' ? await this.judge(context) : await this.editorial(context);
        const model = (await usedModel(this.db, runId, [role])) ?? this.routedModel(role, route);
        return { outcome, model };
      },
      jobId,
    );
  }

  private routedModel(role: 'judge' | 'review', route: CallRoute): UsedModel {
    const routed = this.modelRouter.routeModel(role, route.project, route.policy);
    return { modelProvider: routed.resolved.provider, model: routed.resolved.model, costTier: routed.costTier, contentMode: routed.contentMode };
  }

  private async judge({ projectId, chapter, source, brief, route, settled, runId }: ModelKindContext): Promise<ReviewOutcome> {
    const disclosure = await loadWriterDisclosurePolicy(this.db, projectId, chapter);
    const contract = parseKnowledgeContract(brief?.knowledgeContract);
    const [pack, writerBrief, knowledgeView, facts] = await Promise.all([
      this.contextAssembler.forChapter(projectId, chapter, { policy: route.policy }),
      loadWriterBrief(this.db, projectId, chapter, brief, disclosure),
      contract ? loadKnowledgeView(this.db, projectId, chapter, contract) : null,
      this.db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId), orderBy: schema.canonFacts.factKey }),
    ]);
    const readerVisible = await writerVisibleFactKeys(this.db, projectId, chapter, facts, null);
    const forbidden = uniqueFacts([...disclosure.lockedFacts, ...(knowledgeView?.hidden ?? [])]).filter(fact => fact.source !== 'seed');
    const lockedFromReader = forbidden.filter(fact => !readerVisible.has(fact.factKey));
    const hiddenFromCast = forbidden.filter(fact => readerVisible.has(fact.factKey));
    const readability = assessReadability(source.body);
    const task = renderJudgeTask({
      contextPack: pack.rendered,
      body: source.body,
      chapterBrief: brief ? writerBrief.chapterBrief : null,
      endingContract: writerBrief.endingContract,
      lockedFromReader,
      hiddenFromCast,
      readabilityEvidence: readability ? renderReadabilityEvidence(readability) : null,
      settled,
    });

    const judge = PROMPT_REGISTRY.judge;
    const telemetry = { projectId, runId, node: 'judge', promptKey: judge.key, promptVersion: judge.version, role: 'judge', chapter };
    const model = await this.modelRouter.chatFor('judge', telemetry, route.project, route.policy, judge);
    const toolContext = { chapter, db: this.db, node: 'judge', projectId, retrieval: this.retrievalService, runId };
    const tools = this.toolRegistry.forNode('judge', toolContext);
    const rawTools = this.toolRegistry.getRaw('judge');
    const messages = [...(judge.fewShots ?? []), new SystemMessage(judge.system), new HumanMessage(task)];

    const ask = async () => {
      const { messages: answered } = await runToolLoop(model, tools, rawTools, messages, toolContext, this.db, { maxRounds: JUDGE_TOOL_ROUNDS });
      const last = [...answered].reverse().find(message => message.getType() === 'ai');
      return parseJudgeOutput(last ? (typeof last.content === 'string' ? last.content : JSON.stringify(last.content)) : '{}');
    };
    let output = await ask();
    if (!output) {
      this.logger.warn('judge answer unparseable — asking once more', { projectId, chapter, runId });
      output = await ask();
    }
    if (output) await this.modelRouter.screenOutput('judge', output, telemetry, route.project, route.policy);

    return judgeOutcome(source.body, {
      output,
      hasBrief: Boolean(brief),
      hasEndingContract: Boolean(writerBrief.endingContract),
      lockedFromReader,
      hiddenFromCast,
      leaks: lockedFromReader.length > 0 ? scanKnowledgeLeaks(source.body, lockedFromReader) : [],
    });
  }

  private async editorial({ projectId, chapter, source, brief, route, settled, runId }: ModelKindContext): Promise<ReviewOutcome> {
    const disclosure = await loadWriterDisclosurePolicy(this.db, projectId, chapter);
    const [pack, writerBrief] = await Promise.all([
      this.contextAssembler.forChapter(projectId, chapter, { policy: route.policy }),
      loadWriterBrief(this.db, projectId, chapter, brief, disclosure),
    ]);
    const review = PROMPT_REGISTRY.review;
    const chapterBrief = [brief ? writerBrief.chapterBrief : '(no plan was written for this chapter)', writerBrief.endingContract].filter(Boolean).join('\n\n');
    const output = (await this.modelRouter.structured(
      review,
      { contextPack: pack.rendered, chapterBrief, draftBody: source.body, settledFindings: renderSettledFindings(settled) },
      { projectId, runId, chapter, promptKey: review.key, promptVersion: review.version, role: review.key },
      route.project,
      route.policy,
    )) as ReviewOutput;
    return editorialOutcome(source.body, output, Boolean(brief));
  }

  private async mechanics(projectId: bigint, chapter: number, source: ReviewSource, project: Project.Row | undefined): Promise<ReviewOutcome> {
    const prior = await this.db.query.chapters.findMany({
      where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done'), eq(schema.chapters.isolated, false), lt(schema.chapters.number, chapter)),
      orderBy: [desc(schema.chapters.number)],
      limit: MECHANICAL_PRIOR_WINDOW,
      columns: { content: true },
    });
    const priorBodies = prior.map(row => row.content ?? '').filter(Boolean);
    return mechanicsOutcome(source.body, priorBodies, resolveWordTarget(project));
  }

  /** The chapter's content mode routes every role, a check included, so the override can only raise it. */
  private async chapterSetting(projectId: bigint, chapter: number, source: ReviewSource, override: Project.ContentMode | undefined): Promise<ChapterSetting> {
    const [project, brief] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }),
    ]);
    return { project, brief, mode: override === 'unrestricted' ? 'unrestricted' : chapterContentMode({ brief, isolated: source.isolated }) };
  }

  private routeFor(projectId: bigint, role: 'judge' | 'review', chapter: number, setting: ChapterSetting): Promise<CallRoute> {
    const deps = { pluginPolicy: this.pluginPolicy, modelRouter: this.modelRouter };
    return routeChapterCall(deps, projectId, { role, chapter, mode: setting.mode }, setting.project as ProjectConfig | undefined);
  }

  private async reviewableSource(projectId: bigint, chapter: number): Promise<ReviewSource> {
    const source = await this.findSource(projectId, chapter);
    if (!source) throw AppErrorCode.REV_006.create({ chapter: String(chapter) });
    if (source.generating) throw AppErrorCode.REV_007.create({ chapter: String(chapter) });
    return source;
  }

  private findSource(projectId: bigint, chapter: number): Promise<ReviewSource | null> {
    return findReviewedText(this.db, projectId, chapter);
  }

  private async findReview(projectId: bigint, chapter: number, reviewId: bigint): Promise<ReviewWithRemedies> {
    const review = await this.db.query.chapterReviews.findFirst({
      where: and(eq(schema.chapterReviews.id, reviewId), eq(schema.chapterReviews.projectId, projectId), eq(schema.chapterReviews.chapter, chapter)),
      with: { remedies: true },
    });
    if (!review) throw AppErrorCode.REV_001.create();
    return review;
  }

  private async answerable(
    projectId: bigint,
    chapter: number,
    reviewId: bigint,
    findingId: string,
  ): Promise<{ review: ReviewWithRemedies; finding: ChapterReviewFinding; source: ReviewSource }> {
    const [review, source] = await Promise.all([this.findReview(projectId, chapter, reviewId), this.findSource(projectId, chapter)]);
    const finding = review.findings.find(candidate => candidate.id === findingId);
    if (!finding) throw AppErrorCode.REV_002.create();
    if (!source || isReviewStale(review, source)) throw AppErrorCode.REV_003.create();
    return { review, finding, source };
  }

  /** The newest review that raised a finding decides whether the author's answer to it still stands, so a cleared answer stops carrying. */
  private async settledFindings(projectId: bigint, chapter: number, kind: Review.Kind, text: ReviewedText): Promise<SettledFinding[]> {
    const reviews = await this.db.query.chapterReviews.findMany({
      where: and(
        eq(schema.chapterReviews.projectId, projectId),
        eq(schema.chapterReviews.chapter, chapter),
        eq(schema.chapterReviews.kind, kind),
        sameRevision(text.draftRevision),
        eq(schema.chapterReviews.bodyHash, text.bodyHash),
      ),
      orderBy: [desc(schema.chapterReviews.createdAt), desc(schema.chapterReviews.id)],
      with: { remedies: true },
    });
    const decided = new Set<string>();
    const settled: SettledFinding[] = [];
    for (const review of reviews) {
      const remedyByFinding = new Map(review.remedies.map(remedy => [remedy.findingId, remedy]));
      for (const finding of review.findings) {
        if (decided.has(finding.fingerprint)) continue;
        decided.add(finding.fingerprint);
        const remedy = remedyByFinding.get(finding.id);
        if (remedy) settled.push({ fingerprint: finding.fingerprint, action: remedy.action, reason: remedy.reason, text: finding.text });
      }
    }
    return settled;
  }

  private async carrySettled(tx: PrimaryTransaction, review: Review.ChapterReview, settled: SettledFinding[]): Promise<Review.Remedy[]> {
    const byFingerprint = new Map(settled.map(finding => [finding.fingerprint, finding]));
    const carried = review.findings.flatMap(finding => {
      const prior = byFingerprint.get(finding.fingerprint);
      return prior ? [{ reviewId: review.id, findingId: finding.id, fingerprint: finding.fingerprint, action: prior.action, reason: prior.reason }] : [];
    });
    if (carried.length === 0) return [];
    return tx.insert(schema.chapterReviewRemedies).values(carried).returning();
  }

  /** Keeps the draft's own verdict in step, as the chapter list and the next-chapter gate read it, then gates on what is left open. */
  private async recordVerdictOnDraft(tx: PrimaryTransaction, review: ReviewWithRemedies, source: ReviewSource): Promise<void> {
    if (source.draftId === null || source.final) return;
    const verdict = (review.verdict ?? 'evaluation_failed') as Generation.JudgeVerdict;
    const judgeNote = review.findings.map(finding => `[${finding.severity === 'blocking' ? 'hard' : 'soft'}] ${finding.text}`).join('\n') || null;
    const [judged] = await tx.update(schema.drafts).set({ judge: verdict, judgeNote, updatedAt: new Date() }).where(draftAt(source)).returning({ id: schema.drafts.id });
    if (!judged) {
      this.logger.warn('draft changed during the review — the review stays bound to the text it read', { projectId: review.projectId, chapter: review.chapter });
      return;
    }
    await this.applyGate(tx, review, source);
  }

  /**
   * The gate reads the latest judge review of the text as it stands, re-read under the draft's row lock so two answers cannot both see the
   * other's finding as open. An open blocking finding holds the chapter as a contradiction — which resets an approval, so its provisional
   * reveals go too; none open lifts a contradiction to needs-review and never touches an approval. An older review is history and gates nothing.
   */
  private async applyGate(tx: PrimaryTransaction, review: Review.ChapterReview, source: ReviewSource): Promise<void> {
    if (source.draftId === null || source.final) return;
    const latest = await tx.query.chapterReviews.findFirst({
      where: and(eq(schema.chapterReviews.projectId, review.projectId), eq(schema.chapterReviews.chapter, review.chapter), eq(schema.chapterReviews.kind, 'judge')),
      orderBy: [desc(schema.chapterReviews.createdAt), desc(schema.chapterReviews.id)],
      columns: { id: true },
    });
    if (latest?.id !== review.id) return;
    const remedies = await tx.query.chapterReviewRemedies.findMany({ where: eq(schema.chapterReviewRemedies.reviewId, review.id) });
    const blocks = openFindings(review.findings, remedies).some(finding => finding.severity === 'blocking');
    if (!blocks) {
      await tx
        .update(schema.drafts)
        .set({ reviewStatus: 'needs_review', updatedAt: new Date() })
        .where(and(draftAt(source), eq(schema.drafts.reviewStatus, 'contradiction')));
      return;
    }
    const held = await tx
      .update(schema.drafts)
      .set({ reviewStatus: sql`'contradiction'::draft_review_status`, updatedAt: new Date() })
      .where(and(draftAt(source), ne(schema.drafts.reviewStatus, 'contradiction')))
      .returning({ id: schema.drafts.id });
    if (held.length > 0) await revokeProvisionalReveals(tx, review.projectId, review.chapter);
  }
}

async function lockDraft(tx: PrimaryTransaction, source: ReviewSource): Promise<void> {
  if (source.draftId === null || source.final) return;
  await tx.select({ id: schema.drafts.id }).from(schema.drafts).where(eq(schema.drafts.id, source.draftId)).for('update');
}

function draftAt(source: ReviewSource): SQL | undefined {
  return and(
    eq(schema.drafts.id, source.draftId ?? -1n),
    eq(schema.drafts.revision, source.draftRevision ?? -1),
    eq(schema.drafts.saveSeq, source.saveSeq ?? -1),
    ne(schema.drafts.status, 'final'),
    ne(schema.drafts.reviewStatus, 'generating'),
  );
}

function sameRevision(revision: number | null): SQL {
  return revision === null ? isNull(schema.chapterReviews.draftRevision) : eq(schema.chapterReviews.draftRevision, revision);
}

function uniqueFacts(facts: FactLike[]): FactLike[] {
  return [...new Map(facts.map(fact => [fact.factKey, fact])).values()];
}

function present(review: ReviewWithRemedies, source: ReviewedText | null): ChapterReviewView {
  const { projectId: _projectId, bodyHash: _bodyHash, remedies, findings, ...rest } = review;
  const remedyByFinding = new Map(remedies.map(remedy => [remedy.findingId, remedy]));
  const open = openFindings(findings, remedies);
  return {
    ...rest,
    stale: isReviewStale(review, source),
    findings: findings.map(({ fingerprint: _fingerprint, ...finding }) => {
      const remedy = remedyByFinding.get(finding.id);
      return { ...finding, remedy: remedy ? { action: remedy.action, reason: remedy.reason, updatedAt: remedy.updatedAt } : null };
    }),
    openFindings: open.length,
    openBlocking: open.filter(finding => finding.severity === 'blocking').length,
  };
}
