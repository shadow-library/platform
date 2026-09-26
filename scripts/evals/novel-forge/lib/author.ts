import { log } from '../../../utils/index.ts';
import { errorMessage, EvalError } from './errors.ts';
import { type ForgeApi } from './forge-api.ts';
import { type CostTier, type Draft, type FinalizeReview, type Job, type Proposal, type RunUsage, type TurnRequest, type TurnTrace } from './forge.types.ts';
import { type OutputSink, type TurnKind } from './output.ts';

export interface AuthorOptions {
  runLabel: string;
  tier: CostTier | null;
  jobTimeoutMs: number;
  pollMs: number;
}

export interface OrganiseOutcome {
  offered: boolean;
  jobId?: string;
  job?: Job;
  appliedProposalId?: string;
  cardProposalId?: string;
  receipt?: Record<string, unknown>;
}

export interface CapturedRun {
  kind: TurnKind;
  chapter?: number;
  usage: RunUsage;
}

export interface FinalizeOutcome {
  review: FinalizeReview;
  flags: string[];
  finalized: boolean;
}

/** The web's first turn for a novel started with notes (`apps/novel-forge-web/src/lib/start-novel.ts`), sent verbatim as a real author's first message. */
export const NOTES_OPENER = 'Here are my notes for the story. Organise them into my Story Bible, then ask me about the rest.';

const TERMINAL_JOB: ReadonlySet<string> = new Set(['done', 'failed', 'cancelled']);

