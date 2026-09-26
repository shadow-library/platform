import { EvalError, ForgeApiError } from './errors.ts';
import {
  type ApplyResult,
  type BibleDoc,
  type BibleDocItem,
  type BriefInput,
  type ChapterCost,
  type ChatMessage,
  type ChatMode,
  type ChatSession,
  type ChatTurnResult,
  type ContentMode,
  type CostTier,
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

export type ForgeAuth = { kind: 'bearer'; token: string } | { kind: 'cookie'; cookie: string; csrf?: string } | { kind: 'none' };

export interface ProjectUpdate {
  costTier?: CostTier;
  contentMode?: ContentMode;
}

/** The slice of the Novel Forge public API an author-driven eval touches; `FakeForgeApi` implements the same surface offline. */
export interface ForgeApi {
  readonly target: string;
  whoami(): Promise<void>;
  createNovel(title: string, notes: string | undefined, contentMode?: ContentMode): Promise<{ projectId: string; sessionId: string }>;
  importNovel(bundle: NovelBundle): Promise<{ projectId: string; jobId: string }>;
  getProject(projectId: string): Promise<Project>;
  updateProject(projectId: string, update: ProjectUpdate): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;
  createSession(projectId: string, mode: ChatMode): Promise<ChatSession>;
  getSession(projectId: string, sessionId: string): Promise<ChatSession>;
  putNotes(projectId: string, notes: string): Promise<void>;
  turn(projectId: string, sessionId: string, request: TurnRequest): Promise<TurnTrace>;
  getProposal(projectId: string, proposalId: string): Promise<Proposal>;
  listProposals(projectId: string, sessionId: string): Promise<Proposal[]>;
  applyProposal(projectId: string, proposalId: string, opIndexes?: number[]): Promise<ApplyResult>;
  getJob(jobId: string): Promise<Job>;
  listBibleDocs(projectId: string): Promise<BibleDocItem[]>;
  getBibleDoc(projectId: string, section: string, slug: string): Promise<BibleDoc>;
  listEntities(projectId: string): Promise<Entity[]>;
  createEntity(projectId: string, entity: EntityInput): Promise<void>;
  listFacts(projectId: string): Promise<Fact[]>;
  putFact(projectId: string, factKey: string, fact: FactInput): Promise<void>;
  createMilestone(projectId: string, milestone: MilestoneInput): Promise<void>;
  listVolumes(projectId: string): Promise<Volume[]>;
  putBrief(projectId: string, chapter: number, brief: BriefInput): Promise<void>;
  getBriefMode(projectId: string, chapter: number): Promise<ContentMode | null>;
  generate(projectId: string): Promise<{ jobId: string }>;
  getDraft(projectId: string, chapter: number): Promise<Draft | null>;
  putDraft(projectId: string, chapter: number, draft: DraftInput): Promise<Draft>;
  approveDraft(projectId: string, draft: Draft): Promise<Draft>;
  getFinalizeReview(projectId: string, chapter: number): Promise<FinalizeReview>;
  prepareFinalizeReview(projectId: string, chapter: number): Promise<FinalizeReview>;
  keepRoutine(projectId: string, chapter: number): Promise<FinalizeReview>;
  decideReviewItem(projectId: string, chapter: number, itemId: string, decision: 'kept' | 'skipped'): Promise<FinalizeReview>;
  finalizeReviewed(projectId: string, chapter: number): Promise<{ runId: string; status: string }>;
  getBridge(projectId: string, chapter: number): Promise<IsolationBridge>;
  listWriterSnapshots(projectId: string, chapter: number): Promise<WriterSnapshotSummary[]>;
  getWriterSnapshot(projectId: string, chapter: number, snapshotId: string): Promise<WriterSnapshot>;
  listRuns(projectId: string, graph?: string): Promise<RunListItem[]>;
  runUsage(projectId: string, runId: string): Promise<RunUsage>;
  chapterCost(projectId: string, chapter: number): Promise<ChapterCost>;
  projectCost(projectId: string): Promise<ProjectCost>;
  quota(): Promise<Quota>;
}

interface HttpForgeApiOptions {
  baseUrl: string;
  auth: ForgeAuth;
  insecureTls: boolean;
  turnTimeoutMs: number;
}

interface SseFrame {
  event: string;
  data: string;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const API = '/api/v1';
const REQUEST_TIMEOUT_MS = 120_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorFields(body: string): { code?: string; message: string } {
  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed)) return { code: typeof parsed['code'] === 'string' ? parsed['code'] : undefined, message: String(parsed['message'] ?? body.slice(0, 300)) };
  } catch {
    return { message: body.slice(0, 300) };
  }
  return { message: body.slice(0, 300) };
}

