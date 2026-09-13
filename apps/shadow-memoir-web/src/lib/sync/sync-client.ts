import { csrfSetCookie, ensureCsrfToken, isApiError, resolveCsrfConfig } from '@shadow-library/web';

import { type CommandBatchResponse, type CommandEnvelope, type DeltaPage, type DeltaResponse, type SyncDomain, type SyncFailureReason } from './sync.types';

export type SyncFailureKind = 'unauthorized' | 'forbidden' | 'deletion-pending' | 'offline' | 'rejected' | 'server';

const DELETION_PENDING_CODE = 'ACC_002';

const FAILURE_REASONS: Record<SyncFailureKind, SyncFailureReason> = {
  unauthorized: 'signed-out',
  forbidden: 'server',
  'deletion-pending': 'deletion-pending',
  offline: 'offline',
  rejected: 'server',
  server: 'server',
};

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

/** Only a 401 means the session itself is gone. A 403 refuses this one request — a CSRF token the server did not recognise, a guard this route applies — and retrying is the honest answer to it. */
function classify(status: number, code: string | null): SyncFailureKind {
  if (code === DELETION_PENDING_CODE) return 'deletion-pending';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status >= 400 && status < 500) return 'rejected';
  return 'server';
}

function failureReasonOf(error: unknown): SyncFailureReason {
  if (error instanceof SyncTransportError) return FAILURE_REASONS[error.kind];
  if (!isApiError(error)) return 'server';
  if (error.code === DELETION_PENDING_CODE) return 'deletion-pending';
  if (error.status === 401) return 'signed-out';
  return error.code === 'NETWORK_ERROR' ? 'offline' : 'server';
}

export function toSyncFailureReason(error: unknown, online: boolean): SyncFailureReason {
  const reason = failureReasonOf(error);
  // A network error while the browser reports a connection is an unreachable server, and no `online` event will ever retry it.
  return reason === 'offline' && online ? 'server' : reason;
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

    if (!response.ok) {
      const failure = await readFailure(response);
      throw new SyncTransportError(classify(response.status, failure.code), response.status, failure.message);
    }
    return response;
  }
}

async function readFailure(response: Response): Promise<{ code: string | null; message: string }> {
  const fallback = `Request failed with status ${response.status}`;
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown };
    return { code: typeof body.code === 'string' ? body.code : null, message: typeof body.message === 'string' ? body.message : fallback };
  } catch {
    return { code: null, message: fallback };
  }
}
