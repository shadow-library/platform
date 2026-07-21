/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { type APIResponse, Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME, NOVEL_FORGE_AUDIENCE } from '@server/constants';

/**
 * Defining types
 */

export interface NovelPushBody {
  title: string;
  blurb?: string;
  coverPath?: string;
  genres?: string[];
  status?: 'live' | 'retired';
  revision: number;
}

export interface ChapterPushBody {
  title: string;
  content: string;
  authorNote?: string;
  contentHash: string;
  revision: number;
  wordCount?: number;
  publishedAt?: string;
}

export interface PushResult {
  outcome: 'applied' | 'noop';
}

export interface ManifestItem {
  ordinal: number;
  contentHash: string;
  revision: number;
}

/**
 * Declaring the constants
 */

/** Identity service name (and token audience) of the reader — resolves via `SERVICE_URL_WEBNOVEL_SERVER` or in-cluster svc DNS */
export const READER_SERVICE = 'webnovel-server';

/** The M2M scope the reader's `/internal/*` guard requires; end-user tokens never carry it */
export const READER_PUBLISH_SCOPE = 'webnovel:publish';

/** A hung reader must fail a push (and let the retry loop take over) rather than wedge the job executor */
const PUSH_TIMEOUT_MS = 15_000;

const CREDENTIALS_HINT = 'publish credentials are not configured — set AUTH_M2M_CLIENT_ID and AUTH_M2M_CLIENT_SECRET (or AUTH_M2M_CLIENT_ASSERTION_PATH)';

/** Any reader push failure that is not a revision conflict — transport errors, 5xx, missing credentials */
export class ReaderPushError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ReaderPushError';
  }
}

/** The reader holds a newer revision than our ledger (WBN_003) — fatal for this push, never auto-overwritten */
export class StaleRevisionError extends Error {
  constructor(
    readonly incoming: number,
    readonly stored?: number,
  ) {
    super(`stale revision: the reader already holds revision ${stored ?? 'unknown'}, ours is ${incoming} — resolve the ledger before republishing`);
    this.name = 'StaleRevisionError';
  }
}

/**
 * The one-way HTTP client for the reader's `/internal/*` surface (reader-publish design §5). Every
 * call rides an identity-issued M2M token (scope `webnovel:publish`, audience `webnovel-server`)
 * minted by a dedicated `AuthClient` built lazily from the `auth.m2m.client.*` configs — kept out of
 * the shared `AuthModule` client so booting never depends on identity being reachable.
 */
@Injectable()
export class ReaderPushClient {
  private readonly logger = Logger.getLogger(APP_NAME, ReaderPushClient.name);
  private authClient: AuthClient | null = null;

  async upsertNovel(slug: string, body: NovelPushBody): Promise<PushResult> {
    const response = await this.send('PUT', `/internal/novels/${slug}`, body);
    return this.toUpsertResult(response, body.revision);
  }

  async upsertChapter(slug: string, ordinal: number, body: ChapterPushBody): Promise<PushResult> {
    const response = await this.send('PUT', `/internal/novels/${slug}/chapters/${ordinal}`, body);
    return this.toUpsertResult(response, body.revision);
  }

  /** Idempotent on the reader — deleting an absent chapter still answers 204 */
  async deleteChapter(slug: string, ordinal: number): Promise<void> {
    const response = await this.send('DELETE', `/internal/novels/${slug}/chapters/${ordinal}`);
    if (response.statusCode !== 204) throw new ReaderPushError(`reader unpublish answered http ${response.statusCode}`, response.statusCode);
  }

  /** The reconciliation primitive — an unknown novel reads as an empty shelf, since the next novel push creates it */
  async getManifest(slug: string): Promise<ManifestItem[]> {
    const response = await this.send<ManifestItem[]>('GET', `/internal/novels/${slug}/manifest`);
    if (response.statusCode === 404) return [];
    if (response.statusCode >= 400) throw new ReaderPushError(`reader manifest answered http ${response.statusCode}`, response.statusCode);
    return response.data ?? [];
  }

  private async send<T = unknown>(method: string, path: string, body?: unknown): Promise<APIResponse<T>> {
    const init: RequestInit = { method, signal: AbortSignal.timeout(PUSH_TIMEOUT_MS) };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    try {
      return await this.getAuthClient().fetchService<T>(READER_SERVICE, path, init, { scopes: [READER_PUBLISH_SCOPE] });
    } catch (err) {
      if (err instanceof ReaderPushError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn('reader push transport failure', { method, path, message });
      throw new ReaderPushError(`reader service unreachable: ${message}`);
    }
  }

  private toUpsertResult(response: APIResponse<unknown>, revision: number): PushResult {
    if (response.statusCode === 200) return { outcome: 'applied' };
    if (response.statusCode === 204) return { outcome: 'noop' };
    if (response.statusCode === 409) throw new StaleRevisionError(revision);
    throw new ReaderPushError(`reader push answered http ${response.statusCode}`, response.statusCode);
  }

  // Lazily constructed so the app boots (and every non-publishing feature works) with no M2M
  // credentials configured; the first push without them fails soft with an actionable message.
  private getAuthClient(): AuthClient {
    if (this.authClient) return this.authClient;
    const id = Config.get('auth.m2m.client.id');
    if (!id) throw new ReaderPushError(CREDENTIALS_HINT);
    const secret = Config.get('auth.m2m.client.secret') || undefined;
    const assertionPath = Config.get('auth.m2m.client.assertion-path') || undefined;
    this.authClient = new AuthClient({ issuer: Config.get('auth.issuer'), audience: NOVEL_FORGE_AUDIENCE, client: { id, secret, assertionPath } });
    this.logger.info('reader push client initialised', { clientId: id, reader: READER_SERVICE });
    return this.authClient;
  }
}
