import { eq } from 'drizzle-orm';
import { AppError } from '@shadow-library/common';

import { commitFinalProse } from '@modules/ai/graphs/chapter-finalization.graph';
import { standardReadableDraft, standardReadableProse } from '@modules/ai/isolation-read-policy';
import { type ContinuityOutput } from '@modules/ai/schemas';
import { FinalizeReviewService } from '@modules/finalize-review/finalize-review.service';
import { canonicalJson, effectiveChange } from '@modules/finalize-review/finalize-review-items';
import { bridgedSummary, loadIsolationBridges } from '@modules/finalize-review/isolation-bridge';
import { ChapterAmendService } from '@modules/generation/chapter-amend.service';
import { DraftVersionService } from '@modules/generation/draft-versions.service';
import { GenerationService } from '@modules/generation/generation.service';
import { passageHash } from '@modules/generation/passage-anchor';
import { PassageRewriteService } from '@modules/generation/passage-rewrite.service';
import { loadArtifactStates } from '@modules/refinement/artifact-state';
import { type ChangeOp, changeSetRefs } from '@modules/refinement/change-set';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';
import { hashReviewedBody } from '@modules/review/review-findings';
import { findPlanRevealViolations, loadPlanState, milestonePlanStates, nextWritableChapter, sanitizeMarkdown } from '@server/common';
import { type FinalizeReview, schema } from '@server/database';

import { FakeAuthoringClaims } from '../jobs/authoring-claim-fixtures';
import { checkDisclosure } from './disclosure-invariants';
import { ENTITIES, MILESTONES, PLANNED_CHAPTERS, PROJECT_ID, seedNovel, TIMELINE_BODY, VEILED } from './integrity-novel';
import { integrityStore, type IntegrityStore } from './integrity-store';
import { SeededRandom } from './seeded-random';

type Row = Record<string, unknown>;
type Settled = { ok: true; value: unknown } | { ok: false; error: unknown };
type Outcome = { ok: true; value: unknown } | { ok: false; code: string };

/** A broken invariant: the message names it, and the sequence runner adds the seed and every step taken. */
export class InvariantViolation extends Error {}

interface ModelCall {
  id: number;
  prompt: string;
  chapter: number;
  resolve: (value: unknown) => void;
}

interface Flight {
  kind: 'revise' | 'review';
  chapter: number;
  call: ModelCall;
  outcome: Promise<Settled>;
  /** The draft row as the call read it before waiting on the model. */
  read: Row | undefined;
  reviewId?: bigint;
}

const P = PROJECT_ID;
const LOCATIONS = ['the lighthouse stair', 'the ferry landing', 'the salt market', 'the tide gate'];
const SUMMARIES = ['Ada keeps the harbour lamp through the storm.', 'Bram mends the ferry ropes at dawn.', 'The two keepers argue about the tide tables.'];
const BRIDGE_EDITS = ['Ada spent the night on watch and came back quiet.', 'Something passed between the keepers that neither will name.'];

const CHAT_REFUSALS = [
  'RFN_002',
  'RFN_003',
  'RFN_004',
  'RFN_005',
  'RFN_006',
  'RFN_007',
  'RFN_010',
  'PLN_001',
  'PLN_002',
  'PLN_003',
  'PLN_004',
  'PLN_005',
  'MIL_001',
  'MIL_003',
  'MIL_004',
  'FCT_001',
  'FCT_003',
  'FCT_006',
];

const settle = (promise: Promise<unknown>): Promise<Settled> =>
  promise.then(
    value => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
const stable = (value: unknown): string => canonicalJson(JSON.parse(JSON.stringify(value ?? null, (_, entry: unknown) => (typeof entry === 'bigint' ? `${entry}n` : entry))));
const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

function codeOf(error: unknown): string | undefined {
  if (error instanceof AppError) return error.code;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z]{2,4}_\d{3}$/.test(code) ? code : undefined;
}

