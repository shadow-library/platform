import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { type APIResponse, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

export interface NovelPushBody {
  title: string;
  blurb?: string;
  coverPath?: string;
  genres?: string[];
  status?: 'live' | 'retired';
  /** Required by the reader, not optional: a default would let a dropped field publish a private novel publicly. */
  visibility: 'PUBLIC' | 'ORGANISATION' | 'RESTRICTED';
  revision: number;
}

export interface AccessPushBody {
  visibility: 'PUBLIC' | 'ORGANISATION' | 'RESTRICTED';
  organisationId?: string;
  subjectIds?: string[];
  revision: number;
}

export interface AccessState {
  visibility: 'PUBLIC' | 'ORGANISATION' | 'RESTRICTED';
  organisationId?: string;
  subjectIds: string[];
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

/** The reader-clean wiki-entry push body (reader-publish design §5 wiki extension) — payload plus its concurrency keys. */
export interface WikiPushBody {
  type: 'character' | 'faction' | 'location' | 'item' | 'concept' | 'power_rule';
  name: string;
  imageRef?: string;
  firstVisibleOrdinal: number;
  contentHash: string;
  revision: number;
  facets: { facetKey: string; content: string; sortOrder: number; visibleFromOrdinal: number }[];
  images: { imageRef: string; caption?: string; sortOrder: number; visibleFromOrdinal: number }[];
}

export interface WikiManifestItem {
  entryKey: string;
  revision: number;
  contentHash: string;
}

/** Identity service name of the reader — resolves via `SERVICE_URL_WEB_NOVEL_SERVER` or in-cluster svc DNS */
export const READER_SERVICE = 'web-novel-server';

/** RFC 8707 resource the M2M token is addressed to; the reader accepts exactly this `aud`, not the service name */
export const READER_RESOURCE = 'api://web-novel';

/** The M2M scope the reader's `/internal/*` guard requires; end-user tokens never carry it */
export const READER_PUBLISH_SCOPE = 'web-novel:publish';

/** Any reader push failure that is not a revision conflict — transport errors, 5xx, unmintable token */
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
 * call rides an identity-issued M2M token addressed to `api://web-novel` and carrying the
 * cross-application scope `web-novel:publish`, minted by the DI-injected `AuthClient` — built from the
 * forge's own `AUTH_*` registration, no separate credential to configure. A mint or transport failure
 * (reader unreachable, a revoked cross-application grant) fails the push soft, ledgered as an error,
 * while every non-publishing feature stays untouched. The request-timeout budget is `AUTH_TIMEOUT`.
 */
@Injectable()
export class ReaderPushClient {
  private readonly logger = Logger.getLogger(APP_NAME, ReaderPushClient.name);

  constructor(private readonly authClient: AuthClient) {}

  async upsertNovel(slug: string, body: NovelPushBody): Promise<PushResult> {
    const response = await this.send('PUT', `/internal/novels/${slug}`, body);
    return this.toUpsertResult(response, body.revision);
  }

  async upsertAccess(slug: string, body: AccessPushBody): Promise<PushResult> {
    const response = await this.send('PUT', `/internal/novels/${slug}/access`, body);
    return this.toUpsertResult(response, body.revision);
  }

  /** The access counterpart of `getManifest`; an unknown novel reads as nothing shared, since the next push creates it. */
  async getAccess(slug: string): Promise<AccessState | undefined> {
    const response = await this.send<AccessState>('GET', `/internal/novels/${slug}/access`);
    if (response.statusCode === 404) return undefined;
    if (response.statusCode >= 400) throw new ReaderPushError(`reader access read answered http ${response.statusCode}`, response.statusCode);
    return response.data ?? undefined;
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

  async upsertWiki(slug: string, entryKey: string, body: WikiPushBody): Promise<PushResult> {
    const response = await this.send('PUT', `/internal/novels/${slug}/wiki/${entryKey}`, body);
    return this.toUpsertResult(response, body.revision);
  }

  /** Idempotent on the reader — deleting an absent wiki entry still answers 204 */
  async deleteWiki(slug: string, entryKey: string): Promise<void> {
    const response = await this.send('DELETE', `/internal/novels/${slug}/wiki/${entryKey}`);
    if (response.statusCode !== 204) throw new ReaderPushError(`reader wiki unpublish answered http ${response.statusCode}`, response.statusCode);
  }

  /** The wiki reconciliation primitive — an unknown novel reads as an empty wiki, since the next entry push creates it */
  async getWikiManifest(slug: string): Promise<WikiManifestItem[]> {
    const response = await this.send<WikiManifestItem[]>('GET', `/internal/novels/${slug}/wiki/manifest`);
    if (response.statusCode === 404) return [];
    if (response.statusCode >= 400) throw new ReaderPushError(`reader wiki manifest answered http ${response.statusCode}`, response.statusCode);
    return response.data ?? [];
  }

  private async send<T = unknown>(method: string, path: string, body?: unknown): Promise<APIResponse<T>> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    try {
      return await this.authClient.fetchService<T>(READER_SERVICE, path, init, { resource: READER_RESOURCE, scopes: [READER_PUBLISH_SCOPE] });
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
}
