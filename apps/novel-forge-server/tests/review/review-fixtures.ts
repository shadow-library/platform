import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { scopedCostTier } from '@modules/ai/cost-tier-scope';
import { PRODUCTION_DEFAULTS, type ResolvedModel, UNRESTRICTED_DEFAULTS } from '@modules/ai/defaults';
import { ChapterReviewService } from '@modules/review/chapter-review.service';
import { AppErrorCode } from '@server/classes';
import { type Review, schema } from '@server/database';

import { matchesWhere } from '../sql-filter';

export interface ReviewDraftRow {
  id: bigint;
  projectId: bigint;
  chapter: number;
  revision: number;
  saveSeq: number;
  status: 'draft' | 'final';
  reviewStatus: 'generating' | 'needs_review' | 'contradiction' | 'approved';
  body: string;
  isolated: boolean;
}

export interface RecordedWrite {
  table: unknown;
  kind: 'insert' | 'upsert' | 'update' | 'delete' | 'lock';
  values?: unknown;
  where?: SQL;
  /** Whether a draft update's predicate matched the draft as it then stood. */
  landed?: boolean;
}

export interface ModelCall {
  role: string;
  contentMode: string | undefined;
  costTier: string | undefined;
  prompt: string;
}

export interface ReviewFakeOptions {
  draft?: ReviewDraftRow | null;
  finalChapter?: { content: string; isolated: boolean } | null;
  brief?: Record<string, unknown> | null;
  project?: Record<string, unknown>;
  facts?: Record<string, unknown>[];
  judgeAnswer?: object | string;
  editorialAnswer?: object;
  /** The draft moved on while the model was reading it, so the revision-bound draft update matches nothing. */
  draftMoved?: boolean;
  /** An autosave folds new text into the revision while the model reads it: same revision, next save sequence. */
  foldWhileReading?: boolean;
  /** The model the unrestricted route resolves, to try one off the allowlist. */
  unrestrictedModel?: ResolvedModel;
  /** The writer's required material is over its limits, so an enforcing pack request fails. */
  overCaps?: boolean;
  /** What the run's telemetry recorded for its model call. */
  recordedCall?: { provider: string; model: string; tier: string; contentMode: string };
  /** The status of the job an enqueue returned, to model one deduplicated onto a job already running. */
  jobStatus?: string;
  /** The run an earlier attempt of a review job opened. */
  priorRun?: { id: string };
}

export type ReviewRow = Review.ChapterReview & { remedies: Review.Remedy[] };

export interface ReviewHarness {
  service: ChapterReviewService;
  reviews: ReviewRow[];
  writes: RecordedWrite[];
  modelCalls: ModelCall[];
  policyBaselines: (string | null | undefined)[];
  enqueued: unknown[][];
  settledRuns: unknown[][];
  runRegisteredJob: (job: object) => Promise<void>;
  editDraft: (revision: number, body?: string) => void;
  writesTo: (table: unknown, kind?: RecordedWrite['kind']) => RecordedWrite[];
}

export const CHAPTER_BODY =
  'Mara counted the lanterns on the quay twice. The harbour master watched her from the customs door, his ledger shut. "Nine," she said. "There were ten last night."';

const dialect = new PgDialect();

export function render(where: SQL | undefined): { sql: string; params: unknown[] } {
  return where ? dialect.sqlToQuery(where) : { sql: '', params: [] };
}

export function reviewDraft(overrides: Partial<ReviewDraftRow> = {}): ReviewDraftRow {
  return { id: 11n, projectId: 1n, chapter: 4, revision: 2, saveSeq: 0, status: 'draft', reviewStatus: 'needs_review', body: CHAPTER_BODY, isolated: false, ...overrides };
}

function promptText(messages: BaseMessage[] | Record<string, unknown>): string {
  if (!Array.isArray(messages)) return JSON.stringify(messages);
  return messages.map(message => (typeof message.content === 'string' ? message.content : JSON.stringify(message.content))).join('\n');
}

