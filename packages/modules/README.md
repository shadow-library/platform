# @shadow-library/modules

A collection of shared modules for the Shadow Apps ecosystem, providing reusable components for configuration management, authentication, cloud access, email, notifications, and other essential services. Designed for seamless integration across all Node.js applications following the Shadow Library architecture.

## Installation

Install the package via npm, yarn, or bun:

```bash
npm install @shadow-library/modules
# or
yarn add @shadow-library/modules
# or
bun add @shadow-library/modules
```

### Peer Dependencies

This package relies on several peer dependencies. Ensure you have them installed:

```bash
npm install @shadow-library/app @shadow-library/common @shadow-library/fastify reflect-metadata
```

If you are using the Database module, install the relevant drivers:

```bash
# For Drizzle ORM (required for PostgreSQL)
npm install drizzle-orm

# For Redis
npm install ioredis

# For Memcached
npm install memcached
```

## Features

### HttpCore Module

The `HttpCoreModule` provides a robust foundation for HTTP services, integrating essential middleware and configurations.

- **Security**: Built-in integration with `@fastify/helmet` for security headers and CSRF protection middleware.
- **Compression**: Automatic response compression using `@fastify/compress`.
- **Health Checks**: Standalone health server with `/health/live` and `/health/ready` endpoints for Kubernetes probes.
- **OpenAPI Support**: Seamless integration for generating OpenAPI documentation.
- **Request Initialization**: Middleware for initializing request context.
- **Cookie Support**: Integrated cookie handling.

### Database Module

The `DatabaseModule` provides a unified database access layer for PostgreSQL (via Drizzle ORM), Redis, and Memcached.

- **PostgreSQL via Drizzle ORM**: First-class support for built-in drizzle-orm drivers (`bun-sql`, `node-postgres`, `postgres-js`, etc.) with automatic dynamic imports, or a custom factory for full control.
- **Redis**: Full Redis client lifecycle management via `ioredis`.
- **Memcached**: Full Memcached client lifecycle management.
- **Connection Testing**: Automatic connection verification on startup for all backends (PostgreSQL runs `SELECT 1`, Redis waits for `ready`, Memcached runs `stats`).
- **Error Translation**: Translates PostgreSQL constraint violations into application-specific errors via a configurable constraint error map.
- **Environment Variable Fallbacks**: Connection URLs can be provided in code or fall back to environment variables.
- **Utility Methods**: `attachParent` and `attachMatchingParent` helpers for linking related database records.

### Cache Module

The `CacheModule` offers a multi-level caching strategy (L1: in-memory LRU, L2: Redis or Memcached).

- **L1 Cache**: In-memory LRU cache with configurable size and TTL.
- **L2 Cache**: Automatically uses Redis or Memcached (provided by the `DatabaseModule`) as the L2 backend.
- **Abstraction**: Unified `CacheService` for consistent caching operations regardless of the backend.
- **Direct Access**: `RedisCacheService` and `MemcacheService` are also exported for backend-specific operations.

## Usage

You can import the modules separately to keep your application bundle small and focused.

### Importing HttpCore

```typescript
import { HttpCoreModule } from '@shadow-library/modules/http-core';
```

### Importing Database

```typescript
import { DatabaseModule, DatabaseService } from '@shadow-library/modules/database';
```

### Importing Cache

```typescript
import { CacheModule, CacheService, RedisCacheService, MemcacheService } from '@shadow-library/modules/cache';
```

## Technical Details

### HttpCore Module

The `HttpCoreModule` is designed to be imported into your root application module. It configures the Fastify instance with essential middleware and settings.

#### Configuration

The `HttpCoreModule.forRoot()` method accepts an options object to configure the underlying services:

