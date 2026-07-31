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

export const DATABASE_MODULE_OPTIONS = Symbol('DATABASE_MODULE_OPTIONS');

export const LOGGER_NAMESPACE = '@shadow-library/modules/database';

export const DEFAULT_CONFIGS = {
  'database.postgres.url': { defaultValue: 'postgresql://postgres:postgres@localhost/shadow_db', isProdRequired: true },
  'database.memcache.hosts': { defaultValue: 'localhost:11211', isProdRequired: true },
  'database.redis.url': { defaultValue: 'redis://localhost:6379', isProdRequired: true },

  'database.postgres.lazy-connection': { defaultValue: 'false', validateType: 'boolean' },
  'database.postgres.max-connections': { validateType: 'number' },
} as const satisfies Partial<Record<keyof ConfigRecords, ConfigOptions>>;
