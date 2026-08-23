import { csrfSetCookie, ensureCsrfToken, resolveCsrfConfig } from '@shadow-library/web';

import { type CommandBatchResponse, type CommandEnvelope, type DeltaPage, type DeltaResponse, type SyncDomain } from './sync.types';

export type SyncFailureKind = 'unauthorized' | 'offline' | 'rejected' | 'server';

/** Every non-2xx the sync layer can act on, named — the engine branches on `kind`, never on a status number. */
export class SyncTransportError extends Error {
  constructor(
    readonly kind: SyncFailureKind,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SyncTransportError';
  }
}

export interface SyncClientOptions {
  basePath?: string;
  fetchImpl?: typeof fetch;
}

export interface DeltaRequest {
  since: string;
  domains?: SyncDomain[];
  limit?: number;
}

const SYNC_EPOCH_HEADER = 'x-sync-epoch';

function classify(status: number): SyncFailureKind {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status >= 400 && status < 500) return 'rejected';
  return 'server';
}

/**
 * The sync endpoints go out through `fetch` rather than the app's `APIRequest`: both carry the sync epoch
 * in a response *header*, and the shared client deliberately exposes only the typed body. The CSRF
 * double-submit is still the package's — only the response-reading half is local.
 */
export class SyncClient {
  private readonly basePath: string;
  private readonly fetchImpl: typeof fetch;
  private readonly csrf = resolveCsrfConfig();

  constructor(options: SyncClientOptions = {}) {
    this.basePath = options.basePath ?? '/api/v1';
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  async postCommands(commands: CommandEnvelope[]): Promise<CommandBatchResponse> {
    const response = await this.send('POST', '/sync/commands', { commands });
    const body = (await response.json()) as { outcomes: CommandBatchResponse['outcomes'] };
    return { outcomes: body.outcomes, epoch: response.headers.get(SYNC_EPOCH_HEADER) };
  }

  async pullDelta(request: DeltaRequest): Promise<DeltaResponse> {
    const query = new URLSearchParams({ since: request.since });
    if (request.domains?.length) query.set('domains', request.domains.join(','));
    if (request.limit !== undefined) query.set('limit', String(request.limit));

    const response = await this.send('GET', `/sync/delta?${query.toString()}`);
    return { page: (await response.json()) as DeltaPage, epoch: response.headers.get(SYNC_EPOCH_HEADER) };
  }

  async registerDevice(deviceId: string, userAgent: string | undefined): Promise<void> {
    await this.send('PUT', `/account/devices/${deviceId}`, { userAgent, pushOptIn: false });
  }

  private async send(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET' && typeof document !== 'undefined') {
      const token = ensureCsrfToken(document.cookie, this.csrf);
      if (token.mintedValue) document.cookie = csrfSetCookie(token.mintedValue, this.csrf);
      headers[this.csrf.header] = token.token;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.basePath}${path}`, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new SyncTransportError('offline', 0, 'Unable to reach the server');
    }

    if (!response.ok) throw new SyncTransportError(classify(response.status), response.status, await readMessage(response));
    return response;
  }
}

async function readMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}
