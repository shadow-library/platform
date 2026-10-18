import { PROVIDER_CREDENTIAL_ORIGINS } from '@server/constants';

import { type CatalogDocument, type CatalogIssue, type CredentialState } from './catalog.types';
import { childPath, ownEntry } from './catalog.utils';

const ORIGIN_PROTOCOLS = ['http:', 'https:'];
const WHITESPACE = /\s/;

export function urlOrigin(url: string): string | undefined {
  if (!URL.canParse(url)) return undefined;
  const parsed = new URL(url);
  return ORIGIN_PROTOCOLS.includes(parsed.protocol) ? parsed.origin : undefined;
}

/** A path, query, fragment or embedded credential is refused rather than trimmed, so a credential is bound to exactly the origin the admin meant. */
export function normaliseOrigin(input: string): string | undefined {
  if (WHITESPACE.test(input) || !URL.canParse(input)) return undefined;
  const parsed = new URL(input);
  if (!ORIGIN_PROTOCOLS.includes(parsed.protocol)) return undefined;
  if (parsed.username || parsed.password || parsed.pathname !== '/' || input.includes('?') || input.includes('#')) return undefined;
  return parsed.origin;
}

export function credentialReferences(document: CatalogDocument): Map<string, string[]> {
  const references = new Map<string, string[]>();
  for (const [providerKey, provider] of Object.entries(document.providers)) {
    if (!provider.credential) continue;
    references.set(provider.credential, [...(references.get(provider.credential) ?? []), providerKey]);
  }
  return references;
}

/**
 * The publish rules on where keys go: a named credential exists, is live and is bound to the provider's origin, and a deprecated `apiKeyConfig`
 * is sent only to its key's fixed origin. Kept out of `validateCatalog`, which every replica also applies when loading the published catalog,
 * so a catalog published before these rules is still served; the resolver refuses a misbound key at call time regardless.
 */
export function credentialIssues(document: CatalogDocument, states: readonly CredentialState[]): CatalogIssue[] {
  const byId = new Map(states.map(state => [state.id, state]));
  const issues: CatalogIssue[] = [];
  for (const [providerKey, provider] of Object.entries(document.providers)) {
    const path = childPath('providers', providerKey);
    const configOrigin = provider.apiKeyConfig && ownEntry<string>(PROVIDER_CREDENTIAL_ORIGINS, provider.apiKeyConfig);
    if (configOrigin && provider.kind !== 'ollama' && urlOrigin(provider.url) !== configOrigin) {
      issues.push({
        path: childPath(path, 'url'),
        code: 'credential_origin_mismatch',
        message: `'${provider.apiKeyConfig}' is bound to ${configOrigin}, not to this URL's origin`,
      });
    }
    if (!provider.credential) continue;
    const state = byId.get(provider.credential);
    if (!state) issues.push({ path: childPath(path, 'credential'), code: 'unknown_credential', message: `Unknown credential '${provider.credential}'` });
    else if (state.revoked) issues.push({ path: childPath(path, 'credential'), code: 'credential_revoked', message: `Credential '${provider.credential}' is revoked` });
    else if (urlOrigin(provider.url) !== state.allowedOrigin) {
      issues.push({ path: childPath(path, 'url'), code: 'credential_origin_mismatch', message: `The credential is bound to ${state.allowedOrigin}, not to this URL's origin` });
    }
  }
  return issues;
}
