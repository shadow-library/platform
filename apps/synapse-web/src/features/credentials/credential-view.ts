import { isApiError } from '@shadow-library/web';

import { type ProviderEntry, type WebSearchSpec } from '@/features/catalog/catalog-spec.types';
import { ownEntry } from '@/features/catalog/catalog-values';
import { formatDate } from '@/features/shared/format';
import { providerName } from '@/features/shared/naming';
import { type CreateCredentialBody, type CredentialResponse, type CredentialTestResponse, type ProviderResponse } from '@/lib/apis/api-types.gen';

export const CREDENTIAL_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const SECRET_MIN_LENGTH = 8;
export const SECRET_MAX_LENGTH = 4096;

const SECRET_PATTERN = /^[\x21-\x7e]+$/;
const WHITESPACE = /\s/;
const HTTP_PROTOCOLS = ['http:', 'https:'];
const HIDDEN_HINT = '…';

/** How synapse-server's `referencedBy` names the web search tool, alongside provider keys. */
export const WEB_SEARCH_HOLDER = 'tools.webSearch';

const BRAVE_ORIGIN = 'https://api.search.brave.com';

export type CreateField = keyof CreateCredentialBody;
export type FieldErrors = Partial<Record<CreateField, string>>;

export type Destination = { kind: 'provider'; origin: string | null } | { kind: 'address'; input: string };

export interface KeyDestination {
  origin: string;
  /** Provider keys, and `WEB_SEARCH_HOLDER` for the web search tool */
  holders: string[];
}

export type CreateValidation = { ok: true; body: CreateCredentialBody } | { ok: false; errors: FieldErrors };
export type SecretValidation = { ok: true; secret: string } | { ok: false; error: string };

export interface TestReport {
  ok: boolean;
  message: string;
}

export type KeyStatus =
  | { kind: 'not_needed' }
  | { kind: 'configured' }
  | { kind: 'missing' }
  | { kind: 'credential'; name?: string }
  | { kind: 'credential_revoked'; name: string }
  | { kind: 'credential_unknown' };

const TEST_MESSAGES: Readonly<Record<string, string>> = {
  revoked_api_key: 'The credential is revoked.',
  credential_unreadable: 'The stored key could not be decrypted. Check the keyring, or rotate the key.',
  invalid_api_key: 'The provider rejected the key as invalid.',
  unauthorized: 'The provider refused the key.',
  rate_limited: 'The provider is rate limiting this key; try again shortly.',
  not_found: 'The provider has no key-check endpoint at this address.',
  redirected: 'The provider redirected the check; a key is never sent across a redirect.',
  rejected: 'The provider rejected the check.',
  upstream_error: 'The provider answered with a server error.',
  timeout: 'The provider did not answer in time.',
  connect: 'The provider could not be reached.',
};

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  CRED_NAME_TAKEN: 'A credential with this name already exists. A revoked credential keeps its name, so pick another.',
  CRED_REVOKED: 'This credential is revoked, so it can no longer be rotated.',
  SYN_INVALID_REQUEST: 'The address or the key was refused. The address is a scheme, host and optional port with no path; the key is 8 to 4096 visible characters with no spaces.',
};

const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  403: 'Your role cannot manage credentials.',
  404: 'This credential no longer exists.',
};

export function isRevoked(credential: Pick<CredentialResponse, 'revokedAt'>): boolean {
  return credential.revokedAt !== undefined;
}

export function sortCredentials(credentials: readonly CredentialResponse[]): CredentialResponse[] {
  return [...credentials].sort((a, b) => Number(isRevoked(a)) - Number(isRevoked(b)) || a.name.localeCompare(b.name));
}

export function originOfUrl(url: string): string | null {
  const value = url.trim();
  if (!URL.canParse(value)) return null;
  const parsed = new URL(value);
  return HTTP_PROTOCOLS.includes(parsed.protocol) ? parsed.origin : null;
}

