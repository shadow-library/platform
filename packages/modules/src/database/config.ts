/**
 * Importing npm packages
 */
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'database.postgres.url'?: string;
    'database.postgres.max-connections'?: number;
    'database.postgres.lazy-connection': boolean;
    'database.redis.url'?: string;
    'database.memcache.hosts'?: string;
  }
}

/**
 * Declaring the constants
 */

Config.load('database.redis.url');
Config.load('database.postgres.url');
Config.load('database.memcache.hosts');

Config.load('database.postgres.max-connections', { validateType: 'number' });
Config.load('database.postgres.lazy-connection', { validateType: 'boolean', defaultValue: 'false' });
