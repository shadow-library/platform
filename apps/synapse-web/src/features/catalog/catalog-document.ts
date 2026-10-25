import { type CatalogIssueResponse, type CatalogVersionSummaryResponse, type DraftResponse } from '@/lib/apis/api-types.gen';

import { isRecord } from './catalog-values';

export type CatalogDocument = Record<string, unknown>;

export type ParsedCatalog = { ok: true; document: CatalogDocument } | { ok: false; error: string };

export type DocumentEdit = { ok: true; document: CatalogDocument } | { ok: false; reason: string };

export interface EditorSource {
  text: string;
  note: string;
  /** The draft the text was loaded from; `null` when there was no draft and the text came from the active version. */
  fingerprint: string | null;
  /** With no draft, the active version the text came from; a new draft is pinned to it */
  activeVersion?: number;
}

export interface DraftExpectation {
  expectedFingerprint?: string;
  expectNoDraft?: boolean;
  expectedActiveVersion?: number;
}

export const EMPTY_CATALOG: CatalogDocument = { providers: {}, models: {}, aliases: {}, tasks: {}, budgets: [] };

const CREDENTIAL_ISSUE_CODES: readonly string[] = ['unknown_credential', 'credential_revoked', 'credential_origin_mismatch'];
const CREDENTIAL_ISSUE_PATH = /^providers\.(.+)\.(?:credential|url)$/;

export function formatCatalog(document: CatalogDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseCatalog(source: string): ParsedCatalog {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return { ok: false, error: error instanceof SyntaxError ? error.message : 'The text is not valid JSON' };
  }
  if (!isRecord(value)) return { ok: false, error: 'The catalog must be a JSON object' };
  return { ok: true, document: value };
}

export interface ActiveDocument {
  version: number;
  document: CatalogDocument;
}

export function editorSourceOf(draft: DraftResponse | null, active: ActiveDocument | null): EditorSource {
  if (draft) return { text: formatCatalog(draft.draft.document), note: draft.draft.note ?? '', fingerprint: draft.fingerprint };
  return { text: formatCatalog(active?.document ?? EMPTY_CATALOG), note: '', fingerprint: null, ...(active && { activeVersion: active.version }) };
}

/** Names the draft a save replaces so the server refuses a stale one; a first draft pins its active version so it can't revert a publish made meanwhile. */
export function draftExpectation(fingerprint: string | null, activeVersion?: number): DraftExpectation {
  if (fingerprint !== null) return { expectedFingerprint: fingerprint };
  return { expectNoDraft: true, ...(activeVersion !== undefined && { expectedActiveVersion: activeVersion }) };
}

/** The highest published version is the one replicas serve; the list arrives newest first but is not trusted to. */
export function activeVersionOf(versions: readonly CatalogVersionSummaryResponse[]): CatalogVersionSummaryResponse | undefined {
  return versions
    .filter(version => version.state === 'PUBLISHED')
    .reduce<CatalogVersionSummaryResponse | undefined>((best, version) => (!best || version.version > best.version ? version : best), undefined);
}

export function issuePathLabel(path: string): string {
  return path === '' ? '(whole catalog)' : path;
}

export function credentialIssuesByProvider(issues: readonly CatalogIssueResponse[]): Map<string, CatalogIssueResponse[]> {
  const grouped = new Map<string, CatalogIssueResponse[]>();
  for (const issue of issues) {
    if (!CREDENTIAL_ISSUE_CODES.includes(issue.code)) continue;
    const providerKey = CREDENTIAL_ISSUE_PATH.exec(issue.path)?.[1];
    if (providerKey === undefined) continue;
    grouped.set(providerKey, [...(grouped.get(providerKey) ?? []), issue]);
  }
  return grouped;
}
