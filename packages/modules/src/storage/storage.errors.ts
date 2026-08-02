/**
 * Importing npm packages
 */
import { ErrorCode } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** The object-storage error catalog. Infra faults stay `AppError.internal`; these are the domain-shaped keys callers can branch on. */
export class StorageErrorCode extends ErrorCode {
  /** The requested ref has no object behind it */
  static readonly OBJECT_NOT_FOUND = StorageErrorCode.notFound('STORAGE_OBJECT_NOT_FOUND', 'Stored object not found');

  /** Presigned uploads were requested from a driver that cannot mint them (the local-disk driver) */
  static readonly PRESIGN_UNSUPPORTED = StorageErrorCode.internal('STORAGE_PRESIGN_UNSUPPORTED', 'Presigned uploads are not supported by the {driver} storage driver');
}