```typescript
import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules/http-core';

@Module({
  imports: [
    FastifyModule.forRoot({
      imports: [
        HttpCoreModule.forRoot({
          csrf: {
            disabled: false, // Set to true to completely disable CSRF protection
            expiresIn: { days: 1 },
            refreshLeeway: { hours: 6 },
          },
          helmet: {
            enabled: true, // Enable/disable helmet middleware (defaults to true in production)
            global: true,
            // ... fastify-helmet options
          },
          compress: {
            enabled: true, // Enable/disable compression middleware (defaults to true in production)
            // ... fastify-compress options
          },
          openapi: {
            enabled: true, // Enable/disable OpenAPI documentation (defaults to true in development)
            routePrefix: '/dev/api-docs', // Custom route prefix for OpenAPI docs
            normalizeSchemaIds: true, // Normalize class-schema IDs for cleaner OpenAPI spec
            // ... OpenAPI document definition
          },
        }),
      ],
    }),
  ],
})
export class AppModule {}
```

#### Configuration Precedence

For features that can be toggled (Helmet, Compression, OpenAPI, CSRF), the following order of precedence is used to determine whether a feature is enabled:

1. **Code Configuration** – The `enabled` option passed to `HttpCoreModule.forRoot()` takes the highest priority.
2. **Environment Variable** – If not set in code, the corresponding environment variable is checked (e.g., `HTTP_CORE_HELMET_ENABLED`).
3. **Environment Default** – If neither is set, the default is based on the current environment (production or development).

| Feature       | Environment Variable         | Default (Production) | Default (Development) |
| ------------- | ---------------------------- | -------------------- | --------------------- |
| CSRF          | `HTTP_CORE_CSRF_ENABLED`     | `true`               | `true`                |
| Helmet        | `HTTP_CORE_HELMET_ENABLED`   | `true`               | `false`               |
| Compression   | `HTTP_CORE_COMPRESS_ENABLED` | `true`               | `false`               |
| OpenAPI       | `HTTP_CORE_OPENAPI_ENABLED`  | `false`              | `true`                |
| Health Server | `HEALTH_ENABLED`             | `true`               | `false`               |

##### Health Server Configuration

| Setting | Environment Variable | Default     |
| ------- | -------------------- | ----------- |
| Host    | `HEALTH_HOST`        | `localhost` |
| Port    | `HEALTH_PORT`        | `8081`      |

#### Features in Detail

1.  **Health Check**: Runs a standalone HTTP server (separate from the main Fastify server) that provides Kubernetes-compatible health probes:
    - `GET /health/live` - Liveness probe, always returns `200 OK` with body `ok` when the server is running.
    - `GET /health/ready` - Readiness probe, returns `200 OK` with body `ok` when the application is ready, or `503 Service Unavailable` with body `not ready` during startup/shutdown.
    - Supports both `GET` and `HEAD` methods.
    - By default, runs on `localhost:8081` (configurable via environment variables).
    - Enabled by default in production, disabled in development.
2.  **CSRF Protection**:
    - **Disable Option**: CSRF protection can be completely disabled by setting `csrf.disabled: true` in the module configuration. When disabled, the middleware is not registered at all.
    - CSRF validation is only performed when cookies are present in the request (cookie-based session detection).
    - Sets a `csrf-token` cookie when cookies are present but the CSRF token is missing.
    - Validates the `x-csrf-token` header against the cookie token on state-changing requests (`POST`, `PUT`, `DELETE`, etc.).
    - Tokens have an expiration time and are automatically refreshed before expiry.
3.  **Security Headers (Helmet)**:
    - Provides comprehensive security headers including `X-Content-Type-Options`, `X-Frame-Options`, `X-DNS-Prefetch-Control`, and more.
    - Configurable Content Security Policy (CSP) and other security options.
4.  **Compression**:
    - Automatic response compression for improved performance.
5.  **OpenAPI Documentation**:
    - **Route Prefix**: Configure the route prefix with `openapi.routePrefix` (defaults to `/dev/api-docs`).
    - **Schema Normalization**: Set `openapi.normalizeSchemaIds: true` to normalize `class-schema:` prefixed IDs for cleaner OpenAPI specifications.
    - Seamless integration with `@fastify/swagger` and `@scalar/fastify-api-reference` for interactive API documentation.
6.  **Request Initialization**:
    - Ensures every request has a unique `x-correlation-id` header for tracing.
    - Preserves the ID if sent by the client.

### Database Module