/** Mirrors the server's rule, which refuses a path, query, fragment or embedded login rather than trimming it. */
export function normaliseOriginInput(input: string): string | null {
  const value = input.trim();
  if (WHITESPACE.test(value) || !URL.canParse(value)) return null;
  const parsed = new URL(value);
  if (!HTTP_PROTOCOLS.includes(parsed.protocol)) return null;
  if (parsed.username || parsed.password || parsed.pathname !== '/' || value.includes('?') || value.includes('#')) return null;
  return parsed.origin;
}

/** "openrouter.ai" for https; any other scheme stays visible ("http://localhost:8080") so an unencrypted binding is never disguised. */
export function originHost(origin: string): string {
  if (!URL.canParse(origin)) return origin;
  const { protocol, host } = new URL(origin);
  return protocol === 'https:' ? host : `${protocol}//${host}`;
}

export function holderName(holder: string): string {
  return holder === WEB_SEARCH_HOLDER ? 'Web search' : providerName(holder);
}

function referenceName(holder: string): string {
  return holder === WEB_SEARCH_HOLDER ? 'web search' : holder;
}

function webSearchOrigin(search: Pick<WebSearchSpec, 'kind' | 'url'> | undefined): string | null {
  return search && search.kind !== 'mock' ? originOfUrl(search.url) : BRAVE_ORIGIN;
}

/**
 * A key is bound to an origin rather than a provider, so providers sharing an address share one destination; ollama never sends a key. Web search
 * is a destination even before it is set up, at Brave's address, because its editor cannot save a Brave search until a key for it is stored.
 */
export function keyDestinations(providers: readonly Pick<ProviderEntry, 'key' | 'kind' | 'url'>[], webSearch?: Pick<WebSearchSpec, 'kind' | 'url'>): KeyDestination[] {
  const byOrigin = new Map<string, Set<string>>();
  const add = (origin: string | null, holder: string): void => {
    if (origin !== null) byOrigin.set(origin, (byOrigin.get(origin) ?? new Set()).add(holder));
  };
  for (const provider of providers) if (provider.kind !== 'ollama') add(originOfUrl(provider.url), provider.key);
  add(webSearchOrigin(webSearch), WEB_SEARCH_HOLDER);
  return [...byOrigin]
    .map(([origin, holders]) => ({ origin, holders: [...holders].sort() }))
    .sort((a, b) => a.holders.join().localeCompare(b.holders.join()) || a.origin.localeCompare(b.origin));
}

export function destinationName(destination: KeyDestination): string {
  return destination.holders.map(holderName).join(', ');
}

/** Revoked credentials keep their names, so `taken` holds every stored name, not just the active ones. */
export function suggestedName(destination: KeyDestination, taken: ReadonlySet<string>): string | undefined {
  const candidates = destination.holders.map(holder => (holder === WEB_SEARCH_HOLDER ? 'web-search' : holder)).filter(name => CREDENTIAL_NAME_PATTERN.test(name));
  const free = candidates.find(name => !taken.has(name));
  if (free !== undefined || candidates[0] === undefined) return free;
  const base = candidates[0];
  for (let suffix = 2; ; suffix++) {
    const name = `${base}-${suffix}`;
    if (!CREDENTIAL_NAME_PATTERN.test(name)) return undefined;
    if (!taken.has(name)) return name;
  }
}

export function destinationLabel(origin: string, destinations: readonly KeyDestination[] = []): string {
  const destination = destinations.find(candidate => candidate.origin === origin);
  const host = originHost(origin);
  return destination ? `For ${destinationName(destination)}, only sent to ${host}` : `Only sent to ${host}`;
}

export function credentialsForUrl(credentials: readonly CredentialResponse[], url: string): CredentialResponse[] {
  const origin = originOfUrl(url);
  if (origin === null) return [];
  return sortCredentials(credentials.filter(credential => !isRevoked(credential) && credential.allowedOrigin === origin));
}

export function hintLabel(hint: string): string {
  return hint === '' || hint === HIDDEN_HINT ? 'Hidden' : hint;
}