async function* sseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const decoder = new TextDecoder();
  let buffer = '';
  let event = 'message';
  let data: string[] = [];
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (line === '') {
        if (data.length > 0) yield { event, data: data.join('\n') };
        event = 'message';
        data = [];
      } else if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
  }
}

export class HttpForgeApi implements ForgeApi {
  readonly target: string;

  constructor(private readonly options: HttpForgeApiOptions) {
    this.target = options.baseUrl;
  }

  async whoami(): Promise<void> {
    await this.request('GET', '/api/auth/session');
  }

  createNovel(title: string, notes: string | undefined, contentMode?: ContentMode): Promise<{ projectId: string; sessionId: string }> {
    return this.request('POST', `${API}/projects/new-novel`, { title, ...(notes ? { notes } : {}), ...(contentMode ? { contentMode } : {}) });
  }

  importNovel(bundle: NovelBundle): Promise<{ projectId: string; jobId: string }> {
    return this.request('POST', `${API}/import`, { bundle });
  }

  getProject(projectId: string): Promise<Project> {
    return this.request('GET', `${API}/projects/${projectId}`);
  }

  updateProject(projectId: string, update: ProjectUpdate): Promise<Project> {
    return this.request('PATCH', `${API}/projects/${projectId}`, update);
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.request('DELETE', `${API}/projects/${projectId}`);
  }

  createSession(projectId: string, mode: ChatMode): Promise<ChatSession> {
    return this.request('POST', `${API}/projects/${projectId}/chat/sessions`, { mode });
  }

  getSession(projectId: string, sessionId: string): Promise<ChatSession> {
    return this.request('GET', `${API}/projects/${projectId}/chat/sessions/${sessionId}`);
  }

  async putNotes(projectId: string, notes: string): Promise<void> {
    await this.request('PUT', `${API}/projects/${projectId}/notes`, { notes });
  }

  async turn(projectId: string, sessionId: string, request: TurnRequest): Promise<TurnTrace> {
    const started = performance.now();
    const { runId } = await this.request<{ runId: string }>('POST', `${API}/projects/${projectId}/chats/${sessionId}/turn/stream`, request);
    const lookupAtMs: number[] = [];
    let replayed = 0;
    const response = await this.fetch('GET', `${API}/projects/${projectId}/turns/${runId}/stream`, undefined, AbortSignal.timeout(this.options.turnTimeoutMs));
    if (!response.ok || !response.body) return { result: await this.recoverTurn(projectId, sessionId, runId), totalMs: performance.now() - started, lookupAtMs };

    for await (const frame of sseFrames(response.body)) {
      if (frame.event === 'reset') replayed = 0;
      if (frame.event === 'lookup') {
        replayed += 1;
        if (replayed > lookupAtMs.length) lookupAtMs.push(performance.now() - started);
      }
      if (frame.event === 'error') {
        const { code, message } = errorFields(frame.data);
        throw new ForgeApiError('TURN', `/turns/${runId}`, 500, code, message);
      }
      if (frame.event === 'done') return { result: JSON.parse(frame.data) as ChatTurnResult, totalMs: performance.now() - started, lookupAtMs };
    }
    return { result: await this.recoverTurn(projectId, sessionId, runId), totalMs: performance.now() - started, lookupAtMs };
  }

  getProposal(projectId: string, proposalId: string): Promise<Proposal> {
    return this.request('GET', `${API}/projects/${projectId}/proposals/${proposalId}`);
  }

  async listProposals(projectId: string, sessionId: string): Promise<Proposal[]> {
    const page = await this.request<{ items: Proposal[] }>('GET', `${API}/projects/${projectId}/proposals?sessionId=${sessionId}&limit=100`);
    return page.items;
  }

  applyProposal(projectId: string, proposalId: string, opIndexes?: number[]): Promise<ApplyResult> {
    return this.request('POST', `${API}/projects/${projectId}/proposals/${proposalId}/apply`, opIndexes ? { opIndexes } : {});
  }