The `DatabaseModule` manages connections to PostgreSQL (via Drizzle ORM), Redis, and Memcached. It provides a `DatabaseService` that handles the full lifecycle (connect on init, disconnect on destroy) and exposes getter methods for each client.

#### Configuration

Use `DatabaseModule.forRoot()` or `DatabaseModule.forRootAsync()` to register the module. All three backends (postgres, redis, memcache) are optional — configure only what you need.

**Built-in Drizzle Driver (recommended for `bun-sql`, `node-postgres`, `postgres-js`, etc.):**

```typescript
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules/database';

import * as schema from './schemas';

@Module({
  imports: [
    DatabaseModule.forRoot({
      postgres: {
        type: 'bun-sql',
        schema,
        url: 'postgres://user:pass@localhost:5432/mydb',
        connection: { max: 20 }, // optional driver-specific options
        constraintErrorMap: {
          users_email_unique: new ConflictError('Email already exists'),
        },
      },
      redis: true, // uses DATABASE_REDIS_URL env var
      memcache: true, // uses DATABASE_MEMCACHE_HOSTS env var
    }),
  ],
})
export class AppModule {}
```

The `type` field accepts any supported drizzle-orm driver sub-package:

| Driver             | `type` value        |
| ------------------ | ------------------- |
| Bun SQL            | `'bun-sql'`         |
| node-postgres (pg) | `'node-postgres'`   |
| postgres.js        | `'postgres-js'`     |
| Neon               | `'neon'`            |
| PGlite             | `'pglite'`          |
| Vercel Postgres    | `'vercel-postgres'` |
| Xata HTTP          | `'xata-http'`       |
| PG Proxy           | `'pg-proxy'`        |
| AWS Data API       | `'aws-data-api'`    |

**Custom Factory (full control):**

```typescript
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules/database';
import { drizzle } from 'drizzle-orm/bun-sql';

import * as schema from './schemas';

@Module({
  imports: [
    DatabaseModule.forRoot({
      postgres: {
        type: 'custom',
        factory: logger => drizzle({ schema, logger, connection: 'postgres://...' }),
      },
    }),
  ],
})
export class AppModule {}
```

With a custom factory, you have full control — the module calls `factory(logger)` with a pre-configured query logger and uses the returned client directly.

**Async Configuration:**

```typescript
DatabaseModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    postgres: { type: 'bun-sql', schema, url: configService.get('DATABASE_URL') },
    redis: { url: configService.get('REDIS_URL') },
  }),
});
```

#### Redis and Memcached Options

Redis and Memcached can be configured with `true` (use environment variable defaults) or with an options object:

```typescript
// Boolean shorthand — resolves URL from environment variables
redis: true,
memcache: true,

// Explicit configuration
redis: {
  url: 'redis://localhost:6379',
  options: { /* ioredis options */ },
},
memcache: {
  hosts: 'localhost:11211',
  options: { /* memcached options */ },
},
```

#### Environment Variables

When connection URLs are not provided in code, the module falls back to these environment variables:

| Setting         | Config Key                          | Description                                         |
| --------------- | ----------------------------------- | --------------------------------------------------- |
| PostgreSQL URL  | `database.postgres.url`             | PostgreSQL connection URL                           |
| Max Connections | `database.postgres.max-connections` | Max connections (auto-applied for `bun-sql` driver) |
| Redis URL       | `database.redis.url`                | Redis connection URL                                |
| Memcached Hosts | `database.memcache.hosts`           | Memcached server host(s)                            |

> For the `bun-sql` driver, the module automatically loads `database.postgres.max-connections` from the environment and sets it as the `max` connection option (user-provided connection options take precedence).

#### Usage

Inject `DatabaseService` to access the database clients:

```typescript
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules/database';

@Injectable()
export class UserService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getUsers() {
    const db = this.databaseService.getDrizzleClient();
    return db.select().from(users);
  }
}
```

**Type-safe Drizzle client:**

Augment the `DatabaseRecords` interface to get a fully typed `getDrizzleClient()` return type:

