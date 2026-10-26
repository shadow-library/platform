import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { isEnvelope, type Keyring, type SecretBox } from '@shadow-library/common/crypto';

import { AppErrorCode } from '@server/classes';
import { APP_NAME, OPENROUTER_ORIGIN } from '@server/constants';
import { type Credential } from '@server/database';

import { ActiveCatalogCache } from '@modules/catalog/active-catalog.cache';
import { credentialReferences, normaliseOrigin, urlOrigin } from '@modules/catalog/catalog-credentials';
import { type ProviderSpec, type WebSearchToolSpec } from '@modules/catalog/catalog.types';
import { BRAVE_SEARCH_ORIGIN, braveSearchRequest } from '@modules/providers/web-search.client';

import { CREDENTIAL_BOX, CREDENTIAL_KEYRING } from './credential.constants';
import { CredentialProber, type CredentialTestResult, type ProbeRequest } from './credential-prober';
import { CredentialRepository } from './credential.repository';
import { CredentialResolver } from './credential-resolver.service';
import { credentialContext, isUsableSecret, referencingHolders, secretHint } from './credential.utils';

export interface CredentialView {
  id: string;
  name: string;
  allowedOrigin: string;
  hint: string;
  version: number;
  /** The keyring key that wraps the secret; absent for a row that holds no envelope */
  kid?: string;
  createdBy?: string;
  createdAt: Date;
  rotatedAt?: Date;
  revokedAt?: Date;
  referencedBy: string[];
}

export interface NewCredentialInput {
  name: string;
  allowedOrigin: string;
  secret: string;
}

export interface KeyringKeyStatus {
  kid: string;
  credentials: number;
  inKeyring: boolean;
}

export interface KeyringStatus {
  activeKeyId: string;
  keys: KeyringKeyStatus[];
}

const OPENROUTER_KEY_ENDPOINT = `${OPENROUTER_ORIGIN}/api/v1/key`;

function invalid(param: string, reason: string): never {
  throw AppErrorCode.SYN_INVALID_REQUEST.create({ param, reason });
}

/**
 * Never leaves the credential's origin: the web search when its URL shares it, then a provider whose URL does, else the OpenAI-compatible
 * default. A Brave key is checked with one single-result search, the cheapest call its API has.
 */
export function probeRequest(allowedOrigin: string, apiKey: string, providers: readonly ProviderSpec[], search: WebSearchToolSpec | undefined): ProbeRequest {
  const bearer = { authorization: `Bearer ${apiKey}` };
  const searchUrl = search?.kind === 'brave' && urlOrigin(search.url) === allowedOrigin ? search.url : allowedOrigin === BRAVE_SEARCH_ORIGIN ? BRAVE_SEARCH_ORIGIN : undefined;
  if (searchUrl) return braveSearchRequest(searchUrl, apiKey, { q: 'test', count: '1' });
  if (allowedOrigin === OPENROUTER_ORIGIN) return { url: OPENROUTER_KEY_ENDPOINT, headers: bearer };
  const provider = providers.find(candidate => urlOrigin(candidate.url) === allowedOrigin);
  if (provider) return { url: `${provider.url.replace(/\/+$/, '')}/models`, headers: bearer };
  return { url: `${allowedOrigin}/v1/models`, headers: bearer };
}

@Injectable()
export class CredentialService {
  private readonly logger = Logger.getLogger(APP_NAME, CredentialService.name);

  constructor(
    private readonly repository: CredentialRepository,
    private readonly resolver: CredentialResolver,
    private readonly prober: CredentialProber,
    private readonly cache: ActiveCatalogCache,
    @Inject(CREDENTIAL_BOX) private readonly box: SecretBox,
    @Inject(CREDENTIAL_KEYRING) private readonly keyring: Keyring,
  ) {}

  async list(): Promise<CredentialView[]> {
    const rows = await this.repository.list();
    const references = this.references();
    return rows.map(row => this.viewOf(row, references));
  }

  async get(id: string): Promise<CredentialView> {
    const row = (await this.repository.findById(id)) ?? AppErrorCode.S009.throw();
    return this.viewOf(row, this.references());
  }

