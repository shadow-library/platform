import { type AuthClient } from '@shadow-library/auth';
import { AppError, ErrorCode, Logger, ServiceDiscovery } from '@shadow-library/common';

import { API_PATH, DEFAULT_SERVICE_NAME, NAMESPACE, SYNAPSE_RESOURCE, SYNAPSE_SCOPES } from './constants';
import {
  type CatalogQuery,
  type SynapseCallOptions,
  type SynapseChatRequest,
  type SynapseChatResponse,
  type SynapseEmbeddingRequest,
  type SynapseEmbeddingResponse,
  type SynapseEnvelopeInput,
  type SynapseImageRequest,
  type SynapseImageResponse,
} from './synapse-api.types';
import { SynapseChatStream } from './synapse-chat-stream';
import { parseSynapseError } from './synapse.error';
import { type CatalogAppResponse, type CatalogResponse, type CatalogTaskResponse } from './synapse.types';
import { isAbortError, isRecord, networkError, parseJson, reasonOf, withRequestId } from './synapse.utils';

export type SynapseTokenSource = Pick<AuthClient, 'getServiceToken'>;

export type SynapseFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface SynapseClientOptions {
  authClient: SynapseTokenSource;
  serviceName?: string;
  fetch?: SynapseFetch;
}

interface CatalogEntry {
  body: CatalogResponse;
  etag: string | null;
  validatedAt: number;
}

const CATALOG_TTL_MS = 60_000;

const SELECTOR_DELIMITERS = /[,:]/;

function isReplayable(input: string | URL | Request, init: RequestInit): boolean {
  const body = init.body;
  if (input instanceof Request && input.body !== null) return false;
  if (body instanceof ReadableStream) return false;
  return !(typeof body === 'object' && body !== null && Symbol.asyncIterator in body);
}

function catalogSearch({ task, selectors = {} }: CatalogQuery): string {
  const params = new URLSearchParams();
  if (task) params.set('task', task);
  const pairs = Object.entries(selectors).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of pairs) {
    if (SELECTOR_DELIMITERS.test(key) || SELECTOR_DELIMITERS.test(value)) throw AppError.internal(`catalog selector '${key}' cannot contain ',' or ':'`);
  }
  if (pairs.length > 0) params.set('selectors', pairs.map(([key, value]) => `${key}:${value}`).join(','));
  return params.toString();
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

async function readText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw networkError(error);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = parseJson(await readText(response));
  if (!isRecord(body)) throw ErrorCode.API_REQUEST_NETWORK_ERROR.create({ reason: 'synapse answered with a body that is not a json object' });
  return body as T;
}

async function readError(response: Response): Promise<AppError> {
  const text = await response.text().catch((error: unknown) => {
    if (isAbortError(error)) throw error;
    return '';
  });
  return parseSynapseError(response.status, parseJson(text));
}

export class SynapseClient {
  private readonly logger = Logger.getLogger(NAMESPACE, SynapseClient.name);
  private readonly authClient: SynapseTokenSource;
  private readonly serviceName: string;
  private readonly transport: SynapseFetch;
  private readonly catalogs = new Map<string, CatalogEntry>();
  private readonly revalidations = new Map<string, Promise<CatalogResponse>>();

  constructor(options: SynapseClientOptions) {
    this.authClient = options.authClient;
    this.serviceName = options.serviceName ?? DEFAULT_SERVICE_NAME;
    this.transport = options.fetch ?? ((input, init) => fetch(input, init));
  }

  get baseUrl(): string {
    return ServiceDiscovery.resolve(`svc://${this.serviceName}${API_PATH}`);
  }

  getToken(): Promise<string> {
    return this.authClient.getServiceToken({ resource: SYNAPSE_RESOURCE, scopes: [...SYNAPSE_SCOPES] });
  }

  readonly fetch: SynapseFetch = async (input, init = {}) => {
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('authorization', `Bearer ${await this.getToken()}`);
    return this.send(input, { ...init, headers });
  };

  async chat(body: SynapseChatRequest, options: SynapseCallOptions = {}): Promise<SynapseChatResponse> {
    return readJson<SynapseChatResponse>(await this.post('/chat/completions', { ...body, stream: false }, options));
  }

  async chatStream(body: SynapseChatRequest, options: SynapseCallOptions = {}): Promise<SynapseChatStream> {
    const response = await this.post('/chat/completions', { ...body, stream: true }, options, 'text/event-stream');
    if (!response.body) throw ErrorCode.API_REQUEST_NETWORK_ERROR.create({ reason: 'synapse answered a stream without a body' });
    return new SynapseChatStream(response.body);
  }

  async embed(body: SynapseEmbeddingRequest, options: SynapseCallOptions = {}): Promise<SynapseEmbeddingResponse> {
    return readJson<SynapseEmbeddingResponse>(await this.post('/embeddings', body, options));
  }

  async images(body: SynapseImageRequest, options: SynapseCallOptions = {}): Promise<SynapseImageResponse> {
    return readJson<SynapseImageResponse>(await this.post('/images/generations', body, options));
  }

  catalog(query: CatalogQuery & { task: string }): Promise<CatalogTaskResponse>;
  catalog(query?: Omit<CatalogQuery, 'task'>): Promise<CatalogAppResponse>;
  catalog(query?: CatalogQuery): Promise<CatalogResponse>;
  async catalog(query: CatalogQuery = {}): Promise<CatalogResponse> {
    const search = catalogSearch(query);
    const cached = this.catalogs.get(search);
    if (cached && Date.now() - cached.validatedAt < CATALOG_TTL_MS) return cached.body;

    const pending = this.revalidations.get(search);
    if (pending) return pending;
    const revalidation = this.revalidate(search, cached).finally(() => this.revalidations.delete(search));
    this.revalidations.set(search, revalidation);
    return revalidation;
  }

  private async revalidate(search: string, cached: CatalogEntry | undefined): Promise<CatalogResponse> {
    const headers = new Headers({ accept: 'application/json' });
    if (cached?.etag) headers.set('if-none-match', cached.etag);
    const response = await this.fetch(`${this.baseUrl}/catalog${search ? `?${search}` : ''}`, { headers });
    if (response.status === 304 && cached) {
      await response.body?.cancel();
      this.catalogs.set(search, { ...cached, validatedAt: Date.now() });
      return cached.body;
    }
    if (!response.ok) throw await readError(response);

    const body = deepFreeze(await readJson<CatalogResponse>(response));
    this.catalogs.set(search, { body, etag: response.headers.get('etag'), validatedAt: Date.now() });
    return body;
  }

  private async post<T extends { synapse: SynapseEnvelopeInput }>(path: string, body: T, options: SynapseCallOptions, accept = 'application/json'): Promise<Response> {
    const payload = JSON.stringify({ ...body, synapse: withRequestId(body.synapse) });
    const headers = { 'content-type': 'application/json', accept };
    const response = await this.fetch(`${this.baseUrl}${path}`, { method: 'POST', headers, body: payload, signal: options.signal });
    if (!response.ok) throw await readError(response);
    return response;
  }

  private async send(input: string | URL | Request, init: RequestInit): Promise<Response> {
    try {
      return await this.transport(input, init);
    } catch (error) {
      if (init.signal?.aborted || isAbortError(error)) throw error;
      if (!isReplayable(input, init)) throw networkError(error);
      this.logger.warn('synapse connection failed; retrying once', { url: input instanceof Request ? input.url : String(input), reason: reasonOf(error) });
    }

    try {
      return await this.transport(input, init);
    } catch (error) {
      if (init.signal?.aborted || isAbortError(error)) throw error;
      throw networkError(error);
    }
  }
}
