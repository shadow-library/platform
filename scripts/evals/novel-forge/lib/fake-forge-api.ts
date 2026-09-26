import { EvalError, ForgeApiError } from './errors.ts';
import { type ForgeApi, type ProjectUpdate } from './forge-api.ts';
import {
  type ApplyResult,
  type BibleDoc,
  type BibleDocItem,
  type BriefInput,
  type ChangeOp,
  type ChapterCost,
  type ChatMessage,
  type ChatMode,
  type ChatSession,
  type ContentMode,
  type Draft,
  type DraftInput,
  type Entity,
  type EntityInput,
  type Fact,
  type FactInput,
  type FinalizeReview,
  type IsolationBridge,
  type Job,
  type MilestoneInput,
  type ModelCall,
  type NovelBundle,
  type Project,
  type ProjectCost,
  type Proposal,
  type Quota,
  type RunListItem,
  type RunUsage,
  type TurnRequest,
  type TurnTrace,
  type Volume,
  type WriterSnapshot,
  type WriterSnapshotSummary,
} from './forge.types.ts';
import { paragraphs, wordCount } from './text.ts';

interface FakeBrief extends BriefInput {
  chapter: number;
  revision: number;
}

interface FakeJob extends Job {
  projectId: string;
  polls: number;
  runId: string;
  complete: (jobId: string) => Record<string, unknown> | undefined;
}

interface FakeProject {
  project: Project;
  notes: string;
  sessions: Map<string, ChatSession>;
  entities: Map<string, Entity>;
  facts: Map<string, Fact>;
  docs: Map<string, BibleDoc>;
  volumes: Volume[];
  briefs: Map<number, FakeBrief>;
  drafts: Map<number, Draft>;
  reviews: Map<number, FakeReview>;
  bridges: Map<number, IsolationBridge>;
  snapshots: Map<number, WriterSnapshot[]>;
  proposals: Map<string, Proposal>;
  runs: Map<string, RunUsage>;
  chapterRuns: Map<number, string[]>;
}

interface FakeReview extends FinalizeReview {
  polls: number;
}

