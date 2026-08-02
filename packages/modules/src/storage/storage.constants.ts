/**
 * Importing npm packages
 */
import { ConfigOptions, ConfigRecords } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const STORAGE_MODULE_OPTIONS = Symbol('STORAGE_MODULE_OPTIONS');

export const LOGGER_NAMESPACE = '@shadow-library/modules/storage';

export const DEFAULT_CONFIGS = {
  'storage.driver': { defaultValue: 's3', allowedValues: ['s3', 'local'] },

  'storage.s3.endpoint': { defaultValue: 'http://garage.system.svc:3900', isProdRequired: true },
  'storage.s3.external-endpoint': {},
  'storage.s3.region': { defaultValue: 'garage' },
  'storage.s3.bucket': { defaultValue: 'storage', isProdRequired: true },
  'storage.s3.access-key-id': { isProdRequired: true },
  'storage.s3.secret-access-key': { isProdRequired: true },

  'storage.public-origin': { defaultValue: 'http://localhost:8080/local-storage', isProdRequired: true },
  'storage.local.dir': { defaultValue: './storage-data' },
} as const satisfies Partial<Record<keyof ConfigRecords, ConfigOptions>>;
