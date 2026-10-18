import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

import { mutate } from './api';
import { synapseDb } from './db';

export interface CatalogIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface CatalogVersionSummary {
  readonly version: number;
  readonly state: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export type CatalogDocumentJson = Record<string, unknown>;

export interface DraftSnapshot {
  readonly document: CatalogDocumentJson;
  readonly note: string | null;
  readonly createdBy: string | null;
  readonly createdAt: Date;
}

export interface SavedDraft {
  readonly fingerprint: string;
  readonly issues: CatalogIssue[];
}

const CATALOG_PATH = '/api/v1/admin/catalog';
const EMPTY_DOCUMENT: CatalogDocumentJson = { providers: {}, models: {}, aliases: {}, tasks: {}, budgets: [] };

export class SynapseCatalogError extends Error {
  override readonly name = 'SynapseCatalogError';
}

export function uniqueProviderKey(label = 'prov'): string {
  return `e2e-${label}-${randomBytes(4).toString('hex')}`;
}

export function openAiCompatibleProvider(credential: string, url: string): Record<string, unknown> {
  return { kind: 'openai', flavor: 'openai-compatible', url, credential, locality: 'third_party', cost: 'metered' };
}

export function withProviders(document: CatalogDocumentJson, providers: Record<string, unknown>): CatalogDocumentJson {
  return { ...document, providers: { ...(document['providers'] as Record<string, unknown> | undefined), ...providers } };
}

export function listCatalogVersions(ctx: APIRequestContext): Promise<APIResponse> {
  return ctx.get(`${CATALOG_PATH}/versions`);
}

export function getCatalogVersion(ctx: APIRequestContext, version: number): Promise<APIResponse> {
  return ctx.get(`${CATALOG_PATH}/versions/${version}`);
}

export function getCatalogDraft(ctx: APIRequestContext): Promise<APIResponse> {
  return ctx.get(`${CATALOG_PATH}/draft`);
}

export function putCatalogDraft(ctx: APIRequestContext, document: CatalogDocumentJson): Promise<APIResponse> {
  return mutate(ctx, 'put', `${CATALOG_PATH}/draft`, { data: { document, note: 'e2e credential check' } });
}

export function validateCatalogDraft(ctx: APIRequestContext): Promise<APIResponse> {
  return mutate(ctx, 'post', `${CATALOG_PATH}/draft/validate`);
}

export function publishCatalogDraft(ctx: APIRequestContext, fingerprint: string): Promise<APIResponse> {
  return mutate(ctx, 'post', `${CATALOG_PATH}/draft/publish`, { data: { fingerprint } });
}

export async function saveCatalogDraft(ctx: APIRequestContext, document: CatalogDocumentJson): Promise<SavedDraft> {
  const response = await putCatalogDraft(ctx, document);
  if (response.status() !== 200) throw new SynapseCatalogError(`saving the draft answered ${response.status()}: ${await response.text()}`);
  return (await response.json()) as SavedDraft;
}

export async function listCatalogVersionSummaries(ctx: APIRequestContext): Promise<CatalogVersionSummary[]> {
  const response = await listCatalogVersions(ctx);
  if (response.status() !== 200) throw new SynapseCatalogError(`listing catalog versions answered ${response.status()}: ${await response.text()}`);
  return ((await response.json()) as { items: CatalogVersionSummary[] }).items;
}

/** The document a draft built on top of what is already there would start from: the open draft, else the published catalog. */
export async function readBaselineDocument(ctx: APIRequestContext): Promise<CatalogDocumentJson> {
  const draft = await getCatalogDraft(ctx);
  if (draft.status() === 200) return ((await draft.json()) as { draft: { document: CatalogDocumentJson } }).draft.document;

  const published = (await listCatalogVersionSummaries(ctx)).find(item => item.state === 'PUBLISHED');
  if (!published) return EMPTY_DOCUMENT;
  const version = await getCatalogVersion(ctx, published.version);
  if (version.status() !== 200) throw new SynapseCatalogError(`reading catalog v${published.version} answered ${version.status()}: ${await version.text()}`);
  return ((await version.json()) as { document: CatalogDocumentJson }).document;
}

export async function snapshotCatalogDraft(): Promise<DraftSnapshot | null> {
  const [row] = await synapseDb()<DraftSnapshot[]>`
    SELECT document, note, created_by AS "createdBy", created_at AS "createdAt" FROM catalog_versions WHERE state = 'DRAFT'
  `;
  return row ?? null;
}

/** The draft is one row shared by every admin and has no delete route, so what a spec found is written back exactly, or the row it created is dropped. */
export async function restoreCatalogDraft(snapshot: DraftSnapshot | null): Promise<void> {
  const sql = synapseDb();
  if (!snapshot) {
    await sql`DELETE FROM catalog_versions WHERE state = 'DRAFT'`;
    return;
  }
  const restored = await sql`
    UPDATE catalog_versions SET document = ${sql.json(snapshot.document as never)}, note = ${snapshot.note}, created_by = ${snapshot.createdBy}, created_at = ${snapshot.createdAt}
    WHERE state = 'DRAFT'
  `;
  if (restored.count === 0) throw new SynapseCatalogError('the catalog draft a spec found is gone and could not be restored; it was published or removed during the run');
}

export async function readLatestCatalogVersion(): Promise<number> {
  const [row] = await synapseDb()<{ version: number }[]>`SELECT coalesce(max(version), 0)::int AS version FROM catalog_versions WHERE state <> 'DRAFT'`;
  return row?.version ?? 0;
}