const ORGANISE_MIN_WORDS = 600;
const HEDGE = /\b(if|maybe|perhaps|might|could|what if|not sure|wonder|suppose)\b|\?/i;
const NEGATION = /\b(not|no|never|don't|doesn't|isn't)\b/i;
const SARCASM = /\b(oh sure|why not|yeah right)\b/i;
const QUOTED = /["“”]/;

/**
 * An in-process stand-in for Novel Forge used by `--dry-run`. It follows the product's rules closely enough to exercise every harness path
 * — quote-rule auto-apply, action cards, durable jobs, finalize review, isolation bridges and writer snapshots — with no network and no model.
 * Its "model" is deterministic text assembly, so a dry run proves the harness wiring, never the product's quality.
 */
export class FakeForgeApi implements ForgeApi {
  readonly target = 'fake://novel-forge';
  private readonly projects = new Map<string, FakeProject>();
  private readonly jobs = new Map<string, FakeJob>();
  private sequence = 0;

  /** `faulty` breaks every rule a suite gates on — auto-applies hedges, approves on request, leaks isolated prose and secrets — to prove the detectors fire. */
  constructor(private readonly options: { faulty?: boolean } = {}) {}

  async whoami(): Promise<void> {
    return undefined;
  }

  async createNovel(title: string, notes: string | undefined, contentMode: ContentMode = 'standard'): Promise<{ projectId: string; sessionId: string }> {
    const state = this.newProject(title, notes ?? '', contentMode);
    const session = await this.createSession(state.project.id, 'auto');
    return { projectId: state.project.id, sessionId: session.id };
  }

  async importNovel(bundle: NovelBundle): Promise<{ projectId: string; jobId: string }> {
    const state = this.newProject(bundle.novel.title, '', 'standard');
    state.project.brief = bundle.novel.synopsis;
    let chapter = 0;
    for (const volume of bundle.volumes) {
      for (const entry of volume.chapters) {
        chapter += 1;
        state.drafts.set(chapter, this.draft(chapter, entry.title, entry.content, false, 'final'));
      }
    }
    const job = this.job(state.project.id, 'import', () => ({ chapters: chapter }));
    return { projectId: state.project.id, jobId: job.id };
  }

  async getProject(projectId: string): Promise<Project> {
    return { ...this.state(projectId).project };
  }

  async updateProject(projectId: string, update: ProjectUpdate): Promise<Project> {
    Object.assign(this.state(projectId).project, update);
    return this.getProject(projectId);
  }

  async deleteProject(projectId: string): Promise<void> {
    this.projects.delete(projectId);
  }

  async createSession(projectId: string, mode: ChatMode): Promise<ChatSession> {
    const session: ChatSession = { id: `session-${this.next()}`, mode };
    this.state(projectId).sessions.set(session.id, session);
    return { ...session };
  }

  async getSession(projectId: string, sessionId: string): Promise<ChatSession> {
    const session = this.state(projectId).sessions.get(sessionId);
    if (!session) throw new ForgeApiError('GET', `/chat/sessions/${sessionId}`, 404, 'CHT_001', 'session not found');
    return { ...session };
  }

  async putNotes(projectId: string, notes: string): Promise<void> {
    this.state(projectId).notes = notes;
  }

  async turn(projectId: string, sessionId: string, request: TurnRequest): Promise<TurnTrace> {
    const state = this.state(projectId);
    const session = await this.getSession(projectId, sessionId);
    const runId = this.run(state, 'chat-turn', request.costTier ?? state.project.costTier, 'chat');
    const cards: ChangeOp[] = [];
    const direct: ChangeOp[] = [];
    const content = request.content;
    const planMatch = /^plan chapter (\d+)/i.exec(content);

    if (content.startsWith('Here are my notes')) {
      if (wordCount(state.notes) >= ORGANISE_MIN_WORDS) cards.push({ op: 'action.organise_notes' });
      else direct.push({ op: 'premise.update', brief: state.notes, quote: state.notes.split('.')[0] ?? '' });
    } else if (planMatch) cards.push({ op: 'action.plan_chapter', chapter: Number(planMatch[1]) });
    else if (/\bapprove\b/i.test(content)) cards.push({ op: 'action.approve_draft', chapter: 1 });
    else if (/\bfinali[sz]e\b/i.test(content)) cards.push({ op: 'action.finalize' });
    else if (/\b(delete|remove)\b/i.test(content)) cards.push({ op: 'entity.remove', entityKey: 'syndicate' });
    else if (/\bunrestricted\b|\bmanual mode\b/i.test(content)) cards.push({ op: 'brief.update', chapter: 2, contentMode: 'unrestricted' });
    else if (request.justDiscussing || HEDGE.test(content) || NEGATION.test(content) || SARCASM.test(content) || QUOTED.test(content) || /\bundo\b/i.test(content))
      cards.push({ op: 'entity.upsert', entityKey: `idea-${this.next()}`, notes: content });
    else if (session.mode === 'auto') direct.push({ op: /\btheme\b/i.test(content) ? 'premise.update' : 'entity.upsert', notes: content, quote: content });

    if (this.options.faulty) {
      direct.push(...cards.filter(op => op.op === 'entity.upsert'));
      if (/\bapprove\b/i.test(content)) {
        const draft = state.drafts.get(1);
        if (draft) draft.approvedRevision = draft.revision;
      }
    }
    const proposal = cards.length > 0 ? this.proposal(state, sessionId, 'chat', cards, false, runId) : undefined;
    const appliedProposal = direct.length > 0 ? this.proposal(state, sessionId, 'chat', direct, true, runId) : undefined;
    if (appliedProposal) this.applyOps(state, appliedProposal.changeSet);
    const message = (role: string, text: string): ChatMessage => ({ id: String(this.next()), ordinal: this.sequence, role, content: text, runId });
    return {
      result: { userMessage: message('user', content), assistantMessage: message('assistant', 'Noted.'), proposal, appliedProposal, runId },
      totalMs: 0,
      lookupAtMs: [0],
    };
  }

  async getProposal(projectId: string, proposalId: string): Promise<Proposal> {
    const proposal = this.state(projectId).proposals.get(proposalId);
    if (!proposal) throw new ForgeApiError('GET', `/proposals/${proposalId}`, 404, 'PRP_001', 'proposal not found');
    return structuredClone(proposal);
  }

  async listProposals(projectId: string, sessionId: string): Promise<Proposal[]> {
    return [...this.state(projectId).proposals.values()].filter(proposal => proposal.sessionId === sessionId).map(proposal => structuredClone(proposal));
  }

  async applyProposal(projectId: string, proposalId: string, opIndexes?: number[]): Promise<ApplyResult> {
    const state = this.state(projectId);
    const proposal = state.proposals.get(proposalId);
    if (!proposal) throw new ForgeApiError('POST', `/proposals/${proposalId}/apply`, 404, 'PRP_001', 'proposal not found');
    const indexes = opIndexes ?? proposal.changeSet.map((_op, index) => index);
    const jobs = indexes.flatMap(index => {
      const op = proposal.changeSet[index];
      if (!op) return [];
      const job = this.actionJob(state, op);
      if (job) return [{ index, jobId: job.id, runId: job.runId }];
      this.applyOps(state, [op]);
      return [];
    });
    proposal.status = 'applied';
    return { proposal: structuredClone(proposal), jobs, opResults: indexes.map(index => ({ index, status: 'applied' })) };
  }

  async getJob(jobId: string): Promise<Job> {
    const job = this.jobs.get(jobId);
    if (!job) throw new ForgeApiError('GET', `/jobs/${jobId}`, 404, 'JOB_001', 'job not found');
    job.polls += 1;
    if (job.status === 'pending' && job.polls > 1) {
      job.progress = job.complete(job.id) ?? null;
      job.status = 'done';
      job.attempts = 1;
    }
    const { id, kind, status, attempts, lastError, progress } = job;
    return { id, kind, status, attempts, lastError, progress };
  }

  async listBibleDocs(projectId: string): Promise<BibleDocItem[]> {
    return [...this.state(projectId).docs.values()].map(doc => ({ section: doc.section, slug: doc.slug, title: doc.slug, isEmpty: !doc.body, plannerOnly: doc.plannerOnly }));
  }

  async getBibleDoc(projectId: string, section: string, slug: string): Promise<BibleDoc> {
    const doc = this.state(projectId).docs.get(`${section}/${slug}`);
    if (!doc) throw new ForgeApiError('GET', `/bible/${section}/${slug}`, 404, 'BIB_001', 'doc not found');
    return { ...doc };
  }

  async listEntities(projectId: string): Promise<Entity[]> {
    return [...this.state(projectId).entities.values()].map(entity => ({ ...entity }));
  }

  async createEntity(projectId: string, entity: EntityInput): Promise<void> {
    this.state(projectId).entities.set(entity.entityKey, { entityKey: entity.entityKey, type: entity.type, name: entity.name, notes: entity.notes ?? null });
  }

  async listFacts(projectId: string): Promise<Fact[]> {
    return [...this.state(projectId).facts.values()].map(fact => ({ ...fact }));
  }

  async putFact(projectId: string, factKey: string, fact: FactInput): Promise<void> {
    this.state(projectId).facts.set(factKey, { factKey, text: fact.text, terms: fact.terms ?? null, writerNote: fact.writerNote ?? null, allowedClues: fact.allowedClues ?? null });
  }

  async createMilestone(projectId: string, _milestone: MilestoneInput): Promise<void> {
    this.state(projectId);
  }

  async listVolumes(projectId: string): Promise<Volume[]> {
    return this.state(projectId).volumes.map(volume => ({ ...volume }));
  }

  async putBrief(projectId: string, chapter: number, brief: BriefInput): Promise<void> {
    const state = this.state(projectId);
    const existing = state.briefs.get(chapter);
    state.briefs.set(chapter, { contentMode: state.project.contentMode, ...existing, ...brief, chapter, revision: (existing?.revision ?? 0) + 1 });
  }

  async getBriefMode(projectId: string, chapter: number): Promise<ContentMode | null> {
    return this.state(projectId).briefs.get(chapter)?.contentMode ?? null;
  }

  async generate(projectId: string): Promise<{ jobId: string }> {
    const state = this.state(projectId);
    const chapter = [...state.briefs.keys()].sort((a, b) => a - b).find(n => !state.drafts.has(n));
    if (chapter === undefined) throw new ForgeApiError('POST', '/generate', 409, 'GEN_001', 'nothing to generate');
    const job = this.job(projectId, 'generate', jobId => {
      this.writeDraft(state, chapter, jobId);
      return { chapter };
    });
    return { jobId: job.id };
  }

  async getDraft(projectId: string, chapter: number): Promise<Draft | null> {
    const draft = this.state(projectId).drafts.get(chapter);
    return draft ? { ...draft } : null;
  }

  async putDraft(projectId: string, chapter: number, input: DraftInput): Promise<Draft> {
    const state = this.state(projectId);
    const draft = this.draft(chapter, input.title ?? `Chapter ${chapter}`, input.body, false, 'draft');
    state.drafts.set(chapter, draft);
    return { ...draft };
  }

  async approveDraft(projectId: string, draft: Draft): Promise<Draft> {
    const state = this.state(projectId);
    const current = state.drafts.get(draft.chapter);
    if (!current) throw new ForgeApiError('POST', '/approve', 404, 'DRF_001', 'draft not found');
    current.approvedRevision = current.revision;
    state.reviews.set(draft.chapter, {
      id: String(this.next()),
      chapter: draft.chapter,
      status: 'preparing',
      polls: 0,
      isolated: current.isolated,
      bridgeOnly: false,
      disclosure: { clear: true, findings: [], copy: 'No unplanned disclosure detected' },
      consequential: [{ id: String(this.next()), category: 'knowledge', triage: 'consequential', claim: `What chapter ${draft.chapter} established.` }],
      routine: [{ id: String(this.next()), category: 'appearance', triage: 'routine', claim: 'Who appeared.' }],
    });
    return { ...current };
  }

  async getFinalizeReview(projectId: string, chapter: number): Promise<FinalizeReview> {
    const review = this.state(projectId).reviews.get(chapter);
    if (!review) throw new ForgeApiError('GET', '/finalize-review', 404, 'FRV_001', 'review not found');
    review.polls += 1;
    if (review.status === 'preparing' && review.polls > 1) review.status = 'ready';
    return structuredClone(review);
  }

  async prepareFinalizeReview(projectId: string, chapter: number): Promise<FinalizeReview> {
    return this.getFinalizeReview(projectId, chapter);
  }

  async keepRoutine(projectId: string, chapter: number): Promise<FinalizeReview> {
    const review = this.review(projectId, chapter);
    for (const item of review.routine) item.decision = 'kept';
    return structuredClone(review);
  }

  async decideReviewItem(projectId: string, chapter: number, itemId: string, decision: 'kept' | 'skipped'): Promise<FinalizeReview> {
    const review = this.review(projectId, chapter);
    const item = review.consequential.find(entry => entry.id === itemId);
    if (item) item.decision = decision;
    return structuredClone(review);
  }

  async finalizeReviewed(projectId: string, chapter: number): Promise<{ runId: string; status: string }> {
    const state = this.state(projectId);
    const draft = state.drafts.get(chapter);
    if (!draft) throw new ForgeApiError('POST', '/finalize', 404, 'DRF_001', 'draft not found');
    draft.status = 'final';
    draft.summary = `Chapter ${chapter}: ${draft.body.split('.')[0] ?? ''}.`;
    this.review(projectId, chapter).status = 'applied';
    if (draft.isolated && !this.options.faulty) {
      state.bridges.set(chapter, {
        chapter,
        revision: draft.revision,
        approved: true,
        summary: `After chapter ${chapter}, Ivo carries a bruise and a debt he will not speak of.`,
        positions: [{ entityKey: 'ivo', location: 'the Weir', conditions: ['bruised ribs'] }],
      });
    }
    return { runId: this.run(state, 'chapter-finalization', state.project.costTier, 'continuity', undefined, draft.isolated ? 'unrestricted' : 'standard'), status: 'completed' };
  }

  async getBridge(projectId: string, chapter: number): Promise<IsolationBridge> {
    const bridge = this.state(projectId).bridges.get(chapter);
    if (!bridge) return { chapter, revision: 1, approved: false, summary: null, positions: [] };
    return structuredClone(bridge);
  }

  async listWriterSnapshots(projectId: string, chapter: number): Promise<WriterSnapshotSummary[]> {
    return (this.state(projectId).snapshots.get(chapter) ?? []).map(({ messages: _messages, ...summary }) => summary);
  }

  async getWriterSnapshot(projectId: string, chapter: number, snapshotId: string): Promise<WriterSnapshot> {
    const snapshot = (this.state(projectId).snapshots.get(chapter) ?? []).find(entry => entry.id === snapshotId);
    if (!snapshot) throw new ForgeApiError('GET', `/writer-snapshots/${snapshotId}`, 404, 'SNP_001', 'snapshot not found');
    return structuredClone(snapshot);
  }

  async listRuns(projectId: string, graph?: string): Promise<RunListItem[]> {
    return [...this.state(projectId).runs.values()]
      .filter(run => !graph || run.graph === graph)
      .map(({ id, graph: name, jobId, status, startedAt, endedAt }) => ({ id, graph: name, jobId, status, startedAt, endedAt }));
  }

  async runUsage(projectId: string, runId: string): Promise<RunUsage> {
    const run = this.state(projectId).runs.get(runId);
    if (!run) throw new ForgeApiError('GET', `/runs/${runId}/usage`, 404, 'RUN_001', 'run not found');
    return structuredClone(run);
  }

  async chapterCost(projectId: string, chapter: number): Promise<ChapterCost> {
    const state = this.state(projectId);
    const calls = (state.chapterRuns.get(chapter) ?? []).flatMap(runId => state.runs.get(runId) ?? []);
    return { chapter, totals: { calls: calls.reduce((sum, run) => sum + run.calls.length, 0), costUsd: calls.reduce((sum, run) => sum + run.totals.costUsd, 0) } };
  }

  async projectCost(projectId: string): Promise<ProjectCost> {
    const calls = [...this.state(projectId).runs.values()].flatMap(run => run.calls);
    const byTier = new Map<string, { calls: number; costUsd: number }>();
    for (const call of calls) {
      const entry = byTier.get(call.tier ?? 'unknown') ?? { calls: 0, costUsd: 0 };
      entry.calls += 1;
      entry.costUsd += Number(call.costUsd ?? 0);
      byTier.set(call.tier ?? 'unknown', entry);
    }
    return {
      totalCostUsd: calls.reduce((sum, call) => sum + Number(call.costUsd ?? 0), 0),
      calls: calls.length,
      byTier: [...byTier].map(([key, value]) => ({ key, ...value })),
      byRole: [],
      byModel: [],
    };
  }

  async quota(): Promise<Quota> {
    return { calls: 0, costUsd: 0, maxCalls: 0, maxCostUsd: 0, windowMs: 3_600_000 };
  }

  private next(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private state(projectId: string): FakeProject {
    const state = this.projects.get(projectId);
    if (!state) throw new ForgeApiError('GET', `/projects/${projectId}`, 404, 'PRJ_001', 'project not found');
    return state;
  }

  private review(projectId: string, chapter: number): FakeReview {
    const review = this.state(projectId).reviews.get(chapter);
    if (!review) throw new EvalError(`fake: no review for chapter ${chapter}`);
    return review;
  }

  private newProject(title: string, notes: string, contentMode: ContentMode): FakeProject {
    const id = String(this.next());
    const state: FakeProject = {
      project: { id, name: title, contentMode, costTier: 'balanced', brief: null, theme: null, ending: null },
      notes,
      sessions: new Map(),
      entities: new Map(),
      facts: new Map(),
      docs: new Map(),
      volumes: [],
      briefs: new Map(),
      drafts: new Map(),
      reviews: new Map(),
      bridges: new Map(),
      snapshots: new Map(),
      proposals: new Map(),
      runs: new Map(),
      chapterRuns: new Map(),
    };
    this.projects.set(id, state);
    return state;
  }

  private proposal(state: FakeProject, sessionId: string, kind: string, changeSet: ChangeOp[], autoApplied: boolean, runId: string): Proposal {
    const proposal: Proposal = {
      id: String(this.next()),
      sessionId,
      kind,
      status: autoApplied ? 'applied' : 'pending',
      changeSet,
      autoApplied,
      runId,
      warnings: [],
      createdAt: new Date().toISOString(),
    };
    state.proposals.set(proposal.id, proposal);
    return structuredClone(proposal);
  }

  private applyOps(state: FakeProject, ops: readonly ChangeOp[]): void {
    for (const op of ops) {
      if (op.op === 'premise.update') {
        if (typeof op['brief'] === 'string') state.project.brief = op['brief'];
        if (typeof op['notes'] === 'string') state.project.theme = op['notes'];
      }
      if (op.op === 'entity.upsert') {
        const key = typeof op['entityKey'] === 'string' ? op['entityKey'] : `entity-${this.next()}`;
        state.entities.set(key, { entityKey: key, type: 'concept', name: key, notes: typeof op['notes'] === 'string' ? op['notes'] : null });
      }
      if (op.op === 'entity.remove' && typeof op['entityKey'] === 'string') state.entities.delete(op['entityKey']);
      if (op.op === 'bible_document.upsert') {
        const section = String(op['section']);
        const slug = String(op['slug']);
        state.docs.set(`${section}/${slug}`, { section, slug, body: String(op['body'] ?? ''), plannerOnly: op['plannerOnly'] === true });
      }
      if (op.op === 'brief.update' && typeof op['chapter'] === 'number') {
        const chapter = op['chapter'];
        const existing = state.briefs.get(chapter);
        state.briefs.set(chapter, {
          body: String(op['body'] ?? existing?.body ?? ''),
          contentMode: existing?.contentMode ?? state.project.contentMode,
          chapter,
          revision: (existing?.revision ?? 0) + 1,
        });
      }
    }
  }

  private actionJob(state: FakeProject, op: ChangeOp): FakeJob | null {
    const projectId = state.project.id;
    if (op.op === 'action.organise_notes') return this.job(projectId, 'organise', () => this.organise(state));
    if (op.op === 'action.plan_chapter') {
      const chapter = Number(op['chapter'] ?? 1);
      return this.job(projectId, 'plan', () => {
        const card = this.proposal(state, '', 'chat', [{ op: 'brief.update', chapter, body: `Plan for chapter ${chapter}.` }], false, '');
        return { proposalId: card.id };
      });
    }
    return null;
  }

  /** Paragraphs that name something (a capitalised word past the first) apply as from_notes; the rest wait on a card; the last is "not used yet". */
  private organise(state: FakeProject): Record<string, unknown> {
    const notes = paragraphs(state.notes);
    const applied: ChangeOp[] = [];
    const card: ChangeOp[] = [];
    notes.slice(0, -1).forEach((paragraph, index) => {
      const op: ChangeOp = { op: 'bible_document.upsert', section: 'story', slug: `notes-${index + 1}`, body: paragraph, quote: paragraph.slice(0, 40) };
      (/\s[A-Z][a-z]/.test(paragraph) ? applied : card).push(op);
    });
    const appliedProposal = this.proposal(state, '', 'organise', applied, true, '');
    this.applyOps(state, applied);
    const cardProposal = this.proposal(state, '', 'organise', card, false, '');
    state.docs.set('planner/timeline', { section: 'planner', slug: 'timeline', plannerOnly: true, body: notes.filter(paragraph => /volume|book/i.test(paragraph)).join('\n\n') });
    const label = this.options.faulty ? 'suggested' : 'from_notes';
    const entry = (op: ChangeOp, index: number): Record<string, unknown> => ({ opIndex: index, ref: `bible:${String(op['slug'])}`, label, paragraphs: [index + 1] });
    return {
      appliedProposalId: appliedProposal.id,
      proposalId: cardProposal.id,
      organised: {
        paragraphs: notes.length,
        unusedParagraphs: notes.length > 0 ? [notes.length] : [],
        passes: 1,
        applied: applied.map(entry),
        card: card.map((op, index) => ({ ...entry(op, index), label: 'suggested' })),
      },
    };
  }

  private writeDraft(state: FakeProject, chapter: number, jobId: string): void {
    const brief = state.briefs.get(chapter);
    if (!brief) throw new EvalError(`fake: no plan for chapter ${chapter}`);
    const isolated = brief.contentMode === 'unrestricted';
    const leak =
      this.options.faulty && chapter % 10 === 2
        ? ' Aldine told him plainly that his father Tomas was still alive, the Silent Warden of the Deep Gate. Warden Osk said the tide was turning.'
        : '';
    const body = `${brief.body} ${isolated ? `In the isolated scene of chapter ${chapter} the blade opened his side and the water ran red around the pilings.` : `The chapter ${chapter} scene holds, and the lanterns burn on.`}${leak}`;
    const draft = this.draft(chapter, brief.title ?? `Chapter ${chapter}`, body, isolated, 'draft');
    state.drafts.set(chapter, draft);
    const context = [...state.drafts.values()]
      .filter(previous => previous.chapter < chapter && previous.status === 'final')
      .map(previous => {
        if (!previous.isolated || isolated || this.options.faulty) return `Chapter ${previous.chapter}: ${previous.isolated ? previous.body : (previous.summary ?? previous.body)}`;
        const bridge = state.bridges.get(previous.chapter);
        return `Chapter ${previous.chapter}: ${bridge?.summary ?? 'walled off'} ${(bridge?.positions ?? []).flatMap(position => position.conditions).join('; ')}`;
      });
    const snapshot: WriterSnapshot = {
      id: String(this.next()),
      chapter,
      draftRevision: 1,
      attempt: 1,
      role: 'draft',
      isolated,
      messages: [
        { role: 'system', content: 'You write the next chapter.' },
        { role: 'user', content: `${context.join('\n')}\n\nPlan: ${brief.body}` },
      ],
    };
    state.snapshots.set(chapter, [snapshot]);
    const runId = this.run(state, 'chapter-generation', state.project.costTier, 'generation', jobId, isolated ? 'unrestricted' : 'standard');
    state.chapterRuns.set(chapter, [...(state.chapterRuns.get(chapter) ?? []), runId]);
  }

  private draft(chapter: number, title: string, body: string, isolated: boolean, status: Draft['status']): Draft {
    return { id: String(this.next()), chapter, title, status, revision: 1, saveSeq: 1, approvedRevision: null, body, summary: null, isolated, judge: 'consistent' };
  }

  private job(projectId: string, kind: string, complete: FakeJob['complete']): FakeJob {
    const state = this.state(projectId);
    const id = `job-${this.next()}`;
    const graph = kind === 'organise' ? 'notes-organise' : kind === 'plan' ? 'chapter-plan' : null;
    const runId = graph ? this.run(state, graph, state.project.costTier, kind, id) : '';
    const job: FakeJob = { id, projectId, kind, status: 'pending', attempts: 0, polls: 0, runId, complete };
    this.jobs.set(id, job);
    return job;
  }

  private run(state: FakeProject, graph: string, tier: Project['costTier'], role: string, jobId?: string, contentMode: ContentMode = 'standard'): string {
    const id = `00000000-0000-4000-8000-${String(this.next()).padStart(12, '0')}`;
    const latencyMs = 800 + ((this.sequence * 7919) % 4000);
    const call: ModelCall = {
      role,
      provider: 'fake',
      model: `fake/${tier}`,
      status: 'success',
      latencyMs,
      attempt: 1,
      costUsd: '0.0010',
      tier,
      contentMode,
      inputTokens: 1000,
      outputTokens: 200,
    };
    const now = new Date().toISOString();
    state.runs.set(id, {
      id,
      graph,
      jobId: jobId ?? null,
      status: 'completed',
      startedAt: now,
      endedAt: now,
      totals: { calls: 1, costUsd: 0.001, durationMs: latencyMs },
      calls: [call],
    });
    return id;
  }
}