```typescript
import { BunSQLDatabase } from 'drizzle-orm/bun-sql';
import * as schema from './schemas';

declare module '@shadow-library/modules/database' {
  interface DatabaseRecords {
    drizzle: BunSQLDatabase<typeof schema>;
  }
}
```

**Error translation:**

Use `translateError()` to map PostgreSQL constraint violations to application errors:

```typescript
try {
  await db.insert(users).values({ email: 'duplicate@test.com' });
} catch (error) {
  // Throws the mapped error from constraintErrorMap, or InternalError for unknown errors
  this.databaseService.translateError(error);
}
```

**Utility methods:**

```typescript
// Attach a parent object to a child
const linked = databaseService.attachParent(childRecord, parentRecord);
linked.getParent(); // returns parentRecord

// Batch-link sources to parents by matching keys
const linked = databaseService.attachMatchingParent(orders, 'userId', users, 'id');
linked[0].getParent(); // returns the matching user
```

**Available methods on `DatabaseService`:**

| Method                                                   | Description                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| `getDrizzleClient()`                                     | Returns the Drizzle ORM client (throws if not configured)            |
| `getRedisClient()`                                       | Returns the `ioredis` client (throws if not configured)              |
| `getMemcacheClient()`                                    | Returns the `Memcached` client (throws if not configured)            |
| `isDrizzleEnabled()`                                     | Returns `true` if the Drizzle client is initialized                  |
| `isRedisEnabled()`                                       | Returns `true` if the Redis client is initialized                    |
| `isMemcacheEnabled()`                                    | Returns `true` if the Memcached client is initialized                |
| `translateError(error)`                                  | Translates a database error to an app error using the constraint map |
| `attachParent(target, parent)`                           | Attaches a `getParent()` method to the target object                 |
| `attachMatchingParent(sources, sourceKey, parents, ...)` | Batch-links sources to parents by key                                |

### Cache Module

The `CacheModule` provides a multi-level caching strategy (L1: in-memory LRU, L2: Redis or Memcached). It depends on the `DatabaseModule` for Redis and Memcached client connections.

#### Configuration

The `CacheModule` requires the `DatabaseModule` to be configured with Redis and/or Memcached. Import the `DatabaseModule` via `CacheModule.forRootAsync()`:

```typescript
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules/database';
import { CacheModule } from '@shadow-library/modules/cache';

@Module({
  imports: [
    DatabaseModule.forRoot({
      redis: true,
    }),
    CacheModule.forRootAsync({
      imports: [DatabaseModule],
      useFactory: () => ({
        lruCacheSize: 10_000, // Max items in L1 cache (default: 5000)
        lruCacheTTLSeconds: 300, // L1 entry TTL in seconds (optional)
      }),
    }),
  ],
})
export class AppModule {}
```

The `CacheModule` automatically selects the L2 backend based on what's available:

- If Memcached is enabled in `DatabaseModule`, it uses Memcached as L2.
- Otherwise, it uses Redis as L2.

#### Usage

Inject `CacheService` to interact with the cache. It handles L1/L2 logic automatically:

```typescript
import { Injectable } from '@shadow-library/app';
import { CacheService } from '@shadow-library/modules/cache';

@Injectable()
export class UserService {
  constructor(private readonly cacheService: CacheService) {}

  async getUser(id: string) {
    const cachedUser = await this.cacheService.get(`user:${id}`);
    if (cachedUser) return cachedUser;

    const user = { id, name: 'John Doe' };
    await this.cacheService.set(`user:${id}`, user, 60); // TTL: 60 seconds
    return user;
  }
}
```

You can also inject `RedisCacheService` or `MemcacheService` directly for backend-specific features:

```typescript
import { Injectable } from '@shadow-library/app';
import { RedisCacheService } from '@shadow-library/modules/cache';

@Injectable()
export class CounterService {
  constructor(private readonly redisService: RedisCacheService) {}

  async increment(key: string) {
    return await this.redisService.incr(key, 1);
  }
}
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Bugs & Issues

If you encounter any issues, please report them on the [Issue Tracker](https://github.com/shadow-library/modules/issues).