export function keyVersionLabel(credential: Pick<CredentialResponse, 'version' | 'rotatedAt'>): string {
  return `Version ${credential.version}, ${credential.rotatedAt ? `last replaced ${formatDate(credential.rotatedAt)}` : 'never replaced'}`;
}

export function revokedLabel(credential: Pick<CredentialResponse, 'revokedAt'>): string | undefined {
  return credential.revokedAt ? `Since ${formatDate(credential.revokedAt)}` : undefined;
}

export function validateSecret(input: string): SecretValidation {
  const secret = input.trim();
  if (secret.length < SECRET_MIN_LENGTH || secret.length > SECRET_MAX_LENGTH)
    return { ok: false, error: `The key must be ${SECRET_MIN_LENGTH} to ${SECRET_MAX_LENGTH} characters.` };
  if (!SECRET_PATTERN.test(secret)) return { ok: false, error: 'The key may only contain visible ASCII characters, with no spaces.' };
  return { ok: true, secret };
}

export function validateCreateForm(values: { name: string; destination: Destination; secret: string }): CreateValidation {
  const errors: FieldErrors = {};
  const name = values.name.trim();
  const { destination } = values;
  const allowedOrigin = destination.kind === 'provider' ? destination.origin : normaliseOriginInput(destination.input);
  const secret = validateSecret(values.secret);
  if (!CREDENTIAL_NAME_PATTERN.test(name)) errors.name = 'Use 1 to 64 lowercase letters, digits, dots, underscores or hyphens, starting with a letter or digit.';
  if (allowedOrigin === null)
    errors.allowedOrigin =
      destination.kind === 'provider' ? 'Choose what this key is for.' : 'Enter an address like https://openrouter.ai: scheme, host and optional port, with no path.';
  if (!secret.ok) errors.secret = secret.error;
  if (errors.name || errors.allowedOrigin || !secret.ok || allowedOrigin === null) return { ok: false, errors };
  return { ok: true, body: { name, allowedOrigin, secret: secret.secret } };
}

export function describeTest(result: CredentialTestResponse): TestReport {
  if (result.ok) return { ok: true, message: 'The provider accepted the key.' };
  const code = result.code;
  return { ok: false, message: (code && ownEntry(TEST_MESSAGES, code)) || `The test failed${code ? ` (${code})` : ''}.` };
}

export function credentialErrorMessage(error: unknown): string {
  if (!isApiError(error)) return 'The request could not be completed.';
  return ownEntry(ERROR_MESSAGES, error.code) ?? STATUS_MESSAGES[error.status] ?? error.message;
}

export function inUseMessage(referencedBy: readonly string[]): string {
  if (referencedBy.length === 0) return 'The live catalog still names it. Switch those providers to another key on the Providers screen, then revoke it.';
  return `The live catalog still names it for ${referencedBy.map(referenceName).join(', ')}. Switch them to another key on the Providers screen, then revoke it.`;
}

export function revokeDescription(credential: Pick<CredentialResponse, 'name' | 'referencedBy'>): string {
  const consequence = `Synapse can never send "${credential.name}" again, and its name stays reserved. This cannot be undone.`;
  if (credential.referencedBy.length === 0) return consequence;
  return `${consequence} The live catalog still names it for ${credential.referencedBy.map(referenceName).join(', ')}, so the server will refuse until they use another key.`;
}

export function keyStatusOf(provider: Pick<ProviderResponse, 'credential' | 'apiKeyConfigured'>, credentials?: readonly CredentialResponse[]): KeyStatus {
  if (provider.credential === undefined) {
    if (provider.apiKeyConfigured === undefined) return { kind: 'not_needed' };
    return { kind: provider.apiKeyConfigured ? 'configured' : 'missing' };
  }
  if (credentials === undefined) return { kind: 'credential' };
  const credential = credentials.find(candidate => candidate.id === provider.credential);
  if (!credential) return { kind: 'credential_unknown' };
  if (isRevoked(credential)) return { kind: 'credential_revoked', name: credential.name };
  return { kind: 'credential', name: credential.name };
}
