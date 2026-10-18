import { type CatalogIssueResponse, type CatalogVersionSummaryResponse, type DraftResponse } from '@/lib';

export type CatalogDocument = Record<string, unknown>;

export type ParsedCatalog = { ok: true; document: CatalogDocument } | { ok: false; error: string };

export type DocumentEdit = { ok: true; document: CatalogDocument } | { ok: false; reason: string };

export type RetargetResult = DocumentEdit;

export type AliasState = 'active' | 'hidden' | 'retired';

export interface AliasEntry {
  key: string;
  label: string;
  description?: string;
  model: string;
  state: AliasState;
  showVersion: boolean;
  available?: Record<string, string[]>;
}

export interface ModelEntry {
  key: string;
  label: string;
  version?: string;
}

export interface ProviderEntry {
  key: string;
  kind?: string;
  url: string;
  credential?: string;
  apiKeyConfig?: string;
}

export interface EditorSource {
  text: string;
  note: string;
  /** The draft the text was loaded from; `null` when there was no draft and the text came from the active version. */
  fingerprint: string | null;
}

export interface DraftExpectation {
  expectedFingerprint?: string;
  expectNoDraft?: boolean;
}

export const EMPTY_CATALOG: CatalogDocument = { providers: {}, models: {}, aliases: {}, tasks: {}, budgets: [] };

const CREDENTIAL_ISSUE_CODES: readonly string[] = ['unknown_credential', 'credential_revoked', 'credential_origin_mismatch'];
const CREDENTIAL_ISSUE_PATH = /^providers\.(.+)\.(?:credential|url)$/;

const ALIAS_STATES: readonly string[] = ['active', 'hidden', 'retired'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

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

export function editorSourceOf(draft: DraftResponse | null, active: CatalogDocument | null): EditorSource {
  if (draft) return { text: formatCatalog(draft.draft.document), note: draft.draft.note ?? '', fingerprint: draft.fingerprint };
  return { text: formatCatalog(active ?? EMPTY_CATALOG), note: '', fingerprint: null };
}

/** Tells the server which draft a save replaces, so it refuses the save when someone else's draft has taken that one's place. */
export function draftExpectation(fingerprint: string | null): DraftExpectation {
  return fingerprint === null ? { expectNoDraft: true } : { expectedFingerprint: fingerprint };
}

/** The highest published version is the one replicas serve; the list arrives newest first but is not trusted to. */
export function activeVersionOf(versions: readonly CatalogVersionSummaryResponse[]): CatalogVersionSummaryResponse | undefined {
  return versions
    .filter(version => version.state === 'PUBLISHED')
    .reduce<CatalogVersionSummaryResponse | undefined>((best, version) => (!best || version.version > best.version ? version : best), undefined);
}

export function issuePathLabel(path: string): string {
  return path === '' ? '(document)' : path;
}

function availableOf(value: unknown): Record<string, string[]> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).map(([selector, allowed]) => [selector, Array.isArray(allowed) ? allowed.filter(item => typeof item === 'string') : []] as const);
  return Object.fromEntries(entries);
}

/** The document is `unknown` on the wire, so an entry that does not look like an alias is skipped rather than rendered half-empty. */
export function readAliases(document: CatalogDocument): AliasEntry[] {
  if (!isRecord(document.aliases)) return [];
  return Object.entries(document.aliases).flatMap(([key, value]): AliasEntry[] => {
    if (!isRecord(value)) return [];
    const model = text(value.model);
    const state = text(value.state);
    if (!model || !state || !ALIAS_STATES.includes(state)) return [];
    const description = text(value.description);
    const available = availableOf(value.available);
    return [
      {
        key,
        label: text(value.label) ?? key,
        model,
        state: state as AliasState,
        showVersion: value.showVersion === true,
        ...(description !== undefined && { description }),
        ...(available !== undefined && { available }),
      },
    ];
  });
}

export function readModels(document: CatalogDocument): ModelEntry[] {
  if (!isRecord(document.models)) return [];
  return Object.entries(document.models).flatMap(([key, value]): ModelEntry[] => {
    if (!isRecord(value)) return [];
    const version = text(value.version);
    return [{ key, label: text(value.label) ?? key, ...(version !== undefined && { version }) }];
  });
}

export function describeAvailability(available?: Record<string, string[]>): string {
  const rules = Object.entries(available ?? {});
  if (rules.length === 0) return 'Everywhere';
  return rules.map(([selector, values]) => `${selector}: ${values.join(', ')}`).join('; ');
}

export function withAliasModel(document: CatalogDocument, aliasKey: string, model: string): RetargetResult {
  const aliases = document.aliases;
  if (!isRecord(aliases) || !Object.hasOwn(aliases, aliasKey)) return { ok: false, reason: `The draft has no alias "${aliasKey}"` };
  const alias = aliases[aliasKey];
  if (!isRecord(alias)) return { ok: false, reason: `The draft's alias "${aliasKey}" is not an object` };
  if (alias.model === model) return { ok: false, reason: `The draft already targets ${model}` };
  return { ok: true, document: { ...document, aliases: { ...aliases, [aliasKey]: { ...alias, model } } } };
}

export function readProviders(document: CatalogDocument): ProviderEntry[] {
  if (!isRecord(document.providers)) return [];
  return Object.entries(document.providers).flatMap(([key, value]): ProviderEntry[] => {
    if (!isRecord(value)) return [];
    const kind = text(value.kind);
    const credential = text(value.credential);
    const apiKeyConfig = text(value.apiKeyConfig);
    return [
      {
        key,
        url: text(value.url) ?? '',
        ...(kind !== undefined && { kind }),
        ...(credential !== undefined && { credential }),
        ...(apiKeyConfig !== undefined && { apiKeyConfig }),
      },
    ];
  });
}

function editProvider(document: CatalogDocument, providerKey: string, edit: (provider: Record<string, unknown>) => Record<string, unknown>): DocumentEdit {
  const providers = document.providers;
  if (!isRecord(providers) || !Object.hasOwn(providers, providerKey)) return { ok: false, reason: `The draft has no provider "${providerKey}"` };
  const provider = providers[providerKey];
  if (!isRecord(provider)) return { ok: false, reason: `The draft's provider "${providerKey}" is not an object` };
  return { ok: true, document: { ...document, providers: { ...providers, [providerKey]: edit(provider) } } };
}

/** A provider names either a credential or a deprecated `apiKeyConfig`, never both, so choosing a credential drops the config key. */
export function withProviderCredential(document: CatalogDocument, providerKey: string, credentialId: string): DocumentEdit {
  return editProvider(document, providerKey, ({ apiKeyConfig: _dropped, ...provider }) => ({ ...provider, credential: credentialId }));
}

export function withoutProviderCredential(document: CatalogDocument, providerKey: string): DocumentEdit {
  return editProvider(document, providerKey, ({ credential: _dropped, ...provider }) => provider);
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
