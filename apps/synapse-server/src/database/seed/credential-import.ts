import { randomUUID } from 'node:crypto';

import { Logger } from '@shadow-library/common';
import { type SecretBox } from '@shadow-library/common/crypto';

import { AppErrorCode } from '@server/classes';
import { APP_NAME, PROVIDER_CREDENTIAL_KEYS } from '@server/constants';

import { urlOrigin } from '@modules/catalog/catalog-credentials';
import { parseCatalogDocument } from '@modules/catalog/catalog-parser';
import { checkPublishable } from '@modules/catalog/catalog-validator';
import { type CatalogVersionRepository } from '@modules/catalog/catalog-version.repository';
import { IMPORT_ACTOR, IMPORTED_OPENROUTER } from '@modules/credentials/credential.constants';
import { type CredentialRepository } from '@modules/credentials/credential.repository';
import { credentialContext, isUsableSecret, secretHint } from '@modules/credentials/credential.utils';

import { type Credential } from '../schemas';

export interface CredentialImportDeps {
  catalog: Pick<CatalogVersionRepository, 'exclusive'>;
  credentials: Pick<CredentialRepository, 'findByName' | 'createIfNameFree'>;
  box: SecretBox;
  newId?: () => string;
}

export interface CredentialImportResult {
  imported: boolean;
  repointed: string[];
}

const ENV_KEY = PROVIDER_CREDENTIAL_KEYS[0];
const REPOINT_NOTE = 'Providers moved from the env key to the imported OpenRouter credential';

/**
 * Moves the env OpenRouter key, kept one release as an import source, into a stored credential and repoints the providers that name it.
 * Idempotent: nothing is imported once a credential called `openrouter` exists, revoked or not, and the catalog is repointed only while no
 * version has ever named the imported credential, so a boot never publishes again and an admin who later reverts the provider is not overruled.
 */
export async function importEnvCredential(deps: CredentialImportDeps, apiKey: string | undefined): Promise<CredentialImportResult> {
  const logger = Logger.getLogger(APP_NAME, 'import-credential');
  if (!apiKey) return { imported: false, repointed: [] };

  let credential = await deps.credentials.findByName(IMPORTED_OPENROUTER.name);
  let imported = false;
  if (!credential) {
    if (!isUsableSecret(apiKey)) {
      logger.error('The env OpenRouter key is not one a header can carry; it was not imported', { configKey: ENV_KEY });
      return { imported: false, repointed: [] };
    }
    const id = (deps.newId ?? randomUUID)();
    const secret = await deps.box.seal(apiKey, credentialContext(id));
    const values = { id, name: IMPORTED_OPENROUTER.name, secret, allowedOrigin: IMPORTED_OPENROUTER.allowedOrigin, hint: secretHint(apiKey) };
    credential = (await deps.credentials.createIfNameFree(values, IMPORT_ACTOR)) ?? (await deps.credentials.findByName(IMPORTED_OPENROUTER.name));
    imported = credential?.id === id;
    if (imported) logger.info('Imported the env OpenRouter key as a stored credential', { credential: id, kid: secret.kid });
  }

  if (!credential || credential.createdBy !== IMPORT_ACTOR || credential.revokedAt) return { imported, repointed: [] };
  const repointed = await repoint(deps.catalog, credential);
  if (repointed.length > 0) logger.info('Repointed providers to the imported credential', { credential: credential.id, providers: repointed });
  return { imported, repointed };
}

async function repoint(catalog: Pick<CatalogVersionRepository, 'exclusive'>, credential: Credential.Row): Promise<string[]> {
  const logger = Logger.getLogger(APP_NAME, 'import-credential');
  return catalog.exclusive(async store => {
    if (await store.referencesCredential(credential.id)) return [];
    const active = await store.findActive();
    const parsed = active ? parseCatalogDocument(active.document) : undefined;
    if (!active || !parsed?.ok) return [];

    const document = structuredClone(parsed.document);
    const repointed: string[] = [];
    for (const [providerKey, provider] of Object.entries(document.providers)) {
      if (provider.credential || provider.apiKeyConfig !== ENV_KEY) continue;
      if (urlOrigin(provider.url) !== credential.allowedOrigin) {
        logger.warn('Left a provider on the env key: its URL is not at the credential origin', { provider: providerKey });
        continue;
      }
      delete provider.apiKeyConfig;
      provider.credential = credential.id;
      repointed.push(providerKey);
    }
    if (repointed.length === 0) return [];

    const check = await checkPublishable(document, parsed.document, ids => store.findCredentials(ids));
    if (!check.valid) throw AppErrorCode.SYN_CATALOG_INVALID.create({ issues: check.issues });
    const version = (await store.maxVersion()) + 1;
    await store.archivePublished();
    await store.insertPublished({ version, document, note: REPOINT_NOTE, createdBy: IMPORT_ACTOR });
    const draft = await store.findDraft();
    if (draft && JSON.stringify(draft.document).includes(ENV_KEY))
      logger.warn('The catalog draft still names the env key; publishing it as is moves providers back to it', { version });
    return repointed;
  });
}
