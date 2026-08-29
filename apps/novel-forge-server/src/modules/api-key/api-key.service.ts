import { createHash, randomBytes } from 'node:crypto';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { AppError, Logger } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME, CURATE_PERMISSION } from '@server/constants';
import { type ApiKey, type PrimaryDatabase, schema } from '@server/database';

import { type ApiKeyResponse, type CreateApiKeyResponse, type ListApiKeysResponse } from './api-key.dto';

const SECRET_PREFIX = 'nfk_';
const SECRET_BYTES = 32;
const PREFIX_LENGTH = 8;

/** How long a key's `lastUsedAt` write is suppressed, bounding what a busy ingest run costs in writes */
const LAST_USED_THROTTLE_MS = 60_000;

const hash = (secret: string): string => createHash('sha256').update(secret).digest('hex');

@Injectable()
export class ApiKeyService {
  private readonly logger = Logger.getLogger(APP_NAME, ApiKeyService.name);
  private readonly db: PrimaryDatabase;

  /** Keyed by key id; a pure cache, so a restart or an eviction only costs one extra write. */
  private readonly lastUsedWrites = new Map<string, number>();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly context: ContextService,
    private readonly authClient: AuthClient,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async create(name: string): Promise<CreateApiKeyResponse> {
    const { ownerId, ownerOrgId } = this.caller();
    const secret = `${SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`;
    const keyPrefix = secret.slice(SECRET_PREFIX.length, SECRET_PREFIX.length + PREFIX_LENGTH);

    const [key] = await this.db
      .insert(schema.apiKeys)
      .values({ name, keyPrefix, keyHash: hash(secret), ownerId, ownerOrgId })
      .returning()
      .catch(err => this.databaseService.translateError(err));
    if (!key) throw AppErrorCode.S001.create();

    this.logger.info('api key created', { id: key.id.toString(), keyPrefix, ownerId: ownerId.toString(), organisationId: ownerOrgId });
    return { ...this.present(key), secret };
  }

  async list(): Promise<ListApiKeysResponse> {
    const { ownerId } = this.caller();
    const keys = await this.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.ownerId, ownerId)).orderBy(desc(schema.apiKeys.createdAt));
    return { keys: keys.map(key => this.present(key)) };
  }

  /**
   * Idempotent, and scoped to the caller: a key that belongs to someone else is answered exactly as
   * one that never existed, so the endpoint is not an id oracle.
   */
  async revoke(id: bigint): Promise<void> {
    const { ownerId } = this.caller();
    const key = await this.db.query.apiKeys.findFirst({ where: and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.ownerId, ownerId)) });
    if (!key) throw AppErrorCode.KEY_004.create();

    this.forget(key.id);
    if (key.revokedAt) return;

    await this.db.update(schema.apiKeys).set({ revokedAt: new Date() }).where(eq(schema.apiKeys.id, key.id));
    this.logger.info('api key revoked', { id: key.id.toString(), keyPrefix: key.keyPrefix, ownerId: ownerId.toString() });
  }

  /**
   * Retires the key the caller authenticated with, so a CLI replacing its credential can stand down the
   * old one holding nothing but that old one. The guard has already resolved the secret and refused a
   * revoked key, so there is no ownership question left to ask and no second call ever reaches here — a
   * repeat answers `KEY_002` at the guard rather than a second 204.
   */
  async revokeSelf(): Promise<void> {
    const principal = this.context.getAuthPrincipal();
    const apiKeyId = principal.claims['api_key_id'];
    if (typeof apiKeyId !== 'string') throw AppError.internal('the api key self-revoke route was reached by a principal naming no api key');

    const id = BigInt(apiKeyId);
    this.forget(id);
    const [key] = await this.db
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.apiKeys.id, id), isNull(schema.apiKeys.revokedAt)))
      .returning();
    if (!key) return;

    this.logger.info('api key revoked itself', { id: apiKeyId, keyPrefix: key.keyPrefix, ownerId: principal.sub, organisationId: principal.org });
  }

  /**
   * Resolves a presented secret to its key row. The lookup is a single equality on the unique hash
   * index — the plaintext never reaches the database and no stored value is compared byte by byte in
   * application code. A malformed secret is refused before the round trip, so garbage costs nothing.
   */
  async authenticate(secret: string): Promise<ApiKey.Row> {
    if (!secret.startsWith(SECRET_PREFIX)) throw AppErrorCode.KEY_001.create();

    const key = await this.db.query.apiKeys.findFirst({ where: eq(schema.apiKeys.keyHash, hash(secret)) });
    if (!key) throw AppErrorCode.KEY_001.create();
    if (key.revokedAt) {
      this.logger.warn('rejected a revoked api key', { id: key.id.toString(), keyPrefix: key.keyPrefix });
      throw AppErrorCode.KEY_002.create();
    }

    this.touch(key);
    return key;
  }

  /**
   * A key is a standing delegation of its owner's entitlement, not a grant of its own, so the PDP is
   * asked again on every request. The SDK owns the caching: `highRisk` pins the decision's TTL to a
   * minute so a revocation bites quickly, and its client already collapses concurrent identical
   * checks and honours the authz version identity reports. `failOpen` stays off — an unreachable PDP
   * must stop a write surface driven by a long-lived credential, not wave it through.
   */
  async assertOwnerPermitted(key: ApiKey.Row): Promise<void> {
    const principal = { kind: 'user' as const, sub: key.ownerId.toString(), org: key.ownerOrgId };
    const permitted = await this.authClient.check({ action: CURATE_PERMISSION, organisationId: key.ownerOrgId, principal }, { highRisk: true });
    if (permitted) return;

    this.logger.warn('api key owner no longer holds the curate permission', { id: key.id.toString(), ownerId: key.ownerId.toString(), organisationId: key.ownerOrgId });
    throw AppErrorCode.KEY_003.create();
  }

  /**
   * `lastUsedAt` is telemetry, so it is stamped in memory first and written without being awaited: a
   * busy ingest run makes one write a minute per key, and a failed write costs a stale timestamp
   * rather than a failed request.
   */
  private touch(key: ApiKey.Row): void {
    const cacheKey = key.id.toString();
    const now = Date.now();
    if ((this.lastUsedWrites.get(cacheKey) ?? 0) + LAST_USED_THROTTLE_MS > now) return;

    this.evictExpired();
    this.lastUsedWrites.set(cacheKey, now);
    void this.db
      .update(schema.apiKeys)
      .set({ lastUsedAt: new Date(now) })
      .where(eq(schema.apiKeys.id, key.id))
      .catch((error: Error) => this.logger.warn('could not record api key usage', { id: cacheKey, reason: error.message }));
  }

  private forget(id: bigint): void {
    this.lastUsedWrites.delete(id.toString());
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, writtenAt] of this.lastUsedWrites) if (writtenAt + LAST_USED_THROTTLE_MS <= now) this.lastUsedWrites.delete(id);
  }

  /** A key inherits the creator's organisation, which the controller's `@RequirePermission` has already proven is present. */
  private caller(): { ownerId: bigint; ownerOrgId: string } {
    const principal = this.context.getAuthPrincipal();
    if (!principal.org) throw AppError.internal('an api key was requested by a principal naming no organisation');
    return { ownerId: BigInt(principal.sub), ownerOrgId: principal.org };
  }

  private present(key: ApiKey.Row): ApiKeyResponse {
    return { id: key.id, name: key.name, keyPrefix: key.keyPrefix, createdAt: key.createdAt, lastUsedAt: key.lastUsedAt, revokedAt: key.revokedAt };
  }
}
