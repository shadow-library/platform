import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { type ServiceErrorBody, type ServiceResponse } from '@shadow-library/clients';
import {
  type ChapterManifest,
  type ChapterUpsertBody,
  type NovelAccessBody,
  type NovelAccessResponse,
  type NovelUpsertBody,
  type WikiManifest as ReaderWikiManifest,
  WebNovelClient,
  type WikiEntryUpsertBody,
} from '@shadow-library/clients/web-novel';
import { WIKI_CAPABILITIES_HEADER, WIKI_HEADLINE_GATE_CAPABILITY } from '@shadow-library/sdk/publishing';

import { APP_NAME } from '@server/constants';

export type NovelPushBody = NovelUpsertBody;

export type AccessPushBody = NovelAccessBody;

export type AccessState = NovelAccessResponse;

export type ChapterPushBody = ChapterUpsertBody;

export type ManifestItem = ChapterManifest[number];

export type WikiPushBody = WikiEntryUpsertBody;

export type WikiManifestItem = ReaderWikiManifest[number];

export interface PushResult {
  outcome: 'applied' | 'noop';
}

export interface WikiManifest {
  items: WikiManifestItem[];
  headlineGate: boolean;
}

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

/** A 409 with no error code: handled as a stale revision (fatal, ledgered, never swept), since retrying a conflict nobody has read is the outcome to avoid. */
export class UnknownConflictError extends Error {
  constructor(
    readonly slug: string,
    readonly incoming: number,
  ) {
    super(`unattributed conflict: the reader rejected revision ${incoming} for '${slug}' with a 409 naming no error code — resolve the ledger before republishing`);
    this.name = 'UnknownConflictError';
  }
}

/** `converge` re-slugs and retries on this, so a chapter row ledgered under it is worth sweeping — unlike every other conflict prefix */
export const SLUG_CONFLICT_ERROR_PREFIX = 'slug conflict:';

/** The reader serves this slug for a different publisher (WBN_010) — every push and unpublish under it is refused until the project publishes under a slug it owns */
export class SlugConflictError extends Error {
  constructor(readonly slug: string) {
    super(`${SLUG_CONFLICT_ERROR_PREFIX} the reader serves '${slug}' for a different publisher — this project cannot write to it`);
    this.name = 'SlugConflictError';
  }
}

/** The reader rehashed our payload and got something else (WBN_011): the forge built the hash and the body inconsistently, so an identical retry cannot pass */
export class PayloadHashMismatchError extends Error {
  constructor(readonly slug: string) {
    super(`payload hash mismatch: the reader rehashed our payload for '${slug}' and got a different contentHash — the push is malformed, not retryable`);
    this.name = 'PayloadHashMismatchError';
  }
}

const STALE_REVISION_CODE = 'WBN_003';
const SLUG_TAKEN_CODE = 'WBN_010';
const HASH_MISMATCH_CODE = 'WBN_011';

function readCapabilities(headers: Headers): Set<string> {
  const raw = headers.get(WIKI_CAPABILITIES_HEADER) ?? '';
  return new Set(raw.split(',').map(value => value.trim()));
}

function describeRejection(error: ServiceErrorBody): string {
  const parts = [error.code, error.message].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(': ')})` : '';
}

/** One-way client for the reader's `/internal/*` surface; a mint or transport failure of the M2M token fails the push soft, ledgered as an error. */
@Injectable()
export class ReaderPushClient {
  private readonly logger = Logger.getLogger(APP_NAME, ReaderPushClient.name);

  constructor(private readonly reader: WebNovelClient) {}

  async upsertNovel(slug: string, body: NovelPushBody): Promise<PushResult> {
    const response = await this.send('PUT', slug, () => this.reader.upsertNovel(slug, body));
    return this.toUpsertResult(response, slug, body.revision);
  }

  async upsertAccess(slug: string, body: AccessPushBody): Promise<PushResult> {
    const response = await this.send('PUT', slug, () => this.reader.upsertAccess(slug, body));
    return this.toUpsertResult(response, slug, body.revision);
  }

