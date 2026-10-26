import { WEB_SEARCH_PATH } from '@modules/catalog/catalog-credentials';
import { isRecord } from '@modules/catalog/catalog.utils';
import { VISIBLE_ASCII } from '@modules/providers/chat-translation.util';

import { SECRET_MAX_LENGTH, SECRET_MIN_LENGTH } from './credential.constants';

const HINT_PREFIX = 6;
const HINT_SUFFIX = 4;
const FULL_HINT_MIN_LENGTH = (HINT_PREFIX + HINT_SUFFIX) * 4;
const SUFFIX_HINT_MIN_LENGTH = HINT_SUFFIX * 4;
const ELLIPSIS = '…';

/** The row's id is generated before insert and never changes, so a sealed secret cannot be moved to another row or column. */
export function credentialContext(id: string): string {
  return `synapse:provider_credentials:${id}:secret`;
}

/** Never more than a quarter of the secret: `sk-or-…a1b2` from 40 characters up, the last four from 16, and nothing below that. */
export function secretHint(secret: string): string {
  if (secret.length >= FULL_HINT_MIN_LENGTH) return `${secret.slice(0, HINT_PREFIX)}${ELLIPSIS}${secret.slice(-HINT_SUFFIX)}`;
  if (secret.length >= SUFFIX_HINT_MIN_LENGTH) return `${ELLIPSIS}${secret.slice(-HINT_SUFFIX)}`;
  return ELLIPSIS;
}

/** What an HTTP `authorization` header can carry; the DTO enforces the same, and the migrate import has no DTO. */
export function isUsableSecret(secret: string): boolean {
  return secret.length >= SECRET_MIN_LENGTH && secret.length <= SECRET_MAX_LENGTH && VISIBLE_ASCII.test(secret);
}

/** Lenient on purpose: a revocation must find every reference even in a published document this code can no longer parse. */
export function referencingHolders(document: unknown, credentialId: string): string[] {
  const root = isRecord(document) ? document : {};
  const providers = isRecord(root['providers']) ? root['providers'] : {};
  const holders = Object.entries(providers)
    .filter(([, provider]) => isRecord(provider) && provider['credential'] === credentialId)
    .map(([providerKey]) => providerKey);
  const search = isRecord(root['tools']) ? root['tools']['webSearch'] : undefined;
  return isRecord(search) && search['credential'] === credentialId ? [...holders, WEB_SEARCH_PATH] : holders;
}
