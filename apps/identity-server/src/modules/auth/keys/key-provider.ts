/**
 * Importing npm packages
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  kekVersion: number;
}

/**
 * Wraps and unwraps secrets (signing private keys, TOTP seeds) with a key-encryption key (KEK).
 * The interface is deliberately small so a KMS/HSM-backed provider can replace the env-derived
 * implementation without any schema or caller changes.
 */
export abstract class KeyProvider {
  abstract readonly kekVersion: number;
  abstract encrypt(plaintext: Buffer): EncryptedSecret;
  abstract decrypt(secret: EncryptedSecret): Buffer;
}

/**
 * Declaring the constants
 */
const CURRENT_KEK_VERSION = 1;

/**
 * Derives a 256-bit KEK from the configured master key via SHA-256 and performs AES-256-GCM
 * envelope encryption. Suitable for development and single-region deployments; production should
 * bind this behind a managed KMS.
 */
@Injectable()
export class EnvKeyProvider extends KeyProvider {
  readonly kekVersion = CURRENT_KEK_VERSION;
  private readonly kek: Buffer;

  constructor() {
    super();
    const masterKey = Config.get('security.master-encryption-key');
    this.kek = createHash('sha256').update(masterKey).digest();
  }

  encrypt(plaintext: Buffer): EncryptedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.kek, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: authTag.toString('base64'), kekVersion: this.kekVersion };
  }

  decrypt(secret: EncryptedSecret): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', this.kek, Buffer.from(secret.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, 'base64')), decipher.final()]);
  }
}
