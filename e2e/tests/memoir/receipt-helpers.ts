/**
 * Importing npm packages
 */
import { type APIRequestContext, request } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { memoirMutate } from './helpers';

/**
 * Defining types
 */

export interface MintedReceipt {
  ref: string;
  uploadUrl: string;
  contentType: string;
  sizeBytes: number;
}

export type StoredReceipt = MintedReceipt;

/**
 * Declaring the constants
 *
 * The presigned-URL real-upload flow (ARCHITECTURE §19.2): `POST /receipts` mints the ref and a `PUT` URL
 * signed against `storage.s3.external-endpoint` — a public host reachable from outside the cluster, not
 * cluster-internal — then `POST /receipts/{ref}/confirm` HEAD-verifies the upload and flips the row to
 * `stored`. Content need not be a real image: the server only checks the declared/HEAD-observed size and
 * content type, never the bytes. `mintReceipt`/`uploadAndConfirm` are split rather than one call so a
 * caller can hold the ref the instant it exists in the database — before any bytes cross the wire — since
 * that ref is the only thing a partial-failure cleanup needs.
 */
const RECEIPT_CONTENT_TYPE = 'image/jpeg';
const RECEIPT_BYTES = Buffer.from('e2e-memoir-receipt-fixture'.repeat(8));

/** Uploads `bytes` to a presigned `PUT` URL against the external storage host, outside memoir's own origin. */
async function putObject(uploadUrl: string, bytes: Buffer, contentType: string): Promise<void> {
  const raw = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const put = await raw.put(uploadUrl, { data: bytes, headers: { 'content-type': contentType } });
    if (!put.ok()) throw new Error(`PUT to presigned upload URL failed: ${put.status()} ${await put.text()}`);
  } finally {
    await raw.dispose();
  }
}

/** `POST /receipts` — the ref exists in the database (status `pending_upload`) the instant this resolves. */
export async function mintReceipt(ctx: APIRequestContext, options: { contentType?: string; sizeBytes?: number } = {}): Promise<MintedReceipt> {
  const contentType = options.contentType ?? RECEIPT_CONTENT_TYPE;
  const sizeBytes = options.sizeBytes ?? RECEIPT_BYTES.length;

  const created = await memoirMutate(ctx, 'post', '/api/v1/receipts', { data: { contentType, sizeBytes } });
  if (!created.ok()) throw new Error(`POST /receipts failed: ${created.status()} ${await created.text()}`);
  const { ref, uploadUrl } = (await created.json()) as { ref: string; uploadUrl: string };
  return { ref, uploadUrl, contentType, sizeBytes };
}

/** Uploads `bytes` to `minted`'s presigned URL and confirms it, flipping the row to `stored`. */
export async function uploadAndConfirm(ctx: APIRequestContext, minted: MintedReceipt, bytes: Buffer = RECEIPT_BYTES): Promise<void> {
  await putObject(minted.uploadUrl, bytes, minted.contentType);

  const confirmed = await memoirMutate(ctx, 'post', `/api/v1/receipts/${encodeURIComponent(minted.ref)}/confirm`);
  if (!confirmed.ok()) throw new Error(`POST /receipts/${minted.ref}/confirm failed: ${confirmed.status()} ${await confirmed.text()}`);
}

/** Runs the full presign → upload → confirm flow for `ctx`'s account and hands back the stored ref. */
export async function storeReceipt(ctx: APIRequestContext, options: { contentType?: string; bytes?: Buffer } = {}): Promise<StoredReceipt> {
  const bytes = options.bytes ?? RECEIPT_BYTES;
  const minted = await mintReceipt(ctx, { contentType: options.contentType, sizeBytes: bytes.length });
  await uploadAndConfirm(ctx, minted, bytes);
  return minted;
}

/** Issues a raw `GET` against a previously-minted presigned URL, bypassing memoir's own API — proves the storage object itself is gone, not just the app's route. */
export async function fetchPresignedUrl(url: string): Promise<{ status: number; body: string }> {
  const raw = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const response = await raw.get(url);
    return { status: response.status(), body: await response.text() };
  } finally {
    await raw.dispose();
  }
}