function actionIndex(proposal: Proposal | undefined, op: string): number {
  return proposal?.changeSet.findIndex(entry => entry.op === op) ?? -1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Drives Forge the way the web does, timing every step it takes and recording each run's model calls before the project can be deleted. */
export class Author {
  readonly captured: CapturedRun[] = [];

  constructor(
    readonly api: ForgeApi,
    private readonly sink: OutputSink,
    private readonly options: AuthorOptions,
  ) {}

  get tier(): CostTier | null {
    return this.options.tier;
  }

  async turn(projectId: string, sessionId: string, content: string, extra: Omit<TurnRequest, 'content'> = {}): Promise<TurnTrace> {
    const request: TurnRequest = { content, ...extra, ...(this.options.tier ? { costTier: this.options.tier } : {}) };
    const started = performance.now();
    try {
      const trace = await this.api.turn(projectId, sessionId, request);
      this.timing('chat_turn', trace.totalMs, true, { projectId, runId: trace.result.runId });
      let previous = 0;
      for (const at of trace.lookupAtMs) {
        this.timing('lookup_round', at - previous, true, { projectId, runId: trace.result.runId });
        previous = at;
      }
      await this.captureRun(projectId, trace.result.runId, 'chat_turn');
      return trace;
    } catch (error) {
      this.timing('chat_turn', performance.now() - started, false, { projectId });
      throw error;
    }
  }

  /** Accepts one action card the way an author clicks it, and waits for the durable job it starts. */
  async runAction(projectId: string, proposal: Proposal, op: string, kind: TurnKind, chapter?: number): Promise<Job | null> {
    const index = actionIndex(proposal, op);
    if (index < 0) return null;
    const applied = await this.api.applyProposal(projectId, proposal.id, [index]);
    const started = applied.jobs.find(job => job.index === index) ?? applied.jobs[0];
    if (!started) throw new EvalError(`applying ${op} on proposal ${proposal.id} started no job`);
    return this.waitJob(projectId, started.jobId, kind, chapter, started.runId);
  }

  /** Waits for a job that is setup rather than a measured author action, such as an import. */
  async settle(jobId: string): Promise<Job> {
    const deadline = Date.now() + this.options.jobTimeoutMs;
    let job = await this.api.getJob(jobId);
    while (!TERMINAL_JOB.has(job.status)) {
      if (Date.now() > deadline) throw new EvalError(`job ${jobId} still ${job.status} after ${this.options.jobTimeoutMs} ms`);
      await Bun.sleep(this.options.pollMs);
      job = await this.api.getJob(jobId);
    }
    return job;
  }

  async waitJob(projectId: string, jobId: string, kind: TurnKind, chapter?: number, runId?: string): Promise<Job> {
    const started = performance.now();
    const job = await this.settle(jobId);
    this.timing(kind, performance.now() - started, job.status === 'done', { projectId, jobId, runId, chapter, attempts: job.attempts });
    if (runId) await this.captureRun(projectId, runId, kind, chapter);
    else await this.captureJobRuns(projectId, jobId, kind, chapter);
    return job;
  }

  async organise(projectId: string, sessionId: string): Promise<OrganiseOutcome> {
    const trace = await this.turn(projectId, sessionId, NOTES_OPENER);
    const proposal = trace.result.proposal;
    if (actionIndex(proposal, 'action.organise_notes') < 0 || !proposal) return { offered: false };
    const job = await this.runAction(projectId, proposal, 'action.organise_notes', 'organise');
    if (!job) return { offered: false };
    const progress = isRecord(job.progress) ? job.progress : {};
    return {
      offered: true,
      jobId: job.id,
      job,
      appliedProposalId: typeof progress['appliedProposalId'] === 'string' ? progress['appliedProposalId'] : undefined,
      cardProposalId: typeof progress['proposalId'] === 'string' ? progress['proposalId'] : undefined,
      receipt: isRecord(progress['organised']) ? progress['organised'] : undefined,
    };
  }

  /** Asks the chat to plan the chapter, accepts the plan action, then accepts the plan card it stages. Returns false when the chat never offered it. */
  async planChapter(projectId: string, sessionId: string, chapter: number, intent?: string): Promise<boolean> {
    const trace = await this.turn(projectId, sessionId, `Plan chapter ${chapter}.${intent ? ` I know what happens: ${intent}` : ''}`);
    const proposal = trace.result.proposal;
    if (!proposal) return false;
    const job = await this.runAction(projectId, proposal, 'action.plan_chapter', 'plan', chapter);
    if (!job || job.status !== 'done') return false;
    const cardId = isRecord(job.progress) && typeof job.progress['proposalId'] === 'string' ? job.progress['proposalId'] : undefined;
    if (!cardId) return false;
    await this.api.applyProposal(projectId, cardId);
    return true;
  }

  async writeChapter(projectId: string, chapter: number): Promise<Draft> {
    const { jobId } = await this.api.generate(projectId);
    const job = await this.waitJob(projectId, jobId, 'write', chapter);
    if (job.status !== 'done') throw new EvalError(`writing chapter ${chapter} ended ${job.status}: ${job.lastError ?? 'no error recorded'}`);
    const draft = await this.api.getDraft(projectId, chapter);
    if (!draft) throw new EvalError(`writing chapter ${chapter} finished but left no draft`);
    return draft;
  }

  /** Approve, wait for the finalize review, keep everything it found (an author trusting the review), then finalize. */
  async approveAndFinalize(projectId: string, draft: Draft): Promise<FinalizeOutcome> {
    await this.api.approveDraft(projectId, draft);
    const review = await this.awaitReview(projectId, draft.chapter);
    const flags = [...review.consequential, ...review.routine].flatMap(item => (item.flag ? [item.flag] : []));
    const current = review.routine.some(item => !item.decision) ? await this.api.keepRoutine(projectId, draft.chapter) : review;
    for (const item of current.consequential.filter(entry => !entry.decision)) await this.api.decideReviewItem(projectId, draft.chapter, item.id, 'kept');
    const started = performance.now();
    try {
      const run = await this.api.finalizeReviewed(projectId, draft.chapter);
      this.timing('finalize', performance.now() - started, true, { projectId, runId: run.runId, chapter: draft.chapter });
      await this.captureRun(projectId, run.runId, 'finalize', draft.chapter);
    } catch (error) {
      this.timing('finalize', performance.now() - started, false, { projectId, chapter: draft.chapter });
      log.warn(`finalize of chapter ${draft.chapter} failed: ${errorMessage(error)}`);
      return { review, flags, finalized: false };
    }
    const after = await this.api.getDraft(projectId, draft.chapter);
    return { review, flags, finalized: after?.status === 'final' };
  }

  /** Every call any action made against the chapter, write through finalize — the authoritative "model calls per chapter". */
  async recordChapterCost(projectId: string, chapter: number, mode: string): Promise<void> {
    try {
      const cost = await this.api.chapterCost(projectId, chapter);
      this.sink.recordChapterCost({
        runLabel: this.options.runLabel,
        target: this.api.target,
        projectId,
        chapter,
        tier: this.options.tier,
        mode,
        calls: cost.totals.calls,
        costUsd: cost.totals.costUsd,
      });
    } catch (error) {
      log.warn(`could not read the cost of chapter ${chapter}: ${errorMessage(error)}`);
    }
  }

  async captureRun(projectId: string, runId: string, kind: TurnKind, chapter?: number): Promise<void> {
    try {
      const usage = await this.api.runUsage(projectId, runId);
      this.captured.push({ kind, chapter, usage });
      this.sink.recordCalls({
        runLabel: this.options.runLabel,
        kind,
        target: this.api.target,
        projectId,
        runId,
        graph: usage.graph,
        chapter,
        durationMs: usage.totals.durationMs ?? null,
        calls: usage.calls,
      });
    } catch (error) {
      log.warn(`could not read usage for run ${runId}: ${errorMessage(error)}`);
    }
  }

  private async captureJobRuns(projectId: string, jobId: string, kind: TurnKind, chapter?: number): Promise<void> {
    try {
      const runs = await this.api.listRuns(projectId);
      for (const run of runs.filter(entry => entry.jobId === jobId)) await this.captureRun(projectId, run.id, kind, chapter);
    } catch (error) {
      log.warn(`could not list runs for job ${jobId}: ${errorMessage(error)}`);
    }
  }

  private async awaitReview(projectId: string, chapter: number): Promise<FinalizeReview> {
    const started = performance.now();
    const deadline = Date.now() + this.options.jobTimeoutMs;
    let retried = false;
    for (;;) {
      const review = await this.api.getFinalizeReview(projectId, chapter);
      if (review.status === 'ready') {
        this.timing('finalize_review', performance.now() - started, true, { projectId, chapter });
        return review;
      }
      if (review.status === 'failed' && !retried) {
        retried = true;
        await this.api.prepareFinalizeReview(projectId, chapter);
      } else if (review.status !== 'preparing' || Date.now() > deadline) {
        this.timing('finalize_review', performance.now() - started, false, { projectId, chapter });
        throw new EvalError(`finalize review of chapter ${chapter} is ${review.status}${review.error ? `: ${review.error}` : ''}`);
      }
      await Bun.sleep(this.options.pollMs);
    }
  }

  private timing(kind: TurnKind, ms: number, ok: boolean, extra: { projectId?: string; runId?: string; jobId?: string; chapter?: number; attempts?: number }): void {
    this.sink.recordTiming({ runLabel: this.options.runLabel, kind, ms: Math.round(ms), ok, tier: this.options.tier, target: this.api.target, ...extra });
  }
}
