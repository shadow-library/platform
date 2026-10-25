import { isApiError } from '@shadow-library/web';

import { ownEntry } from '@/features/catalog/catalog-values';
import { formatDate } from '@/features/shared/format';
import { type CreateCredentialBody, type CredentialResponse, type CredentialTestResponse, type ProviderResponse } from '@/lib/apis/api-types.gen';

export const CREDENTIAL_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const SECRET_MIN_LENGTH = 8;
export const SECRET_MAX_LENGTH = 4096;

const SECRET_PATTERN = /^[\x21-\x7e]+$/;
const WHITESPACE = /\s/;
const HTTP_PROTOCOLS = ['http:', 'https:'];
const HIDDEN_HINT = '…';

export type CreateField = keyof CreateCredentialBody;
export type FieldErrors = Partial<Record<CreateField, string>>;

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
  not_found: 'The provider has no key-check endpoint at this origin.',
  redirected: 'The provider redirected the check; a key is never sent across a redirect.',
  rejected: 'The provider rejected the check.',
  upstream_error: 'The provider answered with a server error.',
  timeout: 'The provider did not answer in time.',
  connect: 'The provider could not be reached.',
};

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  CRED_NAME_TAKEN: 'A credential with this name already exists. A revoked credential keeps its name, so pick another.',
  CRED_REVOKED: 'This credential is revoked, so it can no longer be rotated.',
  SYN_INVALID_REQUEST: 'The origin or the key was refused. The origin is a scheme, host and optional port with no path; the key is 8 to 4096 visible characters with no spaces.',
};

const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  403: 'Your role cannot manage credentials.',
  404: 'This credential no longer exists.',
};

const ISSUE_ADVICE: Readonly<Record<string, string>> = {
  unknown_credential: 'No stored credential has this id. Pick one from the list.',
  credential_revoked: 'A revoked credential is never used again. Pick an active one.',
  credential_origin_mismatch: 'The key is only ever sent to the origin it is bound to. Fix the URL, or pick a credential bound to this origin.',
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

export function validateCreateForm(values: { name: string; allowedOrigin: string; secret: string }): CreateValidation {
  const errors: FieldErrors = {};
  const name = values.name.trim();
  const allowedOrigin = normaliseOriginInput(values.allowedOrigin);
  const secret = validateSecret(values.secret);
  if (!CREDENTIAL_NAME_PATTERN.test(name)) errors.name = 'Use 1 to 64 lowercase letters, digits, dots, underscores or hyphens, starting with a letter or digit.';
  if (allowedOrigin === null) errors.allowedOrigin = 'Enter an http(s) origin: scheme, host and optional port, with no path.';
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
  const repoint = 'Repoint those providers on the Providers screen and publish, then revoke it.';
  if (referencedBy.length === 0) return `The published catalog still names it. ${repoint}`;
  return `The published catalog still names it for ${referencedBy.join(', ')}. ${repoint}`;
}

export function revokeDescription(credential: Pick<CredentialResponse, 'name' | 'referencedBy'>): string {
  const consequence = `No provider can send "${credential.name}" again, and its name stays reserved. This cannot be undone.`;
  if (credential.referencedBy.length === 0) return consequence;
  return `${consequence} The published catalog still names it for ${credential.referencedBy.join(', ')}, so the server will refuse until those providers are repointed and published.`;
}

export function issueAdvice(code: string): string | undefined {
  return ownEntry(ISSUE_ADVICE, code);
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
