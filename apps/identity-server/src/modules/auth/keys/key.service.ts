/**
 * Importing npm packages
 */
import { KeyObject, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID } from 'node:crypto';

import { Injectable, OnModuleInit } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { and, eq, inArray, lt } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatabaseService, PrimaryDatabase, SigningKey, schema } from '@server/modules/infrastructure/datastore';

import { JwtClaims, decodeJwtHeader, encodeJwt, verifyJwtSignature } from './jwt';
import { KeyProvider } from './key-provider';

/**
 * Defining types
 */

export interface Jwk {
  kty: string;
  crv: string;
  x: string;
  kid: string;
  use: 'sig';
  alg: 'EdDSA';
}

export interface SignResult {
  token: string;
  kid: string;
}

interface LoadedKey {
  kid: string;
  status: SigningKey.Status;
  publicKey: KeyObject;
  privateKey: KeyObject;
}

/**
 * Declaring the constants
 *
 * Verification keys are published while any token they signed can still be presented; the set is
 * cached in-process and refreshed on rotation.
 */
const PUBLISHED_STATUSES: SigningKey.Status[] = ['PENDING', 'ACTIVE', 'RETIRING'];

@Injectable()
export class KeyService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, KeyService.name);
  private readonly db: PrimaryDatabase;
  private keys = new Map<string, LoadedKey>();
  private activeKid: string | null = null;

  constructor(
    databaseService: DatabaseService,
    private readonly keyProvider: KeyProvider,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async onModuleInit(): Promise<void> {
    await this.reload();
    if (!this.activeKid) {
      await this.generateKey('ACTIVE');
      await this.reload();
      this.logger.info('No active signing key found; generated an initial one');
    }
  }

  /** Loads every published OIDC key into memory, reconstructing the key objects from storage. */
  async reload(): Promise<void> {
    const rows = await this.db
      .select()
      .from(schema.signingKeys)
      .where(and(eq(schema.signingKeys.purpose, 'OIDC'), inArray(schema.signingKeys.status, PUBLISHED_STATUSES)));
    const keys = new Map<string, LoadedKey>();
    let activeKid: string | null = null;
    for (const row of rows) {
      const publicKey = createPublicKey({ key: row.publicJwk, format: 'jwk' });
      const der = this.keyProvider.decrypt({ ciphertext: row.privateKeyCiphertext, iv: row.privateKeyIv, authTag: row.privateKeyAuthTag, kekVersion: row.kekVersion });
      const privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
      keys.set(row.kid, { kid: row.kid, status: row.status, publicKey, privateKey });
      if (row.status === 'ACTIVE') activeKid = row.kid;
    }
    this.keys = keys;
    this.activeKid = activeKid;
  }

  /** Generates a new Ed25519 signing key. At most one key may be ACTIVE (enforced in the schema). */
  async generateKey(status: SigningKey.Status = 'PENDING'): Promise<string> {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const kid = randomUUID();
    const jwk = publicKey.export({ format: 'jwk' }) as unknown as Record<string, string>;
    const der = privateKey.export({ format: 'der', type: 'pkcs8' });
    const encrypted = this.keyProvider.encrypt(der);

    await this.db.insert(schema.signingKeys).values({
      kid,
      algorithm: 'EdDSA',
      publicJwk: { ...jwk, kid, use: 'sig', alg: 'EdDSA' },
      privateKeyCiphertext: encrypted.ciphertext,
      privateKeyIv: encrypted.iv,
      privateKeyAuthTag: encrypted.authTag,
      kekVersion: encrypted.kekVersion,
      status,
      activatedAt: status === 'ACTIVE' ? new Date() : null,
    });
    this.logger.info('Generated signing key', { kid, status });
    return kid;
  }

  /**
   * Promotes a pending key to active: the previous active key moves to RETIRING (its tokens still
   * verify) and stale retiring keys are retired. All steps run in one transaction.
   */
  async rotate(newKid?: string): Promise<string> {
    const kid = newKid ?? (await this.generateKey('PENDING'));
    await this.db.transaction(async tx => {
      await tx
        .update(schema.signingKeys)
        .set({ status: 'RETIRING' })
        .where(and(eq(schema.signingKeys.purpose, 'OIDC'), eq(schema.signingKeys.status, 'ACTIVE')));
      await tx.update(schema.signingKeys).set({ status: 'ACTIVE', activatedAt: new Date() }).where(eq(schema.signingKeys.kid, kid));
    });
    await this.reload();
    this.logger.info('Rotated active signing key', { kid });
    return kid;
  }

  /**
   * Retires RETIRING keys activated before the cutoff. Callers pass a cutoff far enough in the
   * past (rotation period + maximum token lifetime) that no live token was signed by the key; the
   * policy is deliberately conservative, erring toward keeping verification keys published longer.
   */
  async retireExpiredKeys(cutoff: Date): Promise<number> {
    const retired = await this.db
      .update(schema.signingKeys)
      .set({ status: 'RETIRED', retiredAt: new Date() })
      .where(and(eq(schema.signingKeys.purpose, 'OIDC'), eq(schema.signingKeys.status, 'RETIRING'), lt(schema.signingKeys.activatedAt, cutoff)))
      .returning({ kid: schema.signingKeys.kid });
    if (retired.length) await this.reload();
    return retired.length;
  }

  sign(claims: JwtClaims): SignResult {
    const kid = this.activeKid;
    if (!kid) throw new Error('No active signing key available');
    const key = this.keys.get(kid);
    if (!key) throw new Error(`Active signing key ${kid} is not loaded`);
    const token = encodeJwt({ alg: 'EdDSA', typ: 'JWT', kid }, claims, key.privateKey);
    return { token, kid };
  }

  /** Verifies a token's signature against the key identified by its `kid`, EdDSA only. */
  verify(token: string): JwtClaims | null {
    const header = decodeJwtHeader(token);
    if (!header || header.alg !== 'EdDSA' || !header.kid) return null;
    const key = this.keys.get(header.kid);
    if (!key) return null;
    return verifyJwtSignature(token, key.publicKey);
  }

  getJwks(): { keys: Jwk[] } {
    const keys: Jwk[] = [];
    for (const key of this.keys.values()) {
      const jwk = key.publicKey.export({ format: 'jwk' }) as unknown as { kty: string; crv: string; x: string };
      keys.push({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, kid: key.kid, use: 'sig', alg: 'EdDSA' });
    }
    return { keys };
  }

  getActiveKid(): string | null {
    return this.activeKid;
  }
}
