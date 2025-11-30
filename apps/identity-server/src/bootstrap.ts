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
    /** Server configs */
    'server.port': number;
    'server.host': string;

    /** Database configs */
    'db.primary.url': string;

    /** Cache configs */
    'cache.redis.url': string;
    'cache.memcached.servers': string[];
    'cache.lru.ttl': number;
    'cache.lru.size': number;

    /** Auth configs */
    'auth.flow.ttl': number;
  }
}

/**
 * Configs
 */
Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

Config.load('db.primary.url', { envKey: 'PRIMARY_DATABASE_URL', defaultValue: 'postgresql://admin:password@localhost/shadow_identity' });

Config.load('cache.redis.url', { envKey: 'REDIS_URL', defaultValue: 'redis://localhost:6379' });
Config.load('cache.memcached.servers', { envKey: 'MEMCACHED_SERVERS', defaultValue: 'localhost:11211', isArray: true });
Config.load('cache.lru.ttl', { defaultValue: '60', validateType: 'number' });
Config.load('cache.lru.size', { defaultValue: '5000', validateType: 'number' });

Config.load('auth.flow.ttl', { defaultValue: '900', validateType: 'number' });
