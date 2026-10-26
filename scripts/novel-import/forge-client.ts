import { ShadowError } from '../utils/index.ts';
import { type ContentMode, type CoverMime } from './manuscript.ts';

export interface ForgeDraft {
  id: string;
  chapter: number;
  title?: string | null;
  body: string;
  revision: number;
  saveSeq: number;
  status: string;
  reviewStatus: string;
}

export interface ForgeDraftSummary {
  chapter: number;
  title?: string | null;
  status: string;
  reviewStatus: string;
}

export interface ForgeProject {
  id: string;
  name: string;
  title?: string | null;
}

export interface NewProject {
  name: string;
  title: string;
  contentMode?: ContentMode;
}

export interface ChapterImport {
  title?: string;
  prose: string;
  base?: Pick<ForgeDraft, 'id' | 'revision' | 'saveSeq'>;
}

export interface ForgeClientOptions {
  baseUrl: string;
  botKey: string;
  insecureTls?: boolean;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

type Method = 'GET' | 'POST' | 'PUT';

const API = '/api/v1';
const REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 4;
// Both are answered before the handler runs (the bot's rate limit, identity failing the key exchange), so a retried import can never land twice.
const RETRY_STATUSES: readonly number[] = [429, 503];

export class ForgeApiError extends ShadowError {
  constructor(
    readonly method: string,
    readonly route: string,
    readonly status: number,
    readonly code: string | undefined,
    detail: string,
  ) {
    super(`${method} ${route} answered ${status}${code ? ` ${code}` : ''}: ${detail}`);
    this.name = 'ForgeApiError';
  }
}

function errorFields(text: string): { code?: string; message: string } {
  try {
    const parsed = JSON.parse(text) as { code?: unknown; message?: unknown };
    return { code: typeof parsed.code === 'string' ? parsed.code : undefined, message: typeof parsed.message === 'string' ? parsed.message : text.slice(0, 300) };
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function retryAfterMs(response: Response, attempt: number): number {
  const seconds = Number(response.headers.get('retry-after'));
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return Math.min(30_000, 1000 * 2 ** attempt);
}

/** Novel Forge as an organisation bot sees it: every request carries only the `sl_bot_…` key, which the forge exchanges at identity itself. */
export class ForgeClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: ForgeClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? Bun.sleep;
  }

  get target(): string {
    return this.options.baseUrl;
  }

  createProject(project: NewProject): Promise<ForgeProject> {
    return this.request('POST', `${API}/projects`, { kind: 'new_novel', ...project });
  }

  getProject(projectId: string): Promise<ForgeProject> {
    return this.request('GET', `${API}/projects/${projectId}`);
  }

  async putNotes(projectId: string, notes: string): Promise<void> {
    await this.request('PUT', `${API}/projects/${projectId}/notes`, { notes });
  }

  async setCover(projectId: string, mime: CoverMime, image: string): Promise<void> {
    await this.request('POST', `${API}/projects/${projectId}/cover`, { mime, image });
  }

  async listDrafts(projectId: string): Promise<ForgeDraftSummary[]> {
    return (await this.request<{ items: ForgeDraftSummary[] }>('GET', `${API}/projects/${projectId}/drafts/summary`)).items;
  }

  getDraft(projectId: string, chapter: number): Promise<ForgeDraft> {
    return this.request('GET', `${API}/projects/${projectId}/drafts/${chapter}`);
  }

  importChapter(projectId: string, chapter: number, input: ChapterImport): Promise<ForgeDraft> {
    const base = input.base ? { baseDraftId: input.base.id, baseRevision: input.base.revision, baseSaveSeq: input.base.saveSeq } : {};
    return this.request('POST', `${API}/projects/${projectId}/drafts/${chapter}/import`, { ...(input.title ? { title: input.title } : {}), prose: input.prose, ...base });
  }

  approve(projectId: string, chapter: number, revision: number): Promise<ForgeDraft> {
    return this.request('POST', `${API}/projects/${projectId}/drafts/${chapter}/approve`, { revision });
  }

  private async request<T>(method: Method, route: string, body?: unknown): Promise<T> {
    const maxRetries = this.options.maxRetries ?? DEFAULT_MAX_RETRIES;
    for (let attempt = 0; ; attempt++) {
      const response = await this.send(method, route, body);
      const text = await response.text();
      if (response.ok) return (text ? JSON.parse(text) : undefined) as T;
      if (attempt < maxRetries && RETRY_STATUSES.includes(response.status)) {
        await this.sleep(retryAfterMs(response, attempt));
        continue;
      }
      const { code, message } = errorFields(text);
      throw new ForgeApiError(method, route, response.status, code, message);
    }
  }

  private async send(method: Method, route: string, body: unknown): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json', authorization: `Bearer ${this.options.botKey}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    try {
      return await this.fetchImpl(`${this.options.baseUrl}${route}`, {
        method,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: body === undefined ? undefined : JSON.stringify(body),
        tls: { rejectUnauthorized: !this.options.insecureTls },
      });
    } catch (error) {
      throw new ShadowError(`${method} ${this.options.baseUrl}${route} could not be reached: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
}
