/**
 * Importing npm packages
 */
import { createPrivateKey, generateKeyPairSync, randomUUID } from 'node:crypto';

import * as x509 from '@peculiar/x509';
import { Injectable, OnModuleInit } from '@shadow-library/app';
import { InternalError, Logger, throwError } from '@shadow-library/common';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { KeyProvider } from '@server/modules/auth/keys';
import { DatabaseService, PrimaryDatabase, SigningKey, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export interface SamlSigningKey {
  kid: string;
  privateKeyPem: string;
  certificatePem: string;
}

/**
 * Declaring the constants
 *
 * SAML signing keys are RSA-2048: XML-DSIG interoperability effectively requires RSA — SPs in the
 * wild do not accept Ed25519 — so the SAML subsystem keeps its own key lineage (purpose = SAML)
 * beside the OIDC Ed25519 one, sharing the envelope encryption and rotation states. The metadata
 * document publishes every non-retired certificate so SPs keep verifying across a rotation window.
 */
const PUBLISHED_STATUSES: SigningKey.Status[] = ['PENDING', 'ACTIVE', 'RETIRING'];
const CERTIFICATE_VALIDITY_YEARS = 10;
const RSA_ALGORITHM = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048 } as const;

@Injectable()
export class SamlKeyService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, SamlKeyService.name);
  private readonly db: PrimaryDatabase;
  private keys = new Map<string, SamlSigningKey & { status: SigningKey.Status }>();
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
      this.logger.info('No active saml signing key found; generated an initial one');
    }
  }

  async reload(): Promise<void> {
    const rows = await this.db
      .select()
      .from(schema.signingKeys)
      .where(and(eq(schema.signingKeys.purpose, 'SAML'), inArray(schema.signingKeys.status, PUBLISHED_STATUSES)));
    const keys = new Map<string, SamlSigningKey & { status: SigningKey.Status }>();
    let activeKid: string | null = null;
    for (const row of rows) {
      if (!row.certificatePem) continue;
      const der = this.keyProvider.decrypt({ ciphertext: row.privateKeyCiphertext, iv: row.privateKeyIv, authTag: row.privateKeyAuthTag, kekVersion: row.kekVersion });
      const privateKeyPem = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }).export({ format: 'pem', type: 'pkcs8' }).toString();
      keys.set(row.kid, { kid: row.kid, status: row.status, privateKeyPem, certificatePem: row.certificatePem });
      if (row.status === 'ACTIVE') activeKid = row.kid;
    }
    this.keys = keys;
    this.activeKid = activeKid;
  }

  async generateKey(status: SigningKey.Status = 'PENDING'): Promise<string> {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: RSA_ALGORITHM.modulusLength });
    const kid = randomUUID();

    const cryptoPrivate = await crypto.subtle.importKey('pkcs8', privateKey.export({ format: 'der', type: 'pkcs8' }), RSA_ALGORITHM, true, ['sign']);
    const cryptoPublic = await crypto.subtle.importKey('spki', publicKey.export({ format: 'der', type: 'spki' }), RSA_ALGORITHM, true, ['verify']);
    const notBefore = new Date();
    const notAfter = new Date(notBefore.getTime() + CERTIFICATE_VALIDITY_YEARS * 365 * 24 * 3600 * 1000);
    const certificate = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: kid.replace(/-/g, '').slice(0, 16),
      name: `CN=shadow-identity saml ${kid.slice(0, 8)}`,
      notBefore,
      notAfter,
      signingAlgorithm: RSA_ALGORITHM,
      keys: { privateKey: cryptoPrivate, publicKey: cryptoPublic },
    });

    const jwk = publicKey.export({ format: 'jwk' }) as unknown as Record<string, string>;
    const encrypted = this.keyProvider.encrypt(privateKey.export({ format: 'der', type: 'pkcs8' }));
    await this.db.insert(schema.signingKeys).values({
      kid,
      algorithm: 'RS256',
      purpose: 'SAML',
      publicJwk: { ...jwk, kid, use: 'sig', alg: 'RS256' },
      certificatePem: certificate.toString('pem'),
      privateKeyCiphertext: encrypted.ciphertext,
      privateKeyIv: encrypted.iv,
      privateKeyAuthTag: encrypted.authTag,
      kekVersion: encrypted.kekVersion,
      status,
      activatedAt: status === 'ACTIVE' ? new Date() : null,
    });
    this.logger.info('Generated saml signing key', { kid, status });
    return kid;
  }

  /** Promotes a new key to active; the previous active key keeps verifying via metadata until retired. */
  async rotate(newKid?: string): Promise<string> {
    const kid = newKid ?? (await this.generateKey('PENDING'));
    await this.db.transaction(async tx => {
      await tx
        .update(schema.signingKeys)
        .set({ status: 'RETIRING' })
        .where(and(eq(schema.signingKeys.purpose, 'SAML'), eq(schema.signingKeys.status, 'ACTIVE')));
      await tx.update(schema.signingKeys).set({ status: 'ACTIVE', activatedAt: new Date() }).where(eq(schema.signingKeys.kid, kid));
    });
    await this.reload();
    this.logger.info('Rotated active saml signing key', { kid });
    return kid;
  }

  getActiveKey(): SamlSigningKey {
    const kid = this.activeKid;
    const key = (kid ? this.keys.get(kid) : undefined) ?? throwError(new InternalError('No active saml signing key available'));
    return { kid: key.kid, privateKeyPem: key.privateKeyPem, certificatePem: key.certificatePem };
  }

  /** Every certificate an SP may still see signatures from, active first (metadata KeyDescriptors). */
  getPublishedCertificates(): string[] {
    const ordered = [...this.keys.values()].sort((a, b) => (a.status === 'ACTIVE' ? -1 : b.status === 'ACTIVE' ? 1 : 0));
    return ordered.map(key => key.certificatePem);
  }
}