  getJob(jobId: string): Promise<Job> {
    return this.request('GET', `${API}/jobs/${jobId}`);
  }

  async listBibleDocs(projectId: string): Promise<BibleDocItem[]> {
    return (await this.request<{ docs: BibleDocItem[] }>('GET', `${API}/projects/${projectId}/bible`)).docs;
  }

  getBibleDoc(projectId: string, section: string, slug: string): Promise<BibleDoc> {
    return this.request('GET', `${API}/projects/${projectId}/bible/${encodeURIComponent(section)}/${encodeURIComponent(slug)}`);
  }

  async listEntities(projectId: string): Promise<Entity[]> {
    const items: Entity[] = [];
    for (let page = 1; ; page += 1) {
      const result = await this.request<{ items: Entity[]; totalPages: number }>('GET', `${API}/projects/${projectId}/entities?limit=100&page=${page}`);
      items.push(...result.items);
      if (page >= result.totalPages) return items;
    }
  }

  async createEntity(projectId: string, entity: EntityInput): Promise<void> {
    await this.request('POST', `${API}/projects/${projectId}/entities`, entity);
  }

  async listFacts(projectId: string): Promise<Fact[]> {
    return (await this.request<{ facts: Fact[] }>('GET', `${API}/projects/${projectId}/facts`)).facts;
  }

  async putFact(projectId: string, factKey: string, fact: FactInput): Promise<void> {
    await this.request('PUT', `${API}/projects/${projectId}/facts/${encodeURIComponent(factKey)}`, fact);
  }

  async createMilestone(projectId: string, milestone: MilestoneInput): Promise<void> {
    await this.request('POST', `${API}/projects/${projectId}/milestones`, milestone);
  }

  async listVolumes(projectId: string): Promise<Volume[]> {
    return (await this.request<{ items: Volume[] }>('GET', `${API}/projects/${projectId}/volumes?limit=100`)).items;
  }

  async putBrief(projectId: string, chapter: number, brief: BriefInput): Promise<void> {
    await this.request('PUT', `${API}/projects/${projectId}/briefs/${chapter}`, brief);
  }

  async getBriefMode(projectId: string, chapter: number): Promise<ContentMode | null> {
    const brief = await this.optional(this.request<{ contentMode?: ContentMode | null }>('GET', `${API}/projects/${projectId}/briefs/${chapter}`));
    return brief?.contentMode ?? null;
  }

  generate(projectId: string): Promise<{ jobId: string }> {
    return this.request('POST', `${API}/projects/${projectId}/generate`, { limit: 1 });
  }

  getDraft(projectId: string, chapter: number): Promise<Draft | null> {
    return this.optional(this.request<Draft>('GET', `${API}/projects/${projectId}/drafts/${chapter}`));
  }

  putDraft(projectId: string, chapter: number, draft: DraftInput): Promise<Draft> {
    return this.request('PUT', `${API}/projects/${projectId}/drafts/${chapter}`, draft);
  }

  approveDraft(projectId: string, draft: Draft): Promise<Draft> {
    return this.request('POST', `${API}/projects/${projectId}/drafts/${draft.chapter}/approve`, { revision: draft.revision, saveSeq: draft.saveSeq, draftId: draft.id });
  }

  getFinalizeReview(projectId: string, chapter: number): Promise<FinalizeReview> {
    return this.request('GET', `${API}/projects/${projectId}/drafts/${chapter}/finalize-review`);
  }

  prepareFinalizeReview(projectId: string, chapter: number): Promise<FinalizeReview> {
    return this.request('POST', `${API}/projects/${projectId}/drafts/${chapter}/finalize-review/prepare`);
  }

  keepRoutine(projectId: string, chapter: number): Promise<FinalizeReview> {
    return this.request('POST', `${API}/projects/${projectId}/drafts/${chapter}/finalize-review/keep-routine`);
  }

  decideReviewItem(projectId: string, chapter: number, itemId: string, decision: 'kept' | 'skipped'): Promise<FinalizeReview> {
    return this.request('POST', `${API}/projects/${projectId}/drafts/${chapter}/finalize-review/items/${itemId}/decision`, { decision });
  }

  async finalizeReviewed(projectId: string, chapter: number): Promise<{ runId: string; status: string }> {
    return this.request('POST', `${API}/projects/${projectId}/drafts/${chapter}/finalize-review/finalize`);
  }