function explain(error: unknown): string {
  return error instanceof Error ? `${error.constructor.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
}

/** The model router as the lifecycle sees it: every call waits until the sequence decides to answer it, in any order, unless an answer is set up front. */
class ModelDesk {
  readonly waiting: ModelCall[] = [];
  answer: ((prompt: string, vars: Row) => unknown) | null = null;
  private issued = 0;

  structured = (prompt: { key: string }, vars: Row, ctx: { chapter?: number }): Promise<unknown> => {
    const id = ++this.issued;
    if (this.answer) return Promise.resolve(this.answer(prompt.key, vars));
    return new Promise(resolve => this.waiting.push({ id, prompt: prompt.key, chapter: Number(ctx.chapter ?? 0), resolve }));
  };

  resolveModel = (): { provider: string; model: string } => ({ provider: 'fake', model: 'deepseek/deepseek-v4-pro' });

  get lastIssued(): number {
    return this.issued;
  }
}

class FakeJobs {
  readonly queued: { reviewId: string; chapter: number }[] = [];
  private issued = 0;

  enqueue = async (_projectId: bigint, _kind: string, target: string, payload: { reviewId: string }): Promise<string> => {
    this.queued.push({ reviewId: payload.reviewId, chapter: Number(target.replace('chapter-', '')) });
    return `00000000-0000-4000-8000-${String(++this.issued).padStart(12, '0')}`;
  };
}

/**
 * The finalization graph's own steps around the real commit: its guard (approved or resuming, next in sequence) and its cursor advance. A reviewed
 * chapter's continuity is applied by the commit itself, and an isolated one's is only staged, so the extraction nodes have nothing to do here.
 */
async function runFinalization(store: IntegrityStore, input: Row): Promise<{ status: string }> {
  const chapter = Number(input['chapter']);
  const project = store.rows(schema.projects)[0] as Row;
  const draft = store.rows(schema.drafts).find(row => row['chapter'] === chapter);
  if (!draft || (draft['reviewStatus'] !== 'approved' && draft['reviewStatus'] !== 'final')) throw AppError.internal(`[guard] chapter ${chapter} is not approved`);
  if (chapter !== Number(project['storyCurrentChapter'] ?? 0) + 1) throw AppError.internal(`[guard] chapter ${chapter} is not next in sequence`);
  await commitFinalProse(store.db as never, {
    projectId: String(input['projectId']),
    chapter,
    runId: `run-${chapter}`,
    draftId: String(input['draftId']),
    draftRevision: Number(input['draftRevision']),
    prose: String(input['prose']),
    summary: String(input['summary'] ?? ''),
    title: String(input['title'] ?? ''),
    generator: String(input['generator']),
    isolated: Boolean(input['isolated']),
  });
  const current = store.rows(schema.projects)[0] as Row;
  if (chapter > Number(current['storyCurrentChapter'] ?? 0))
    await store.db.update(schema.projects).set({ storyCurrentChapter: chapter, updatedAt: new Date() }).where(eq(schema.projects.id, PROJECT_ID));
  return { status: 'completed' };
}

export class IntegrityWorld {
  readonly store = integrityStore();
  readonly desk = new ModelDesk();
  readonly claims = new FakeAuthoringClaims();
  readonly jobs = new FakeJobs();
  readonly log: string[] = [];
  readonly generation: GenerationService;
  readonly reviews: FinalizeReviewService;
  readonly versions: DraftVersionService;
  readonly passages: PassageRewriteService;
  readonly amends: ChapterAmendService;
  readonly proposals: ProposalApplyService;
  private readonly flights: Flight[] = [];
  /** Bodies the author approved, by `draftId:revision`: a finalized or still-approved revision must hold exactly these. */
  private readonly approvedBodies = new Map<string, string>();
  /** Bridge summaries the author kept or edited, bound to the revision and text they were read from. */
  private readonly bridgeApprovals = new Set<string>();
  private readonly amended = new Set<number>();
  private heldToken: string | null = null;
  private generating: number | null = null;
  /** The disclosure inputs last checked: the policy is rebuilt only when what it reads has changed. */
  private disclosureChecked = '';
  private isolationChecked = '';
  private finalRevealsChecked = '';
  private readonly scrubbedPolicies = new Set<string>();
  private takes = 0;

  constructor(readonly rng: SeededRandom) {
    seedNovel(this.store);
    const database = { getPostgresClient: () => this.store.db } as never;
    const absent = {} as never;
    const contextAssembler = { forChapter: async () => ({ id: null, rendered: '', omitted: null }) };
    const pluginPolicy = { resolve: async () => ({ raised: false }) };
    const writerSnapshots = { onMessages: () => () => undefined };
    const executor = { dispatch: async () => undefined };
    const jobHandlers = { register: () => undefined };
    const indexing = { addProse: async () => undefined, deleteProse: async () => undefined };
    const workflow = { runChapterFinalization: (input: Row) => runFinalization(this.store, input) };
    this.generation = new GenerationService(
      database,
      workflow as never,
      this.desk as never,
      contextAssembler as never,
      absent,
      absent,
      indexing as never,
      this.jobs as never,
      executor as never,
      absent,
      { onChapterDeleted: async () => undefined } as never,
      pluginPolicy as never,
      absent,
      this.claims.asService(),
      writerSnapshots as never,
    );
    this.reviews = new FinalizeReviewService(database, this.desk as never, jobHandlers as never, this.generation);
    this.versions = new DraftVersionService(database);
    this.passages = new PassageRewriteService(database, this.desk as never, contextAssembler as never, pluginPolicy as never, writerSnapshots as never);
    this.amends = new ChapterAmendService(database, indexing as never);
    this.proposals = new ProposalApplyService(database, { has: () => false, get: () => undefined } as never);
  }

  private get project(): Row {
    return this.store.rows(schema.projects)[0] as Row;
  }

  private get cursor(): number {
    return Number(this.project['storyCurrentChapter'] ?? 0);
  }

  private drafts(): Row[] {
    return this.store.rows(schema.drafts);
  }

  private draft(chapter: number): Row | undefined {
    return this.drafts().find(row => row['chapter'] === chapter);
  }

  private copy(row: Row | undefined): Row | undefined {
    return row && structuredClone(row);
  }

  private prose(chapter: number, isolated: boolean): string {
    const take = ++this.takes;
    const veil = isolated ? `${VEILED} ` : '';
    return `${veil}Ada keeps watch over the harbour in chapter ${chapter}. ${veil}The tide turns late on take ${take}.`;
  }

  private violated(invariant: string, detail: unknown = ''): never {
    throw new InvariantViolation(`${invariant}${detail === '' ? '' : `: ${typeof detail === 'string' ? detail : stable(detail)}`}`);
  }

  private expect(condition: unknown, invariant: string, detail?: unknown): asserts condition {
    if (!condition) this.violated(invariant, detail);
  }

  /** Runs one service call; an AppError whose code the operation may answer with is a refusal, anything else breaks the sequence. */
  private async attempt(label: string, call: Promise<unknown>, allowed: readonly string[]): Promise<Outcome> {
    const settled = await settle(call);
    if (settled.ok) return settled;
    const code = codeOf(settled.error);
    if (!code || !allowed.includes(code)) this.violated(`${label} failed in a way it must not`, explain(settled.error));
    return { ok: false, code };
  }

  private expectUnchanged(before: number, label: string): void {
    if (this.store.writes() !== before) this.violated(`${label} was refused but still wrote to the store`, this.store.writtenSince(before));
  }

  private laterLive(chapter: number): Row[] {
    return this.drafts().filter(row => Number(row['chapter']) > chapter && row['status'] !== 'final');
  }

  private expectCascade(chapter: number, label: string): void {
    for (const later of this.laterLive(chapter)) {
      this.expect(later['staleReason'] !== null, `${label} of chapter ${chapter} left later chapter ${String(later['chapter'])} unmarked`);
      this.expect(later['reviewStatus'] !== 'approved', `${label} of chapter ${chapter} left later chapter ${String(later['chapter'])} approved`);
    }
  }

  private base(draft: Row | undefined, stale = false): { baseDraftId?: bigint; baseRevision?: number; baseSaveSeq?: number } {
    if (!draft) return {};
    return { baseDraftId: draft['id'] as bigint, baseRevision: Number(draft['revision']), baseSaveSeq: Number(draft['saveSeq']) - (stale ? 1 : 0) };
  }

  private async bridgeOf(chapter: number): Promise<{ summary: string | null; positions: unknown[] } | undefined> {
    const bridges = await loadIsolationBridges(this.store.db as never, P, [{ chapter, isolated: true }]);
    return bridges.get(chapter);
  }

  private anyChapter(): number {
    const written = this.drafts().map(row => Number(row['chapter']));
    return this.rng.pick([...written, ...written, this.cursor + 1, this.rng.int(1, Math.max(2, ...written) + 1)]);
  }

  private liveChapter(): number | undefined {
    const live = this.drafts().filter(row => row['status'] !== 'final');
    return live.length > 0 ? Number(this.rng.pick(live)['chapter']) : undefined;
  }

  async write(target?: number): Promise<string> {
    const next = await nextWritableChapter(this.store.db as never, P);
    const chapter = target ?? (this.rng.chance(0.15) ? next + 1 : this.rng.chance(0.4) ? next : this.anyChapter());
    const current = this.copy(this.draft(chapter));
    const mode = this.rng.weighted([
      ['current', 8],
      ['stale', 1],
      ['none', 1],
    ] as const);
    const body = this.prose(chapter, current?.['isolated'] === true);
    const before = this.store.writes();
    const outcome = await this.attempt(
      'hand save',
      this.generation.updateDraft(P, chapter, {
        body,
        ...(this.rng.chance(0.5) ? { summary: this.rng.pick(SUMMARIES) } : {}),
        ...(mode === 'none' ? {} : this.base(current, mode === 'stale')),
      }),
      ['DRF_001', 'DRF_002', 'DRF_013', 'DRF_018', 'DRF_019', 'DRF_020'],
    );
    if (!outcome.ok) {
      this.expectUnchanged(before, 'hand save');
      if (current?.['status'] === 'final') this.expect(outcome.code === 'DRF_002', 'a hand save over a final chapter must answer DRF_002', outcome.code);
      if (!current && chapter === next && this.generating !== chapter) this.violated('a new draft at the next writable chapter was refused', outcome.code);
      return `refused ${outcome.code} (ch ${chapter})`;
    }
    this.expect(current || chapter === next, `a new draft started at chapter ${chapter} while ${next} was next`);
    this.expectNotGenerating(chapter, 'a hand save', before);
    this.expect(current?.['status'] !== 'final', 'a final chapter took a hand save');
    const saved = this.draft(chapter) as Row;
    this.expect(saved['body'] === body, 'the hand save did not land');
    this.expect(saved['reviewStatus'] !== 'approved', 'an edited draft kept its approval', saved);
    this.expectCascade(chapter, 'a hand save');
    return `saved ch ${chapter} rev ${String(saved['revision'])}`;
  }

  async importIsolated(target?: number): Promise<string> {
    const next = await nextWritableChapter(this.store.db as never, P);
    const chapter = target ?? (this.rng.chance(0.6) ? next : this.anyChapter());
    const current = this.copy(this.draft(chapter));
    const before = this.store.writes();
    const outcome = await this.attempt(
      'isolated import',
      this.generation.importDraft(P, chapter, {
        prose: this.prose(chapter, true),
        summary: `${VEILED} ${this.rng.pick(SUMMARIES)}`,
        state: { mood: 'watchful' },
        isolated: true,
        ...this.base(current),
      }),
      ['DRF_001', 'DRF_002', 'DRF_013', 'DRF_018', 'DRF_019'],
    );
    if (!outcome.ok) {
      this.expectUnchanged(before, 'isolated import');
      return `refused ${outcome.code} (ch ${chapter})`;
    }
    this.expect(current || chapter === next, `an import started chapter ${chapter} while ${next} was next`);
    this.expectNotGenerating(chapter, 'an import', before);
    this.expect(this.draft(chapter)?.['isolated'] === true, 'an isolated import landed standard');
    this.expectCascade(chapter, 'an isolated import');
    return `imported isolated ch ${chapter}`;
  }

  async startNext(): Promise<string> {
    const next = await nextWritableChapter(this.store.db as never, P);
    const outcome = await this.attempt('write it myself', this.generation.startNextDraft(P), ['DRF_013', 'DRF_019']);
    if (!outcome.ok) return `refused ${outcome.code}`;
    this.expect((outcome.value as Row)['chapter'] === next, 'write-it-myself started a chapter other than the next writable one', {
      next,
      started: (outcome.value as Row)['chapter'],
    });
    return `started ch ${next}`;
  }

  async summarize(target?: number): Promise<string> {
    const chapter = target ?? this.anyChapter();
    const before = this.store.writes();
    const summary = this.rng.pick(SUMMARIES);
    const outcome = await this.attempt('summary save', this.generation.updateSummary(P, chapter, { summary }), ['DRF_001', 'DRF_013', 'DRF_019']);
    if (!outcome.ok) {
      this.expectUnchanged(before, 'summary save');
      return `refused ${outcome.code} (ch ${chapter})`;
    }
    const chapterRow = this.store.rows(schema.chapters).find(row => row['number'] === chapter);
    if (chapterRow) this.expect(chapterRow['summary'] === summary, 'a final chapter took a summary the chapter row did not');
    return `summary ch ${chapter}`;
  }

  async approve(target?: number): Promise<string> {
    const chapter = target ?? this.liveChapter() ?? this.anyChapter();
    const current = this.copy(this.draft(chapter));
    const stale = target === undefined && this.rng.chance(0.15);
    const keepStale = current?.['staleReason'] != null && this.rng.chance(0.5);
    const body = {
      draftId: (current?.['id'] as bigint | undefined) ?? 0n,
      revision: Number(current?.['revision'] ?? 0) - (stale ? 1 : 0),
      saveSeq: Number(current?.['saveSeq'] ?? 0),
      ...(keepStale ? { keepStale: true, staleReason: String(current?.['staleReason']) } : {}),
    };
    const before = this.store.writes();
    const outcome = await this.attempt('approval', this.generation.approveDraft(P, chapter, body), ['DRF_001', 'DRF_002', 'DRF_007', 'DRF_013', 'DRF_017', 'PLN_004']);
    if (!outcome.ok) {
      this.expectUnchanged(before, 'approval');
      if (stale && current && current['status'] !== 'final' && current['staleReason'] === null && outcome.code !== 'PLN_004')
        this.expect(outcome.code === 'DRF_013', 'an approval of an older revision must answer DRF_013', outcome.code);
      return `refused ${outcome.code} (ch ${chapter})`;
    }
    this.expect(current && !stale, 'an approval of a revision the author did not read went through');
    const approved = this.draft(chapter) as Row;
    this.expect(approved['reviewStatus'] === 'approved' && approved['approvedRevision'] === body.revision, 'the approval is not bound to the revision approved', approved);
    this.approvedBodies.set(`${String(approved['id'])}:${String(approved['revision'])}`, String(approved['body']));
    return `approved ch ${chapter} rev ${body.revision}`;
  }

  /** Takes the next step toward finalizing the chapter after the story's cursor, so sequences reach finalize, amend and revert often. */
  async nudge(): Promise<string> {
    if (this.heldToken && this.rng.chance(0.3)) return this.holdClaim();
    const chapter = this.cursor + (this.rng.chance(0.2) ? 2 : 1);
    const draft = this.draft(chapter);
    if (!draft) return this.rng.chance(0.3) ? this.importIsolated(chapter) : this.write(chapter);
    if (draft['isolated'] !== true && !draft['summary']) return this.summarize(chapter);
    if (draft['reviewStatus'] !== 'approved') return this.approve(chapter);
    const review = this.store.rows(schema.finalizeReviews).find(row => row['chapter'] === chapter && !row['bridgeOnly'] && row['draftRevision'] === draft['revision']);
    if (review?.['status'] === 'ready') {
      const open = this.store.rows(schema.finalizeReviewItems).some(item => item['reviewId'] === review['id'] && item['decision'] === null);
      return open ? this.decide(chapter) : this.finalize(chapter);
    }
    const flight = this.flights.findIndex(candidate => candidate.kind === 'review' && candidate.reviewId === review?.['id']);
    if (flight !== -1) return this.answerModel(flight);
    const queued = this.jobs.queued.findIndex(job => BigInt(job.reviewId) === review?.['id']);
    if (queued !== -1) return this.reviewStart(queued);
    return review ? this.reviewRetry(chapter) : this.finalize(chapter);
  }

  /** Starts a revise; it waits on the model until `answerModel` picks it, so later operations land while it is in flight. */
  async reviseStart(): Promise<string> {
    const chapter = this.rng.chance(0.8) ? (this.liveChapter() ?? this.anyChapter()) : this.anyChapter();
    const read = this.copy(this.draft(chapter));
    const issued = this.desk.lastIssued;
    const outcome = settle(this.generation.reviseDraft(P, chapter, { note: 'Let the tide scene breathe.' }));
    await tick();
    const call = this.desk.waiting.find(waiting => waiting.id > issued);
    if (!call) {
      const settled = await outcome;
      this.expect(!settled.ok, 'a revise finished without calling the model');
      const code = codeOf(settled.error);
      this.expect(code === 'DRF_001' || code === 'DRF_002', 'a revise was refused before the model call for the wrong reason', explain(settled.error));
      this.expect(!read || read['status'] === 'final', 'a live draft was refused a revise before the model call');
      return `revise refused ${code} (ch ${chapter})`;
    }
    this.expect(read && read['status'] !== 'final', 'a revise of a final or missing chapter reached the model');
    this.flights.push({ kind: 'revise', chapter, call, outcome, read });
    return `revise of ch ${chapter} waits on the model`;
  }

  async reviewStart(target?: number): Promise<string> {
    if (this.jobs.queued.length === 0) return 'no review queued';
    const index = target ?? this.rng.int(0, this.jobs.queued.length - 1);
    const [job] = this.jobs.queued.splice(index, 1);
    const reviewId = BigInt((job as { reviewId: string }).reviewId);
    const issued = this.desk.lastIssued;
    const outcome = settle(this.reviews.runJob({ payload: { reviewId: String(reviewId) } } as never));
    await tick();
    const call = this.desk.waiting.find(waiting => waiting.id > issued);
    if (!call) {
      const settled = await outcome;
      this.expect(settled.ok, 'a finalize review job failed before reading the prose', settled.ok ? '' : explain(settled.error));
      return `review ${String(reviewId)} had nothing to read`;
    }
    this.flights.push({ kind: 'review', chapter: call.chapter, call, outcome, read: this.copy(this.draft(call.chapter)), reviewId });
    return `review ${String(reviewId)} of ch ${call.chapter} waits on the model`;
  }

  /** Answers one waiting model call — any of them, not the oldest — and checks what its caller did with the answer. */
  async answerModel(target?: number): Promise<string> {
    if (this.flights.length === 0) return 'no model call waiting';
    const flight = this.flights.splice(target ?? this.rng.int(0, this.flights.length - 1), 1)[0] as Flight;
    this.desk.waiting.splice(this.desk.waiting.indexOf(flight.call), 1);
    const current = this.copy(this.draft(flight.chapter));
    const before = this.store.writes();
    if (flight.kind === 'review') {
      flight.call.resolve(this.extraction(flight.chapter, flight.read?.['isolated'] === true));
      const settled = await flight.outcome;
      this.expect(settled.ok, 'a finalize review job failed on its answer', settled.ok ? '' : explain(settled.error));
      const review = this.store.rows(schema.finalizeReviews).find(row => row['id'] === flight.reviewId);
      return `review ${String(flight.reviewId)} answered → ${String(review?.['status'] ?? 'gone')}`;
    }
    const isolated = flight.read?.['isolated'] === true;
    const revised = {
      title: 'Low Water',
      body: this.prose(flight.chapter, isolated),
      summary: `${isolated ? `${VEILED} ` : ''}${this.rng.pick(SUMMARIES)}`,
      state: isolated ? { mood: 'grim' } : undefined,
    };
    flight.call.resolve(revised);
    const settled = await flight.outcome;
    const unchanged = current !== undefined && current['id'] === flight.read?.['id'] && current['xmin'] === flight.read?.['xmin'] && current['status'] !== 'final';
    if (!settled.ok) {
      const code = codeOf(settled.error);
      this.expect(code === 'DRF_001' || code === 'DRF_002' || code === 'DRF_013', 'a revise that lost its race failed with the wrong error', explain(settled.error));
      this.expect(!unchanged, 'a revise of an untouched draft was refused', code);
      this.expectUnchanged(before, 'a revise that lost its race');
      return `revise of ch ${flight.chapter} discarded ${code}`;
    }
    this.expect(unchanged, 'a revise landed over a draft that moved while the model was writing', { read: flight.read?.['revision'], now: current?.['revision'] });
    const saved = this.draft(flight.chapter) as Row;
    this.expect(saved['body'] === revised.body && saved['revision'] === Number(flight.read?.['revision']) + 1, 'the revise did not land as the next revision');
    this.expect(saved['reviewStatus'] !== 'approved' && saved['isolated'] === isolated, 'a revised draft kept its approval or lost its isolation', saved);
    this.expectCascade(flight.chapter, 'a revise');
    return `revise of ch ${flight.chapter} landed rev ${String(saved['revision'])}`;
  }

  /** What the continuity model reads out of the revision it was given; an isolated one's evidence quotes its walled-off prose. */
  private extraction(chapter: number, isolated: boolean): ContinuityOutput {
    const brief = this.store.rows(schema.briefs).find(row => row['chapter'] === chapter);
    const claimed = (brief?.['claimedMilestones'] as string[] | null) ?? [];
    const unclaimed = MILESTONES.filter(key => !claimed.includes(key) && this.rng.chance(0.15));
    return {
      appeared: this.rng.subset([...ENTITIES]),
      newEntities: [],
      threads: [],
      mysteries: [],
      timeline: [],
      relationships: [],
      power: [],
      characterStates: [
        { entityKey: 'ada', location: this.rng.pick(LOCATIONS), evidence: isolated ? `${VEILED} quoted from the vigil` : 'Ada climbs the stair.' },
        ...(this.rng.chance(0.4) ? [{ entityKey: 'bram', location: this.rng.pick(LOCATIONS), conditions: ['tired'], evidence: 'Bram rests.' }] : []),
      ],
      knowledgeChanges: this.rng.chance(0.3) ? [{ entityKey: 'bram', factKey: 'tide_debt', how: 'overheard it at the ferry' }] : [],
      chapterSummary: this.rng.pick(SUMMARIES),
      milestones: [...claimed.map(milestoneKey => ({ milestoneKey, reached: this.rng.chance(0.7) })), ...unclaimed.map(milestoneKey => ({ milestoneKey, reached: true }))],
    } as ContinuityOutput;
  }

  async reviewRetry(target?: number): Promise<string> {
    const chapter = target ?? this.anyChapter();
    const outcome = await this.attempt('review re-prepare', this.reviews.prepare(P, chapter), ['FRV_001', 'FRV_004', 'FRV_011', 'DRF_001']);
    return outcome.ok ? `re-prepared ch ${chapter}` : `refused ${outcome.code} (ch ${chapter})`;
  }

  async decide(target?: number): Promise<string> {
    const ready = this.store.rows(schema.finalizeReviews).filter(row => row['status'] === 'ready');
    const withReviews = [...new Set((ready.length > 0 && this.rng.chance(0.85) ? ready : this.store.rows(schema.finalizeReviews)).map(row => Number(row['chapter'])))];
    if (target === undefined && withReviews.length === 0) return 'no review to answer';
    const chapter = target ?? this.rng.pick(withReviews);
    const view = await this.reviews.get(P, chapter);
    const items = [...view.consequential, ...view.routine];
    if (items.length === 0) return `review of ch ${chapter} has no items`;
    const open = items.filter(item => item.decision === null);
    const item = open.length > 0 && this.rng.chance(0.85) ? this.rng.pick(open) : this.rng.pick(items);
    const decision = this.rng.weighted([
      ['kept', 5],
      ['edited', 2],
      ['skipped', 2],
    ] as const);
    const request =
      decision === 'skipped'
        ? { decision, reason: this.rng.chance(0.9) ? 'not in this chapter' : undefined }
        : decision === 'edited'
          ? { decision, edited: this.patchFor(item.category) }
          : { decision };
    const before = this.store.writes();
    const outcome = await this.attempt('review decision', this.reviews.decide(P, chapter, item.id, request), [
      'FRV_002',
      'FRV_003',
      'FRV_004',
      'FRV_008',
      'FRV_009',
      'FRV_010',
      'FRV_011',
    ]);
    if (!outcome.ok) {
      this.expectUnchanged(before, 'review decision');
      return `refused ${outcome.code} (ch ${chapter})`;
    }
    const review = this.store.rows(schema.finalizeReviews).find(row => row['id'] === view.id) as Row;
    this.expect(review['status'] === 'ready', 'a decision landed on a review that is not open', review['status']);
    const stored = this.store.rows(schema.finalizeReviewItems).find(row => row['id'] === item.id) as Row;
    const change = effectiveChange(stored as never);
    if (review['isolated'] === true && change.category === 'summary' && (decision === 'kept' || decision === 'edited'))
      this.bridgeApprovals.add(`${chapter}|${String(review['draftRevision'])}|${String(review['sourceHash'])}|${change.text.trim()}`);
    return `${decision} ${item.category} on ch ${chapter}`;
  }

  private patchFor(category: FinalizeReview.Category): Record<string, unknown> {
    if (category === 'character_state') return { location: this.rng.pick(LOCATIONS) };
    if (category === 'milestone') return { reached: this.rng.chance(0.5) };
    if (category === 'summary') return { text: this.rng.pick(BRIDGE_EDITS) };
    if (category === 'knowledge') return { how: 'worked it out from the ledger' };
    return { note: 'edited' };
  }

  async keepRoutine(): Promise<string> {
    const chapter = this.anyChapter();
    const before = this.store.writes();
    const outcome = await this.attempt('keep routine', this.reviews.keepRoutine(P, chapter), ['FRV_001', 'FRV_002', 'FRV_003', 'FRV_004', 'FRV_011']);
    if (!outcome.ok) this.expectUnchanged(before, 'keep routine');
    return outcome.ok ? `kept routine on ch ${chapter}` : `refused ${outcome.code} (ch ${chapter})`;
  }

  async finalize(target?: number): Promise<string> {
    const approved = this.drafts()
      .filter(row => row['reviewStatus'] === 'approved')
      .map(row => Number(row['chapter']));
    const chapter = target ?? (this.rng.chance(0.6) ? this.cursor + 1 : approved.length > 0 && this.rng.chance(0.6) ? this.rng.pick(approved) : this.anyChapter());
    const current = this.copy(this.draft(chapter));
    const cursor = this.cursor;
    const before = this.store.writes();
    const outcome = await this.attempt('finalize', this.reviews.finalize(P, chapter), [
      'DRF_001',
      'DRF_002',
      'DRF_004',
      'DRF_007',
      'DRF_013',
      'FIN_001',
      'FIN_002',
      'FIN_003',
      'FIN_004',
      'FRV_002',
      'FRV_003',
      'FRV_004',
      'FRV_005',
      'FRV_006',
      'CHP_005',
      'CHP_010',
      'PLN_004',
      'JOB_002',
    ]);
    if (this.heldToken) this.expect(!outcome.ok && outcome.code === 'JOB_002', 'finalize ran while another job held the authoring claim', outcome);
    if (!outcome.ok) {
      this.expectUnchanged(before, 'finalize');
      return `refused ${outcome.code} (ch ${chapter})`;
    }
    this.expect(current && chapter === cursor + 1, `finalize committed chapter ${chapter} with the story at ${cursor}`);
    const final = this.draft(chapter) as Row;
    this.expect(final['status'] === 'final' && this.cursor === chapter, 'finalize did not make the chapter final and advance the story');
    this.expect(this.approvedBodies.get(`${String(final['id'])}:${String(final['revision'])}`) === final['body'], 'finalize committed prose the author did not approve');
    const applied = this.store.rows(schema.finalizeReviews).filter(row => row['chapter'] === chapter && row['status'] === 'applied' && !row['bridgeOnly']);
    this.expect(applied.length === 1 && applied[0]?.['draftRevision'] === final['revision'], 'finalize did not apply exactly the review of the committed revision', applied);
    return `finalized ch ${chapter}`;
  }

  async amend(): Promise<string> {
    const finals = this.drafts().filter(row => row['status'] === 'final');
    const chapter = finals.length > 0 && this.rng.chance(0.85) ? Number(this.rng.pick(finals)['chapter']) : this.anyChapter();
    const current = this.copy(this.draft(chapter));
    const content = this.prose(chapter, current?.['isolated'] === true);
    const before = this.store.writes();
    const outcome = await this.attempt('amend', this.amends.amend(P, chapter, { content }), ['CHP_001', 'CHP_006', 'DRF_013']);
    if (!outcome.ok) {
      this.expectUnchanged(before, 'amend');
      this.expect(current?.['status'] !== 'final', 'amend refused a final chapter', outcome.code);
      return `refused ${outcome.code} (ch ${chapter})`;
    }
    this.amended.add(chapter);
    const draft = this.draft(chapter) as Row;
    this.expect(
      draft['status'] === 'final' && draft['revision'] === Number(current?.['revision']) + 1,
      'amend did not carry the prose to the final draft as a new revision',
      draft,
    );
    if (draft['isolated'] === true) this.expect(!(await this.bridgeOf(chapter))?.summary, "an amended isolated chapter's old bridge still crosses");
    return `amended ch ${chapter}`;
  }

  async prepareBridge(): Promise<string> {
    const isolatedFinals = this.drafts().filter(row => row['status'] === 'final' && row['isolated'] === true);
    const chapter = isolatedFinals.length > 0 && this.rng.chance(0.8) ? Number(this.rng.pick(isolatedFinals)['chapter']) : this.anyChapter();
    const outcome = await this.attempt('bridge prepare', this.reviews.prepareBridge(P, chapter), ['DRF_001', 'BRG_001', 'BRG_002']);
    return outcome.ok ? `bridge staged for ch ${chapter}` : `refused ${outcome.code} (ch ${chapter})`;
  }

  async restore(): Promise<string> {
    const chapter = this.anyChapter();
    const current = this.copy(this.draft(chapter));
    const revisions = this.store.rows(schema.draftRevisions).filter(row => row['draftId'] === current?.['id']);
    const revision = revisions.length > 0 && this.rng.chance(0.9) ? Number(this.rng.pick(revisions)['revision']) : 99;
    const target = revisions.find(row => row['revision'] === revision);
    const base =
      current && this.rng.chance(0.5)
        ? { draftId: current['id'] as bigint, revision: Number(current['revision']), saveSeq: Number(current['saveSeq']) - (this.rng.chance(0.2) ? 1 : 0) }
        : undefined;
    const before = this.store.writes();
    const outcome = await this.attempt('restore', this.versions.restore(P, chapter, revision, base), ['DRF_001', 'DRF_013', 'DRF_019', 'VER_001', 'VER_002']);
    if (!outcome.ok) {
      this.expectUnchanged(before, 'restore');
      if (current?.['status'] === 'final') this.expect(outcome.code === 'VER_002', 'a restore of a final chapter must answer VER_002', outcome.code);
      return `refused ${outcome.code} (ch ${chapter})`;
    }
    this.expect(current?.['status'] !== 'final' && target, 'a final chapter or a missing version was restored');
    this.expectNotGenerating(chapter, 'a restore', before);
    const restored = this.draft(chapter) as Row;
    this.expect(restored['body'] === target['body'], 'the restore did not bring the version back');
    if (restored['revision'] !== current?.['revision']) {
      this.expect(restored['reviewStatus'] !== 'approved', 'a restored draft kept its approval');
      this.expect(!current?.['isolated'] || restored['isolated'] === true, 'a restore lifted isolation');
      this.expectCascade(chapter, 'a restore');
    }
    return `restored ch ${chapter} to rev ${revision}`;
  }

  async passage(): Promise<string> {
    const chapter = this.anyChapter();
    const current = this.copy(this.draft(chapter));
    if (!current || String(current['body']).length === 0) return `no prose to rewrite in ch ${chapter}`;
    const body = String(current['body']);
    const end = body.indexOf('.') + 1;
    if (end <= 0) return `no sentence to rewrite in ch ${chapter}`;
    const passage = body.slice(0, end);
    this.desk.answer = () => ({ replacement: 'The water holds its breath.' });
    const requested = await this.attempt(
      'passage request',
      this.passages.request(P, chapter, {
        base: { draftId: current['id'] as bigint, revision: Number(current['revision']), saveSeq: Number(current['saveSeq']) },
        start: 0,
        end,
        passageHash: passageHash(passage),
        request: 'Make it tense.',
      }),
      ['DRF_001', 'DRF_013', 'DRF_019', 'PSG_002', 'PSG_003', 'PSG_006'],
    ).finally(() => (this.desk.answer = null));
    if (!requested.ok) {
      if (current['status'] === 'final') this.expect(requested.code === 'PSG_006', 'a passage request on a final chapter must answer PSG_006', requested.code);
      return `request refused ${requested.code} (ch ${chapter})`;
    }
    const suggestion = requested.value as { id: bigint };
    if (this.rng.chance(0.3)) await this.write();
    const live = this.copy(this.draft(chapter));
    const base = live && this.rng.chance(0.5) ? { draftId: live['id'] as bigint, revision: Number(live['revision']), saveSeq: Number(live['saveSeq']) } : undefined;
    const before = this.store.writes();
    const outcome = await this.attempt('passage apply', this.passages.apply(P, chapter, suggestion.id, base), [
      'DRF_001',
      'DRF_013',
      'DRF_019',
      'PSG_001',
      'PSG_004',
      'PSG_005',
      'PSG_006',
    ]);
    if (!outcome.ok) {
      this.expectUnchanged(before, 'passage apply');
      if (live?.['status'] === 'final') this.expect(outcome.code === 'PSG_006', 'a passage apply on a final chapter must answer PSG_006', outcome.code);
      return `apply refused ${outcome.code} (ch ${chapter})`;
    }
    this.expect(live?.['status'] !== 'final', 'a passage was applied to a final chapter');
    this.expectNotGenerating(chapter, 'a passage rewrite', before);
    this.expect(String(live?.['body']).includes(passage), 'a passage applied where its text no longer stands');
    const applied = this.draft(chapter) as Row;
    this.expect(live?.['isolated'] !== true || applied['isolated'] === true, 'a passage rewrite lifted isolation');
    this.expect(String(applied['body']).includes('The water holds its breath.') && applied['reviewStatus'] !== 'approved', 'the passage did not land as an unapproved revision');
    this.expectCascade(chapter, 'a passage rewrite');
    return `passage applied in ch ${chapter}`;
  }

  async revert(): Promise<string> {
    const applied = this.store.rows(schema.finalizeReviews).filter(row => row['status'] === 'applied');
    const chapter = applied.length > 0 && this.rng.chance(0.85) ? Number(this.rng.pick(applied)['chapter']) : this.anyChapter();
    const review = this.copy(applied.find(row => row['chapter'] === chapter));
    const bridge = await this.bridgeOf(chapter);
    const before = this.store.writes();
    const outcome = await this.attempt('revert', this.reviews.revert(P, chapter), ['FRV_007', 'FRV_012', 'FRV_013']);
    if (!outcome.ok) {
      this.expectUnchanged(before, 'revert');
      if (review && chapter === this.cursor && outcome.code === 'FRV_012') this.violated('the latest final chapter was refused its revert as not the latest');
      return `refused ${outcome.code} (ch ${chapter})`;
    }
    this.expect(review && chapter >= this.cursor, 'a revert went through for a chapter that is not the latest final one');
    for (const item of (review['applied'] as { changes: { table: string; match: Record<string, string | number>; before: Row | null }[] }[] | null) ?? []) {
      for (const change of item.changes) {
        const now = await this.storedRow(change.table, change.match);
        const settled = (row: Row | null) =>
          row && Object.fromEntries(Object.entries(row).filter(([key]) => !(change.table === 'milestones' && ['state', 'plannedChapter', 'updatedAt'].includes(key))));
        this.expect(stable(settled(now)) === stable(settled(change.before)), `revert did not restore a ${change.table} row`, { now, before: change.before });
      }
    }
    this.expect(stable(await this.bridgeOf(chapter)) === stable(bridge), "revert changed the chapter's approved bridge");
    this.expectCascade(chapter, 'a revert');
    return `reverted ch ${chapter}`;
  }

  private async storedRow(table: string, match: Record<string, string | number>): Promise<Row | null> {
    const tables: Record<string, unknown> = {
      entities: schema.entities,
      entity_appearances: schema.entityAppearances,
      character_states: schema.characterStates,
      character_events: schema.characterEvents,
      character_knowledge: schema.characterKnowledge,
      milestones: schema.milestones,
      plot_threads: schema.plotThreads,
      mysteries: schema.mysteries,
      entity_relationships: schema.entityRelationships,
    };
    const found = this.store.rows(tables[table] as object).find(row => Object.entries(match).every(([key, value]) => String(row[key]) === String(value)));
    if (!found) return null;
    return Object.fromEntries(
      Object.entries(found).map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : value instanceof Date ? value.toISOString() : value]),
    );
  }

  /** Claims and learns for a chapter's plan: mostly ones the reveal rule and the single-claim rule allow, sometimes anything, so both sides are walked. */
  private planTerms(chapter: number): { claimedMilestones: string[] | null; learns: { entityKey: string; factKey: string }[] } {
    const facts = this.store.rows(schema.canonFacts);
    const milestones = this.store.rows(schema.milestones).map(row => String(row['milestoneKey']));
    if (this.rng.chance(0.25))
      return {
        claimedMilestones: this.rng.chance(0.4) ? null : this.rng.subset(milestones),
        learns: this.rng.subset(facts).map(fact => ({ entityKey: this.rng.pick(ENTITIES), factKey: String(fact['factKey']) })),
      };
    const briefs = this.store.rows(schema.briefs);
    const claimedElsewhere = (key: string) => briefs.some(brief => brief['chapter'] !== chapter && ((brief['claimedMilestones'] as string[] | null) ?? []).includes(key));
    const reached = this.store.rows(schema.milestones).filter(row => row['state'] === 'reached' && Number(row['reachedChapter']) <= chapter);
    const claimable = this.store.rows(schema.milestones).filter(row => row['state'] !== 'reached' && !claimedElsewhere(String(row['milestoneKey'])));
    const claims = this.rng.subset(claimable.map(row => String(row['milestoneKey'])));
    const earlierClaims = briefs.filter(brief => Number(brief['chapter']) < chapter).flatMap(brief => (brief['claimedMilestones'] as string[] | null) ?? []);
    const holding = new Set([...reached.map(row => String(row['milestoneKey'])), ...claims, ...earlierClaims]);
    const terms = (fact: Row) => ((fact['unlock'] as { all?: { milestone?: string }[] } | null)?.all ?? []).map(term => term.milestone);
    const learnable = facts.filter(fact => {
      const milestoneTerms = terms(fact);
      if (milestoneTerms.some(key => key === undefined || !holding.has(key))) return false;
      return fact['revealChapter'] === null ? milestoneTerms.length > 0 : Number(fact['revealChapter']) <= chapter;
    });
    return {
      claimedMilestones: claims.length > 0 || this.rng.chance(0.5) ? claims : null,
      learns: this.rng.subset(learnable).map(fact => ({ entityKey: this.rng.pick(ENTITIES), factKey: String(fact['factKey']) })),
    };
  }

  /** P4-8: a plan change to what an approved, unfinished chapter teaches or claims takes its approval away. */
  private expectPlanChangeResets(chapter: number, draft: Row | undefined, brief: Row | undefined): void {
    const now = this.store.rows(schema.briefs).find(row => row['chapter'] === chapter);
    const claims = (row: Row | undefined) => stable([...((row?.['claimedMilestones'] as string[] | null) ?? [])].sort());
    const learns = (row: Row | undefined) =>
      stable(
        ((row?.['knowledgeContract'] as { learns?: { entityKey: string; factKey: string }[] } | null)?.learns ?? []).map(learn => `${learn.entityKey}→${learn.factKey}`).sort(),
      );
    const changed = claims(brief) !== claims(now) || learns(brief) !== learns(now);
    if (draft?.['reviewStatus'] === 'approved' && draft['status'] !== 'final' && changed)
      this.expect(this.draft(chapter)?.['reviewStatus'] !== 'approved', `a plan change to what approved chapter ${chapter} teaches or claims left the approval standing`);
  }

  async planEdit(): Promise<string> {
    const chapter = this.rng.chance(0.7) ? this.rng.int(this.cursor + 1, PLANNED_CHAPTERS + 1) : this.rng.int(1, PLANNED_CHAPTERS + 1);
    const draft = this.copy(this.draft(chapter));
    const brief = this.copy(this.store.rows(schema.briefs).find(row => row['chapter'] === chapter));
    const { claimedMilestones, learns } = this.planTerms(chapter);
    const before = this.store.writes();
    const outcome = await this.attempt(
      'plan edit',
      this.generation.updateBrief(P, chapter, { body: `Chapter ${chapter}: the keepers hold the harbour.`, claimedMilestones, knowledgeContract: { pov: ['ada'], learns } }),
      ['PLN_001', 'PLN_002', 'PLN_003', 'PLN_005', 'BRF_004'],
    );
    if (!outcome.ok) {
      this.expectUnchanged(before, 'plan edit');
      if (chapter <= this.cursor) this.expect(outcome.code === 'PLN_005', 'a plan edit behind the story must answer PLN_005', outcome.code);
      return `refused ${outcome.code} (ch ${chapter})`;
    }
    this.expect(chapter > this.cursor, 'a finalized chapter took a plan edit');
    this.expectPlanChangeResets(chapter, draft, brief);
    return `plan ch ${chapter} claims ${stable(claimedMilestones)} learns ${learns.length}`;
  }

  /** Stages a chat change-set the way a turn leaves one: a plan edit, a new milestone with the secret it unlocks, a milestone removal, or a mix. */
  async chatStage(): Promise<string> {
    const chapter = this.rng.chance(0.8) ? this.rng.int(this.cursor + 1, PLANNED_CHAPTERS + 1) : this.rng.int(1, PLANNED_CHAPTERS + 1);
    const serial = ++this.takes;
    const kind = this.rng.weighted([
      ['plan', 4],
      ['milestone', 3],
      ['remove', 1],
    ] as const);
    const milestoneKey = `harbour_saved_${serial}`;
    const ops: ChangeOp[] =
      kind === 'remove'
        ? [{ op: 'milestone.remove', milestoneKey: this.rng.pick(this.store.rows(schema.milestones).map(row => String(row['milestoneKey']))) }]
        : kind === 'milestone'
          ? [
              { op: 'milestone.upsert', milestoneKey, label: 'The harbour is saved', kind: 'custom' },
              {
                op: 'fact.upsert',
                factKey: `harbour_price_${serial}`,
                body: `The harbour was bought back with a salt bargain, the ${serial}th of its kind.`,
                terms: [`salt bargain ${serial}`],
                revealChapter: null,
                unlock: { all: [{ milestone: milestoneKey }] },
              },
              ...(this.rng.chance(0.5)
                ? [
                    {
                      op: 'brief.update' as const,
                      chapter,
                      claimedMilestones: [milestoneKey],
                      knowledgeContract: { pov: ['ada'], learns: [{ entityKey: 'ada', factKey: `harbour_price_${serial}` }] },
                    },
                  ]
                : []),
            ]
          : [this.planOp(chapter)];
    const baseline = await loadArtifactStates(this.store.db as never, P, changeSetRefs(ops));
    const [row] = this.store.seed(schema.refinementProposals, [{ projectId: P, kind: 'chat', status: 'pending', changeSet: ops, baseline, summary: null, messageId: null }]);
    return `staged proposal ${String(row?.['id'])}: ${ops.map(op => op.op).join(' + ')}`;
  }

  private planOp(chapter: number): ChangeOp {
    const { claimedMilestones, learns } = this.planTerms(chapter);
    return { op: 'brief.update', chapter, claimedMilestones, knowledgeContract: { pov: ['ada'], learns } };
  }

  async chatApply(): Promise<string> {
    const pending = this.store.rows(schema.refinementProposals).filter(row => row['status'] === 'pending');
    if (pending.length === 0) return 'no proposal pending';
    const proposal = this.copy(this.rng.pick(pending)) as Row;
    const plans = (proposal['changeSet'] as ChangeOp[]).flatMap(op => (op.op === 'brief.update' ? [op.chapter] : []));
    const touched = plans.map(chapter => ({
      chapter,
      draft: this.copy(this.draft(chapter)),
      brief: this.copy(this.store.rows(schema.briefs).find(row => row['chapter'] === chapter)),
    }));
    const before = this.store.writes();
    const outcome = await this.attempt('chat apply', this.proposals.apply(P, proposal['id'] as bigint), CHAT_REFUSALS);
    if (!outcome.ok) {
      const flipped = this.store.rows(schema.refinementProposals).find(row => row['id'] === proposal['id'])?.['status'] === 'conflicted';
      if (!flipped) this.expectUnchanged(before, 'chat apply');
      else
        this.expect(
          stable(this.store.writtenSince(before)) === stable(['refinement_proposals']),
          'a conflicted proposal wrote more than its own status',
          this.store.writtenSince(before),
        );
      if (plans.some(chapter => chapter <= this.cursor)) this.expect(outcome.code !== 'RFN_002', 'a pending proposal was refused as not pending');
      return `apply refused ${outcome.code}`;
    }
    for (const { chapter, draft, brief } of touched) {
      this.expect(chapter > this.cursor, 'a chat proposal changed the plan of a finalized chapter');
      this.expectPlanChangeResets(chapter, draft, brief);
    }
    return `applied proposal ${String(proposal['id'])}`;
  }

  async chatUndo(): Promise<string> {
    const applied = this.store.rows(schema.refinementProposals).filter(row => row['status'] === 'applied');
    if (applied.length === 0) return 'no proposal to undo';
    const proposal = this.copy(this.rng.pick(applied)) as Row;
    const before = this.store.writes();
    const outcome = await this.attempt('chat undo', this.proposals.revert(P, proposal['id'] as bigint), CHAT_REFUSALS);
    if (!outcome.ok) {
      this.expectUnchanged(before, 'chat undo');
      return `undo refused ${outcome.code}`;
    }
    return `undid proposal ${String(proposal['id'])}`;
  }

  async deleteDraft(): Promise<string> {
    const chapter = this.anyChapter();
    const current = this.copy(this.draft(chapter));
    const before = this.store.writes();
    const outcome = await this.attempt('delete', this.generation.deleteDraft(P, chapter), ['DRF_001', 'DRF_002']);
    if (!outcome.ok) {
      this.expectUnchanged(before, 'delete');
      return `refused ${outcome.code} (ch ${chapter})`;
    }
    this.expect(current && current['status'] !== 'final' && !this.draft(chapter), 'a final or missing draft was deleted');
    this.expectCascade(chapter, 'a delete');
    return `deleted ch ${chapter}`;
  }

  /** A generate job starts or finishes: it holds the authoring claim and writes the chapter after the story's cursor while it runs. */
  async holdClaim(): Promise<string> {
    if (this.heldToken) {
      await this.claims.release(P, this.heldToken);
      await this.store.db.delete(schema.jobs).where(eq(schema.jobs.kind, 'generate'));
      this.heldToken = null;
      this.generating = null;
      return 'background job released the authoring claim';
    }
    this.heldToken = (await this.claims.acquire(P, 'job-background', 'generate')) ?? null;
    this.expect(this.heldToken, 'a free authoring claim could not be taken');
    this.generating = this.cursor + 1;
    this.store.seed(schema.jobs, [{ projectId: P, kind: 'generate', target: String(this.generating), status: 'in_progress' }]);
    return `background job holds the authoring claim, writing ch ${this.generating}`;
  }

  private expectNotGenerating(chapter: number, label: string, before: number): void {
    if (this.store.writes() === before) return;
    this.expect(this.generating !== chapter, `${label} wrote chapter ${chapter} while a generate job was writing it`);
  }

  async passTime(): Promise<string> {
    for (const row of this.store.rows(schema.draftRevisions)) row['recent'] = false;
    return 'the autosave fold window passed';
  }

  async copyPlannerPage(): Promise<string> {
    const docs = this.store.rows(schema.bibleDocuments);
    if (this.rng.chance(0.5)) {
      const slug = `copied-notes-${docs.length}`;
      this.store.seed(schema.bibleDocuments, [{ projectId: P, section: 'world', slug, frontmatter: { title: 'Notes' }, body: TIMELINE_BODY }]);
      return `copied the timeline page to world/${slug}`;
    }
    const timeline = docs.find(row => row['section'] === 'project' && row['slug'] === 'timeline');
    if (timeline)
      await this.store.db
        .update(schema.bibleDocuments)
        .set({ frontmatter: { title: `Timeline, renamed ${docs.length}` } })
        .where(eq(schema.bibleDocuments.id, timeline['id'] as bigint));
    return 'renamed the timeline page';
  }

  async checkInvariants(): Promise<void> {
    this.checkFinality();
    this.checkApprovals();
    this.checkReviews();
    await this.checkMilestones();
    this.checkKnowledgeLedger();
    await this.checkFinalReveals();
    await this.checkIsolation();
    this.checkClaims();
    const chapter = await nextWritableChapter(this.store.db as never, P);
    const tables = [schema.projects, schema.briefs, schema.milestones, schema.canonFacts, schema.characterKnowledge, schema.bibleDocuments, schema.volumes, schema.chapters];
    const inputs = `${chapter}:${this.store.stamp(tables)}`;
    if (inputs !== this.disclosureChecked) await checkDisclosure(this.store, chapter, this.scrubbedPolicies, this.violated.bind(this));
    this.disclosureChecked = inputs;
  }

  private checkFinality(): void {
    const done = this.store.rows(schema.chapters).filter(row => row['status'] === 'done');
    const numbers = done.map(row => Number(row['number'])).sort((left, right) => left - right);
    this.expect(stable(numbers) === stable(Array.from({ length: this.cursor }, (_, index) => index + 1)), 'finalized chapters are not exactly 1..cursor', {
      numbers,
      cursor: this.cursor,
    });
    for (const draft of this.drafts()) {
      const chapter = done.find(row => row['number'] === draft['chapter']);
      if (draft['status'] !== 'final') {
        this.expect(!chapter, `chapter ${String(draft['chapter'])} is done while its draft is not final`);
        continue;
      }
      this.expect(draft['reviewStatus'] === 'final' && chapter?.['locked'] === true, `final chapter ${String(draft['chapter'])} is not locked`);
      this.expect(chapter['content'] === sanitizeMarkdown(String(draft['body'])), `final chapter ${String(draft['chapter'])} holds prose its draft does not`);
      this.expect(chapter['isolated'] === draft['isolated'], `final chapter ${String(draft['chapter'])} disagrees with its draft on isolation`);
      if (!this.amended.has(Number(draft['chapter'])))
        this.expect(
          this.approvedBodies.get(`${String(draft['id'])}:${String(draft['revision'])}`) === draft['body'],
          `final chapter ${String(draft['chapter'])} holds unapproved prose`,
        );
    }
  }

  private checkApprovals(): void {
    for (const draft of this.drafts()) {
      if (draft['status'] === 'final' || draft['reviewStatus'] !== 'approved') continue;
      const chapter = String(draft['chapter']);
      this.expect(draft['approvedRevision'] === draft['revision'], `chapter ${chapter} is approved at a revision it no longer stands at`, draft);
      this.expect(draft['staleReason'] === null, `chapter ${chapter} is approved and stale at once`);
      this.expect(
        this.approvedBodies.get(`${String(draft['id'])}:${String(draft['revision'])}`) === draft['body'],
        `chapter ${chapter} is approved over prose the author did not approve`,
      );
    }
  }

  private checkReviews(): void {
    const reviews = this.store.rows(schema.finalizeReviews);
    const items = this.store.rows(schema.finalizeReviewItems);
    for (const review of reviews) {
      if (review['status'] !== 'applied' && review['status'] !== 'reverted') continue;
      this.expect(!review['bridgeOnly'], 'a bridge-only review applied Story Bible updates');
      const kept = items.filter(item => item['reviewId'] === review['id'] && (item['decision'] === 'kept' || item['decision'] === 'edited')).map(item => String(item['id']));
      const logged = ((review['applied'] as { itemId: string }[] | null) ?? []).map(entry => entry.itemId);
      this.expect(stable([...logged].sort()) === stable([...kept].sort()), `review ${String(review['id'])} did not apply its kept items exactly once`, { kept, logged });
    }
    const appliedChapters = reviews.filter(review => review['status'] === 'applied').map(review => review['chapter']);
    this.expect(new Set(appliedChapters).size === appliedChapters.length, 'a chapter holds two applied reviews');
  }

  private async checkMilestones(): Promise<void> {
    const items = this.store.rows(schema.finalizeReviewItems);
    const reachedBy = new Map<string, { chapter: number; revision: number }>();
    for (const review of this.store.rows(schema.finalizeReviews).filter(row => row['status'] === 'applied')) {
      for (const entry of (review['applied'] as { itemId: string; changes: { table: string; match: Row; after: Row | null }[] }[] | null) ?? []) {
        for (const change of entry.changes.filter(candidate => candidate.table === 'milestones' && candidate.after?.['state'] === 'reached')) {
          const key = String(change.match['milestoneKey']);
          const item = items.find(row => String(row['id']) === entry.itemId);
          const reach = item && effectiveChange(item as never);
          this.expect(
            item && (item['decision'] === 'kept' || item['decision'] === 'edited') && reach?.category === 'milestone' && reach.reached && reach.milestoneKey === key,
            `review ${String(review['id'])} reached milestone ${key} through an item the author did not keep as reached`,
            item,
          );
          reachedBy.set(key, { chapter: Number(review['chapter']), revision: Number(review['draftRevision']) });
        }
      }
    }
    const derived = milestonePlanStates({ plans: this.store.rows(schema.briefs), milestones: this.store.rows(schema.milestones) } as never);
    for (const milestone of this.store.rows(schema.milestones)) {
      const key = String(milestone['milestoneKey']);
      if (milestone['state'] === 'reached') {
        const reach = reachedBy.get(key);
        this.expect(reach, `milestone ${key} is reached without a kept reach in an applied review`);
        this.expect(
          milestone['reachedChapter'] === reach.chapter && milestone['boundRevision'] === reach.revision,
          `milestone ${key} is bound to another chapter or revision than its reach`,
          milestone,
        );
        continue;
      }
      const expected = derived.get(key);
      this.expect(
        expected !== undefined && expected.state === milestone['state'] && (expected.plannedChapter ?? null) === (milestone['plannedChapter'] ?? null),
        `milestone ${key} disagrees with the plans`,
        {
          stored: [milestone['state'], milestone['plannedChapter']],
          expected,
        },
      );
    }
  }

  /** What a finalized chapter revealed stays backed by what it needed: its plan's reveals hold for as long as the chapter is history. */
  private async checkFinalReveals(): Promise<void> {
    const stamp = this.store.stamp([schema.projects, schema.briefs, schema.milestones, schema.canonFacts, schema.volumes, schema.chapters]);
    if (stamp === this.finalRevealsChecked) return;
    this.finalRevealsChecked = stamp;
    const state = await loadPlanState(this.store.db as never, P);
    for (const plan of state.plans.filter(candidate => candidate.chapter <= this.cursor)) {
      const violations = findPlanRevealViolations(plan, state.facts, state);
      this.expect(violations.length === 0, `final chapter ${plan.chapter} reveals what no longer holds there`, violations);
    }
  }

  private checkKnowledgeLedger(): void {
    for (const row of this.store.rows(schema.characterKnowledge)) {
      if (row['source'] !== 'brief') continue;
      const draft = this.draft(Number(row['learnedInChapter']));
      if (row['status'] === 'provisional') {
        this.expect(
          draft && draft['status'] !== 'final' && draft['reviewStatus'] === 'approved' && draft['revision'] === row['draftRevision'],
          `a provisional reveal of chapter ${String(row['learnedInChapter'])} outlived the approval it was bound to`,
          { row, draft },
        );
      } else this.expect(draft?.['status'] === 'final', `a committed reveal of chapter ${String(row['learnedInChapter'])} has no final chapter behind it`);
    }
  }

  private async checkIsolation(): Promise<void> {
    const stamp = this.store.stamp([schema.drafts, schema.draftRevisions, schema.chapters, schema.finalizeReviews, schema.finalizeReviewItems, schema.entities]);
    if (stamp === this.isolationChecked) return;
    this.isolationChecked = stamp;
    for (const draft of this.drafts()) {
      const chapter = Number(draft['chapter']);
      if (`${String(draft['body'])} ${String(draft['summary'])}`.includes(VEILED))
        this.expect(draft['isolated'] === true, `chapter ${chapter} holds isolated prose on a standard draft`);
      if (draft['isolated'] !== true) continue;
      const bridge = await this.bridgeOf(chapter);
      const readable = stable(
        standardReadableDraft({ ...draft, body: String(draft['body']), summary: (draft['summary'] as string | null) ?? null, isolated: true }, bridge as never),
      );
      this.expect(!readable.includes(VEILED), `chapter ${chapter}'s isolated prose reaches a standard read`);
      const chapterRow = this.store.rows(schema.chapters).find(row => row['number'] === chapter);
      if (chapterRow)
        this.expect(
          !standardReadableProse(chapterRow as never, bridge?.summary ?? null).includes(VEILED) && !String(bridgedSummary(chapterRow as never, bridge as never)).includes(VEILED),
          `final chapter ${chapter}'s isolated prose reaches a standard read`,
        );
      if (!bridge?.summary) continue;
      const bound = `${chapter}|${String(draft['revision'])}|${hashReviewedBody(String(draft['body']))}|${bridge.summary}`;
      this.expect(this.bridgeApprovals.has(bound), `chapter ${chapter}'s bridge crosses with a summary the author did not approve for its current text`, bridge);
    }
    for (const row of this.store.rows(schema.draftRevisions))
      if (String(row['body']).includes(VEILED)) this.expect(row['isolated'] === true, 'an isolated version is stored as standard');
    for (const row of this.store.rows(schema.chapters))
      if (`${String(row['content'])} ${String(row['summary'])}`.includes(VEILED)) this.expect(row['isolated'] === true, 'a final chapter holds isolated prose as standard');
    for (const review of this.store.rows(schema.finalizeReviews)) {
      if (review['isolated'] !== true && this.draft(Number(review['chapter']))?.['isolated'] !== true) continue;
      const view = await this.reviews.get(P, Number(review['chapter']));
      this.expect(!stable(view).includes(VEILED), `the review of isolated chapter ${String(review['chapter'])} shows its prose`);
    }
  }

  private checkClaims(): void {
    const holders = [...this.claims.rows.values()];
    this.expect(holders.length === (this.heldToken ? 1 : 0), 'an authoring claim leaked past the action that took it', holders);
  }

  /** Answers every call still waiting, so a sequence ends with nothing in flight and every late answer checked. */
  async drain(): Promise<void> {
    while (this.flights.length > 0) {
      this.log.push(`drain: ${await this.answerModel()}`);
      await this.checkInvariants();
    }
  }
}