export function reviewHarness(options: ReviewFakeOptions = {}): ReviewHarness {
  let draft = options.draft === undefined ? reviewDraft() : options.draft;
  const reviews: ReviewRow[] = [];
  const writes: RecordedWrite[] = [];
  const modelCalls: ModelCall[] = [];
  const policyBaselines: (string | null | undefined)[] = [];
  const enqueued: unknown[][] = [];
  const settledRuns: unknown[][] = [];
  let handler: ((job: object) => Promise<void>) | undefined;
  let nextId = 100n;

  const reviewById = (id: unknown) => reviews.find(review => review.id === id);
  const insertReview = (values: Record<string, unknown>): ReviewRow => {
    const row = { id: nextId++, createdAt: new Date(), remedies: [], ...values } as unknown as ReviewRow;
    reviews.unshift(row);
    return row;
  };
  const upsertRemedy = (values: Record<string, unknown>): Review.Remedy => {
    const review = reviewById(values['reviewId']);
    const remedy = { id: nextId++, reason: null, createdAt: new Date(), updatedAt: new Date(), ...values } as Review.Remedy;
    if (review) review.remedies = [...review.remedies.filter(existing => existing.findingId !== remedy.findingId), remedy];
    return remedy;
  };
  const awaitableRows = (rows: unknown[]) => Object.assign(Promise.resolve(undefined), { returning: async () => rows });
  const findReview = async (query?: { where?: SQL }) => {
    const { sql, params } = render(query?.where);
    return sql.startsWith('("chapter_reviews"."id" = $1') ? reviewById(params[0]) : reviews[0];
  };

  const db = {
    query: {
      drafts: { findFirst: async () => draft ?? undefined },
      chapters: { findFirst: async () => options.finalChapter ?? undefined, findMany: async () => [] },
      projects: { findFirst: async () => ({ id: 1n, contentMode: 'standard', ...options.project }) },
      briefs: { findFirst: async () => options.brief ?? undefined },
      canonFacts: { findMany: async () => options.facts ?? [] },
      characterKnowledge: { findMany: async () => [] },
      bibleDocuments: { findMany: async () => [] },
      volumes: { findMany: async () => [] },
      modelCalls: { findFirst: async () => options.recordedCall },
      workflowRuns: { findFirst: async () => options.priorRun },
      chapterReviews: { findMany: async () => [...reviews], findFirst: findReview },
      chapterReviewRemedies: { findMany: async (query: { where: SQL }) => reviewById(render(query.where).params[0])?.remedies ?? [] },
    },
    select: () => ({
      from: (table: unknown) => ({
        where: (where: SQL) => ({
          for: async () => {
            writes.push({ table, kind: 'lock', where });
            return [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        const write: RecordedWrite = { table, kind: 'insert', values };
        writes.push(write);
        return {
          returning: async () => {
            if (table === schema.chapterReviews) return [insertReview(values as Record<string, unknown>)];
            if (table === schema.chapterReviewRemedies) return (values as Record<string, unknown>[]).map(upsertRemedy);
            return [];
          },
          onConflictDoUpdate: async () => {
            write.kind = 'upsert';
            upsertRemedy(values as Record<string, unknown>);
          },
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: SQL) => {
          const landed = table === schema.drafts && !options.draftMoved && draft !== null && matchesWhere({ ...draft }, where);
          writes.push({ table, kind: 'update', values, where, ...(table === schema.drafts ? { landed } : {}) });
          return awaitableRows(landed ? [{ id: 11n }] : []);
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (where: SQL) => {
        writes.push({ table, kind: 'delete', where });
        if (table === schema.chapterReviewRemedies) {
          const [reviewId, findingId] = render(where).params;
          const review = reviewById(reviewId);
          if (review) review.remedies = review.remedies.filter(remedy => remedy.findingId !== findingId);
        }
        return awaitableRows([]);
      },
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };

  const record = (role: string, project: { contentMode?: string } | undefined, prompt: string) =>
    modelCalls.push({ role, contentMode: project?.contentMode, costTier: scopedCostTier(), prompt });
  const judgeAnswer = options.judgeAnswer ?? { verdict: 'consistent', findings: [], readabilityCompliance: { compliant: true, issues: [] } };
  const routed = (role: string, project?: { contentMode?: string }) =>
    project?.contentMode === 'unrestricted' ? (options.unrestrictedModel ?? UNRESTRICTED_DEFAULTS[role as 'judge']) : PRODUCTION_DEFAULTS[role as 'judge'];
  const modelRouter = {
    resolveModel: (role: string, project?: { contentMode?: string }) => routed(role, project),
    routeModel: (role: string, project?: { contentMode?: string }) => ({
      resolved: routed(role, project),
      source: 'tier',
      costTier: scopedCostTier() ?? 'balanced',
      contentMode: project?.contentMode === 'unrestricted' ? 'unrestricted' : 'standard',
    }),
    screenOutput: async () => undefined,
    chatFor: async (role: string, _ctx: unknown, project?: { contentMode?: string }) => ({
      invoke: async (messages: BaseMessage[]) => {
        record(role, project, promptText(messages));
        if (options.foldWhileReading && draft) draft = { ...draft, saveSeq: draft.saveSeq + 1, body: `${draft.body} She counted again.` };
        return new AIMessage(typeof judgeAnswer === 'string' ? judgeAnswer : JSON.stringify(judgeAnswer));
      },
    }),
    structured: async (module: { key: string }, input: Record<string, unknown>, _ctx: unknown, project?: { contentMode?: string }) => {
      record(module.key, project, promptText(input));
      return options.editorialAnswer ?? { disposition: 'approve', findings: [] };
    },
  };
  const pluginPolicy = {
    resolve: async (_projectId: bigint, _call: unknown, baseline?: { contentMode?: string | null }) => {
      policyBaselines.push(baseline?.contentMode);
      const permissive = baseline?.contentMode === 'unrestricted';
      return { writerClass: permissive ? 'permissive' : 'standard', raised: false };
    },
  };
  const workflowRuns = {
    createRun: async () => 'run-queued',
    settleJobRuns: async (...args: unknown[]) => void settledRuns.push(args),
    runChain: async (_projectId: bigint, _graph: string, _target: string, _input: unknown, fn: (runId: string) => Promise<unknown>) => ({
      runId: 'run-1',
      result: await fn('run-1'),
    }),
  };
  const contextAssembler = {
    forChapter: async (_projectId: bigint, _chapter: number, opts?: { enforceWriterReservations?: boolean }) => {
      if (options.overCaps && opts?.enforceWriterReservations) throw AppErrorCode.CTX_002.create({ detail: 'the chapter plan is over its limit' });
      return { rendered: 'CANON: the harbour keeps ten lanterns.' };
    },
  };
  const jobService = { enqueue: async (...args: unknown[]) => (enqueued.push(args), 'job-1'), get: async () => ({ status: options.jobStatus ?? 'pending' }) };
  const jobExecutor = { dispatch: async () => undefined };
  const jobHandlers = {
    register: (_kind: string, registered: (job: object) => Promise<void>) => {
      handler = registered;
    },
  };

  const service = new ChapterReviewService(
    { getPostgresClient: () => db } as never,
    workflowRuns as never,
    modelRouter as never,
    contextAssembler as never,
    { forNode: () => [], getRaw: () => [] } as never,
    {} as never,
    pluginPolicy as never,
    jobService as never,
    jobExecutor as never,
    jobHandlers as never,
  );

  return {
    service,
    reviews,
    writes,
    modelCalls,
    policyBaselines,
    enqueued,
    settledRuns,
    runRegisteredJob: async job => {
      service.onModuleInit();
      await handler?.(job);
    },
    editDraft: (revision: number, body = `${CHAPTER_BODY} She rewrote the count.`) => {
      if (draft) draft = { ...draft, revision, body };
    },
    writesTo: (table: unknown, kind?: RecordedWrite['kind']) => writes.filter(write => write.table === table && (!kind || write.kind === kind)),
  };
}