  getBridge(projectId: string, chapter: number): Promise<IsolationBridge> {
    return this.request('GET', `${API}/projects/${projectId}/drafts/${chapter}/bridge`);
  }

  async listWriterSnapshots(projectId: string, chapter: number): Promise<WriterSnapshotSummary[]> {
    return (await this.request<{ items: WriterSnapshotSummary[] }>('GET', `${API}/projects/${projectId}/chapters/${chapter}/writer-snapshots`)).items;
  }

  getWriterSnapshot(projectId: string, chapter: number, snapshotId: string): Promise<WriterSnapshot> {
    return this.request('GET', `${API}/projects/${projectId}/chapters/${chapter}/writer-snapshots/${snapshotId}`);
  }

  async listRuns(projectId: string, graph?: string): Promise<RunListItem[]> {
    const query = graph ? `&graph=${graph}` : '';
    return (await this.request<{ items: RunListItem[] }>('GET', `${API}/projects/${projectId}/runs?limit=100${query}`)).items;
  }

  runUsage(projectId: string, runId: string): Promise<RunUsage> {
    return this.request('GET', `${API}/projects/${projectId}/runs/${runId}/usage`);
  }

  chapterCost(projectId: string, chapter: number): Promise<ChapterCost> {
    return this.request('GET', `${API}/projects/${projectId}/chapters/${chapter}/cost`);
  }

  projectCost(projectId: string): Promise<ProjectCost> {
    return this.request('GET', `${API}/projects/${projectId}/cost`);
  }

  quota(): Promise<Quota> {
    return this.request('GET', `${API}/ai/quota`);
  }

  /** The stream is gone (the run finished and its backlog expired, or the connection dropped): rebuild the result from the transcript. */
  private async recoverTurn(projectId: string, sessionId: string, runId: string): Promise<ChatTurnResult> {
    const deadline = Date.now() + this.options.turnTimeoutMs;
    while (Date.now() < deadline) {
      const status = await this.request<{ pendingTurn?: { runId: string } | null; failedTurn?: { runId: string; code?: string; message?: string } | null }>(
        'GET',
        `${API}/projects/${projectId}/chat/sessions/${sessionId}/turn`,
      );
      if (status.failedTurn?.runId === runId)
        throw new ForgeApiError('TURN', `/turns/${runId}`, 500, status.failedTurn.code ?? undefined, status.failedTurn.message ?? 'turn failed');
      if (!status.pendingTurn) break;
      await Bun.sleep(2_000);
    }
    const { messages } = await this.request<{ messages: ChatMessage[] }>('GET', `${API}/projects/${projectId}/chat/sessions/${sessionId}/messages?limit=2`);
    const assistantMessage = messages.find(message => message.runId === runId && message.role === 'assistant');
    const userMessage = messages.find(message => message.role === 'user');
    if (!assistantMessage || !userMessage) throw new EvalError(`turn ${runId} left no assistant message to recover`);
    const proposal = assistantMessage.proposalId ? await this.getProposal(projectId, assistantMessage.proposalId) : undefined;
    const appliedProposal = assistantMessage.appliedProposalId ? await this.getProposal(projectId, assistantMessage.appliedProposalId) : undefined;
    return { userMessage, assistantMessage, proposal, appliedProposal, runId };
  }

  private async optional<T>(pending: Promise<T>): Promise<T | null> {
    try {
      return await pending;
    } catch (error) {
      if (error instanceof ForgeApiError && error.status === 404) return null;
      throw error;
    }
  }

  private async request<T>(method: Method, route: string, body?: unknown): Promise<T> {
    const response = await this.fetch(method, route, body, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
    const text = await response.text();
    if (!response.ok) {
      const { code, message } = errorFields(text);
      throw new ForgeApiError(method, route, response.status, code, message);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private fetch(method: Method, route: string, body: unknown, signal: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { accept: route.endsWith('/stream') ? 'text/event-stream' : 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const { auth } = this.options;
    if (auth.kind === 'bearer') headers['authorization'] = `Bearer ${auth.token}`;
    if (auth.kind === 'cookie') {
      headers['cookie'] = auth.cookie;
      if (auth.csrf && method !== 'GET') headers['x-csrf-token'] = auth.csrf;
    }
    return fetch(`${this.options.baseUrl}${route}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
      tls: { rejectUnauthorized: !this.options.insecureTls },
    });
  }
}