  async create(input: NewCredentialInput, actor: string): Promise<CredentialView> {
    const allowedOrigin = normaliseOrigin(input.allowedOrigin) ?? invalid('allowedOrigin', 'Expected an http or https origin: scheme, host and optional port, with no path');
    if (!isUsableSecret(input.secret)) invalid('secret', 'The secret must be 8 to 4096 visible ASCII characters');
    const id = randomUUID();
    const secret = await this.box.seal(input.secret, credentialContext(id));
    const row = await this.repository.create({ id, name: input.name, secret, allowedOrigin, hint: secretHint(input.secret) }, actor);
    this.logger.info('Created a provider credential', { credential: id, name: row.name, allowedOrigin, kid: secret.kid, actor });
    return this.viewOf(row, this.references());
  }

  async rotate(id: string, plaintext: string, actor: string): Promise<CredentialView> {
    if (!isUsableSecret(plaintext)) invalid('secret', 'The secret must be 8 to 4096 visible ASCII characters');
    const current = (await this.repository.findById(id)) ?? AppErrorCode.S009.throw();
    if (current.revokedAt) throw AppErrorCode.CRED_REVOKED.create();
    const secret = await this.box.seal(plaintext, credentialContext(id));
    const row = await this.repository.rotate(id, secret, secretHint(plaintext), actor);
    if (!row) throw AppErrorCode.CRED_REVOKED.create();
    this.resolver.forget(id);
    this.logger.info('Rotated a provider credential', { credential: id, version: row.version, kid: secret.kid, actor });
    return this.viewOf(row, this.references());
  }

  async revoke(id: string, actor: string): Promise<CredentialView> {
    const outcome = await this.repository.revoke(id, actor, document => referencingHolders(document, id));
    if (outcome.status === 'not_found') throw AppErrorCode.S009.create();
    if (outcome.status === 'in_use') throw AppErrorCode.CRED_IN_USE.create({ referencedBy: outcome.referencedBy });
    this.resolver.forget(id);
    if (outcome.status === 'revoked') this.logger.info('Revoked a provider credential', { credential: id, actor });
    return this.viewOf(outcome.credential, this.references());
  }

  async test(id: string): Promise<CredentialTestResult> {
    const row = (await this.repository.findById(id)) ?? AppErrorCode.S009.throw();
    if (row.revokedAt) return { ok: false, code: 'revoked_api_key' };
    if (!isEnvelope(row.secret)) return { ok: false, code: 'credential_unreadable' };

    let apiKey: string;
    try {
      const plaintext = await this.box.open(row.secret, credentialContext(id));
      apiKey = plaintext.toString('utf8');
      plaintext.fill(0);
    } catch {
      this.logger.error('Could not decrypt a provider credential to test it', { credential: id });
      return { ok: false, code: 'credential_unreadable' };
    }
    if (!isUsableSecret(apiKey)) return { ok: false, code: 'invalid_api_key' };

    const document = this.cache.current()?.document;
    const providers = Object.values(document?.providers ?? {}).filter(provider => provider.credential === id);
    const result = await this.prober.probe(probeRequest(row.allowedOrigin, apiKey, providers, document?.tools?.webSearch));
    this.logger.info('Tested a provider credential', { credential: id, ok: result.ok, ...(!result.ok && { code: result.code }) });
    return result;
  }

  async keyringStatus(): Promise<KeyringStatus> {
    const counts = await this.repository.kidCounts();
    const { activeKeyId } = this.keyring;
    const keys = counts.flatMap(({ kid, credentials }) => (kid === null ? [] : [{ kid, credentials, inKeyring: this.keyring.has(kid) }]));
    if (!keys.some(key => key.kid === activeKeyId)) keys.unshift({ kid: activeKeyId, credentials: 0, inKeyring: true });
    return { activeKeyId, keys };
  }

  private references(): Map<string, string[]> {
    const active = this.cache.current();
    return active ? credentialReferences(active.document) : new Map();
  }

  private viewOf(row: Credential.Row, references: Map<string, string[]>): CredentialView {
    return {
      id: row.id,
      name: row.name,
      allowedOrigin: row.allowedOrigin,
      hint: row.hint,
      version: row.version,
      ...(isEnvelope(row.secret) && { kid: row.secret.kid }),
      ...(row.createdBy !== null && { createdBy: row.createdBy }),
      createdAt: row.createdAt,
      ...(row.rotatedAt !== null && { rotatedAt: row.rotatedAt }),
      ...(row.revokedAt !== null && { revokedAt: row.revokedAt }),
      referencedBy: references.get(row.id) ?? [],
    };
  }
}
