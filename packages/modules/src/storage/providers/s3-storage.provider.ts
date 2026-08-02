/**
 * Importing npm packages
 */
import { S3Client } from 'bun';

import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { StorageErrorCode } from '../storage.errors';
import { type StorageObject, type StorageProvider } from '../storage.types';
import { contentTypeFromRef } from '../storage.utils';

/**
 * Defining types
 */

export interface S3StorageProviderConfig {
  endpoint: string;
  externalEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Declaring the constants
 */

/**
 * S3-compatible provider backed by Bun's built-in `S3Client` (Garage in production). Reads and writes
 * go through the in-cluster endpoint; presigned uploads are signed against the external endpoint so the
 * URL a browser receives resolves from outside the cluster. Presigning is an offline signature — no
 * network call — so the presign client exists purely to carry the external endpoint into the signature.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;

  constructor(config: S3StorageProviderConfig) {
    const credentials = {
      region: config.region,
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
    this.client = new S3Client({ ...credentials, endpoint: config.endpoint });
    this.presignClient = new S3Client({ ...credentials, endpoint: config.externalEndpoint });
  }

  async put(ref: string, bytes: Uint8Array, contentType: string): Promise<void> {
    try {
      await this.client.write(ref, bytes, { type: contentType });
    } catch (error) {
      throw AppError.internal(`Failed to write object '${ref}' to S3 storage`, error);
    }
  }

  async get(ref: string): Promise<StorageObject> {
    const file = this.client.file(ref);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { bytes, contentType: file.type || contentTypeFromRef(ref) };
    } catch (error) {
      if (await this.isMissing(file)) throw StorageErrorCode.OBJECT_NOT_FOUND.create({ ref }, error);
      throw AppError.internal(`Failed to read object '${ref}' from S3 storage`, error);
    }
  }

  async delete(ref: string): Promise<void> {
    try {
      await this.client.delete(ref);
    } catch (error) {
      throw AppError.internal(`Failed to delete object '${ref}' from S3 storage`, error);
    }
  }

  async exists(ref: string): Promise<boolean> {
    try {
      return await this.client.file(ref).exists();
    } catch (error) {
      throw AppError.internal(`Failed to stat object '${ref}' in S3 storage`, error);
    }
  }

  presignUpload(ref: string, contentType: string, expiresSeconds: number): string {
    return this.presignClient.presign(ref, { method: 'PUT', expiresIn: expiresSeconds, type: contentType });
  }

  private async isMissing(file: ReturnType<S3Client['file']>): Promise<boolean> {
    try {
      return !(await file.exists());
    } catch {
      return false;
    }
  }
}
