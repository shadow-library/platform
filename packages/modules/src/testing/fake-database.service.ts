/**
 * Importing npm packages
 */
import type Memcached from 'memcached';
import type Redis from 'ioredis';

/**
 * Importing user defined packages
 */
import { DatabaseService } from '../database/database.service';
import { type PostgresClient } from '../database/database.types';
import { InMemoryRedis } from './in-memory-redis';
import { TestingErrorCode } from './testing.errors';

/**
 * Defining types
 */

export interface FakeDatabaseOptions {
  /** Whatever stands in for the Drizzle client — usually a hand-built object with just the chain the unit calls */
  postgres?: object;

  /** Consulted by the inherited `run()`/`translateError()`, exactly as the real module's option is */
  constraintErrorMap?: Record<string, Error>;

  redis?: InMemoryRedis;
}

/**
 * Declaring the constants
 */

/**
 * Stands in for a client nobody supplied. Services capture the client and even prepare statements in
 * their constructors, so touching it has to succeed; only running a query — awaiting a chain that ends
 * in a call — fails, naming the chain that was attempted. The client itself and bare property paths are
 * not thenable, so returning the client from an async function or factory resolves normally.
 */
function createDetachedPostgresClient(path: string): PostgresClient {
  const target = (): undefined => undefined;
  const handler: ProxyHandler<typeof target> = {
    get: (_target, property) => {
      if (property === 'then' || property === 'catch' || property === 'finally') {
        if (!path.endsWith(')')) return undefined;
        return (...handlers: unknown[]) => {
          const failure = Promise.reject(TestingErrorCode.POSTGRES_CLIENT_MISSING.create({ path }));
          return (failure[property] as (...args: unknown[]) => Promise<unknown>).apply(failure, handlers);
        };
      }
      if (typeof property === 'symbol') return undefined;
      return createDetachedPostgresClient(`${path}.${property}`);
    },
    apply: () => createDetachedPostgresClient(`${path}()`),
  };
  return new Proxy(target, handler) as unknown as PostgresClient;
}

/**
 * A `DatabaseService` with no connections: lifecycle hooks do nothing, Redis is an `InMemoryRedis`, and
 * Postgres is whatever the test supplies. `run()`, `translateError()` and the parent-linking helpers are
 * the real implementations, so constraint mapping is exercised rather than faked.
 */
export class FakeDatabaseService extends DatabaseService {
  readonly redis: InMemoryRedis;
  private readonly postgres: PostgresClient;

  constructor(options: FakeDatabaseOptions = {}) {
    const postgres = (options.postgres as PostgresClient | undefined) ?? createDetachedPostgresClient('postgres');
    super({ postgres: { factory: () => postgres, constraintErrorMap: options.constraintErrorMap } });
    this.postgres = postgres;
    this.redis = options.redis ?? new InMemoryRedis();
  }

  override onModuleInit(): Promise<void> {
    return Promise.resolve();
  }

  override onModuleDestroy(): Promise<void> {
    return Promise.resolve();
  }

  override getPostgresClient(): PostgresClient {
    return this.postgres;
  }

  /** Typed as ioredis for drop-in use; only the commands `InMemoryRedis` implements exist on it */
  override getRedisClient(): Redis {
    return this.redis as unknown as Redis;
  }

  override getMemcacheClient(): Memcached {
    throw TestingErrorCode.MEMCACHE_UNSUPPORTED.create();
  }

  override isPostgresEnabled(): boolean {
    return true;
  }

  override isRedisEnabled(): boolean {
    return true;
  }

  override isMemcacheEnabled(): boolean {
    return false;
  }
}