export type OperationName =
  | 'nudge'
  | 'write'
  | 'importIsolated'
  | 'startNext'
  | 'summarize'
  | 'approve'
  | 'reviseStart'
  | 'reviewStart'
  | 'answerModel'
  | 'reviewRetry'
  | 'decide'
  | 'keepRoutine'
  | 'finalize'
  | 'amend'
  | 'prepareBridge'
  | 'restore'
  | 'passage'
  | 'revert'
  | 'planEdit'
  | 'chatStage'
  | 'chatApply'
  | 'chatUndo'
  | 'deleteDraft'
  | 'holdClaim'
  | 'passTime'
  | 'copyPlannerPage';

/** How often each operation is drawn: the path to a finalized chapter (write, approve, read the review, answer it, finalize) dominates. */
export const OPERATION_WEIGHTS: readonly (readonly [OperationName, number])[] = [
  ['nudge', 90],
  ['write', 14],
  ['importIsolated', 4],
  ['startNext', 2],
  ['summarize', 3],
  ['approve', 12],
  ['reviseStart', 5],
  ['reviewStart', 10],
  ['answerModel', 10],
  ['reviewRetry', 1],
  ['decide', 16],
  ['keepRoutine', 3],
  ['finalize', 10],
  ['amend', 3],
  ['prepareBridge', 2],
  ['restore', 4],
  ['passage', 4],
  ['revert', 3],
  ['planEdit', 5],
  ['chatStage', 4],
  ['chatApply', 6],
  ['chatUndo', 2],
  ['deleteDraft', 2],
  ['holdClaim', 2],
  ['passTime', 1],
  ['copyPlannerPage', 1],
];
