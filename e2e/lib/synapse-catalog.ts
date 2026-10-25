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
  readonly state: 'PUBLISHED' | 'ARCHIVED';
}

export type CatalogDocumentJson = Record<string, unknown>;

export interface ActiveCatalog {
  readonly version: number | null;
  readonly document: CatalogDocumentJson;
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

export function applyCatalogChange(ctx: APIRequestContext, document: CatalogDocumentJson, expectedVersion: number | null): Promise<APIResponse> {
  return mutate(ctx, 'post', `${CATALOG_PATH}/changes`, { data: { document, expectedVersion, note: 'e2e catalog change' } });
}

export function rollbackCatalog(ctx: APIRequestContext, version: number, expectedVersion: number): Promise<APIResponse> {
  return mutate(ctx, 'post', `${CATALOG_PATH}/versions/${version}/rollback`, { data: { expectedVersion } });
}

export async function listCatalogVersionSummaries(ctx: APIRequestContext): Promise<CatalogVersionSummary[]> {
  const response = await listCatalogVersions(ctx);
  if (response.status() !== 200) throw new SynapseCatalogError(`listing catalog versions answered ${response.status()}: ${await response.text()}`);
  return ((await response.json()) as { items: CatalogVersionSummary[] }).items;
}

export async function readActiveCatalog(ctx: APIRequestContext): Promise<ActiveCatalog> {
  const published = (await listCatalogVersionSummaries(ctx)).find(item => item.state === 'PUBLISHED');
  if (!published) return { version: null, document: EMPTY_DOCUMENT };
  const version = await getCatalogVersion(ctx, published.version);
  if (version.status() !== 200) throw new SynapseCatalogError(`reading catalog v${published.version} answered ${version.status()}: ${await version.text()}`);
  return { version: published.version, document: ((await version.json()) as { document: CatalogDocumentJson }).document };
}

export async function readLatestCatalogVersion(): Promise<number> {
  const [row] = await synapseDb()<{ version: number }[]>`SELECT coalesce(max(version), 0)::int AS version FROM catalog_versions`;
  return row?.version ?? 0;
}