  /** The access counterpart of `getManifest`; an unknown novel reads as nothing shared, since the next push creates it. */
  async getAccess(slug: string): Promise<AccessState | undefined> {
    const response = await this.send('GET', slug, () => this.reader.getAccess(slug));
    if (response.status === 404) return undefined;
    if (!response.ok) throw new ReaderPushError(`reader access read answered http ${response.status}`, response.status);
    return response.data ?? undefined;
  }

  async upsertChapter(slug: string, ordinal: number, body: ChapterPushBody): Promise<PushResult> {
    const response = await this.send('PUT', slug, () => this.reader.upsertChapter(slug, ordinal, body));
    return this.toUpsertResult(response, slug, body.revision);
  }

  /** Idempotent on the reader — deleting an absent chapter still answers 204 */
  async deleteChapter(slug: string, ordinal: number): Promise<void> {
    const response = await this.send('DELETE', slug, () => this.reader.deleteChapter(slug, ordinal));
    if (response.status === 204) return;
    this.throwUnpublishRejection(response, slug, 'reader unpublish');
  }

  /** The reconciliation primitive — an unknown novel reads as an empty shelf, since the next novel push creates it */
  async getManifest(slug: string): Promise<ManifestItem[]> {
    const response = await this.send('GET', slug, () => this.reader.getManifest(slug));
    if (response.status === 404) return [];
    if (!response.ok) throw new ReaderPushError(`reader manifest answered http ${response.status}`, response.status);
    return response.data ?? [];
  }

  async upsertWiki(slug: string, entryKey: string, body: WikiPushBody): Promise<PushResult> {
    const response = await this.send('PUT', slug, () => this.reader.upsertWiki(slug, entryKey, body));
    return this.toUpsertResult(response, slug, body.revision);
  }

  /** Idempotent on the reader — deleting an absent wiki entry still answers 204 */
  async deleteWiki(slug: string, entryKey: string): Promise<void> {
    const response = await this.send('DELETE', slug, () => this.reader.deleteWiki(slug, entryKey));
    if (response.status === 204) return;
    this.throwUnpublishRejection(response, slug, 'reader wiki unpublish');
  }

  /** The wiki reconciliation primitive — an unknown novel reads as an empty wiki, since the next entry push creates it */
  async getWikiManifest(slug: string): Promise<WikiManifest> {
    const response = await this.send('GET', slug, () => this.reader.getWikiManifest(slug));
    if (response.status === 404) return { items: [], headlineGate: false };
    if (!response.ok) throw new ReaderPushError(`reader wiki manifest answered http ${response.status}`, response.status);
    return { items: response.data ?? [], headlineGate: readCapabilities(response.headers).has(WIKI_HEADLINE_GATE_CAPABILITY) };
  }

  private async send<T>(method: string, slug: string, call: () => Promise<ServiceResponse<T>>): Promise<ServiceResponse<T>> {
    try {
      return await call();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn('reader push transport failure', { method, slug, message });
      throw new ReaderPushError(`reader service unreachable: ${message}`);
    }
  }

  private throwUnpublishRejection(response: ServiceResponse<unknown>, slug: string, action: string): never {
    const error = response.ok ? {} : response.error;
    if (error.code === SLUG_TAKEN_CODE) throw new SlugConflictError(slug);
    throw new ReaderPushError(`${action} answered http ${response.status}${describeRejection(error)}`, response.status);
  }

  /** The reader's three rejections differ in kind, not in status: WBN_003 and WBN_010 share a 409, so the body's code decides, never the status */
  private toUpsertResult(response: ServiceResponse<unknown>, slug: string, revision: number): PushResult {
    if (response.status === 200) return { outcome: 'applied' };
    if (response.status === 204) return { outcome: 'noop' };
    if (response.ok) throw new ReaderPushError(`reader push answered http ${response.status}`, response.status);

    const code = response.error.code;
    if (code === HASH_MISMATCH_CODE && response.status === 400) throw new PayloadHashMismatchError(slug);
    if (response.status !== 409) throw new ReaderPushError(`reader push answered http ${response.status}${describeRejection(response.error)}`, response.status);
    if (code === SLUG_TAKEN_CODE) throw new SlugConflictError(slug);
    if (code === STALE_REVISION_CODE) throw new StaleRevisionError(revision);
    throw new UnknownConflictError(slug, revision);
  }
}
