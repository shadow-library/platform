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

- **PostgreSQL via Drizzle ORM**: Factory-based configuration — you provide a factory function that receives a `DrizzleConfig` (with logger pre-configured) and a `PostgresConnectionConfig` (with the resolved connection URL and optional max connections), and returns a Drizzle client.
- **Redis**: Full Redis client lifecycle management via `ioredis`.
- **Memcached**: Full Memcached client lifecycle management.
- **Connection Testing**: Automatic connection verification on startup for all backends (PostgreSQL runs `SELECT 1`, Redis waits for `ready`, Memcached runs `stats`).
- **Error Translation**: Translates PostgreSQL constraint violations into application-specific errors via a configurable constraint error map.
- **Environment Variable Fallbacks**: Connection URLs can be provided in code or fall back to environment variables.
- **Clear Peer Dependency Errors**: When optional peer dependencies (`ioredis`, `memcached`) are missing, the error message includes the exact install command for your runtime.
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

The PostgreSQL configuration uses a factory function that gives you full control over how the Drizzle client is created. The factory receives:

- `config: DrizzleConfig` — a pre-configured Drizzle config with the query logger already set up based on the environment.
- `connection: PostgresConnectionConfig` — an object containing the resolved `url` and an optional `maxConnections` (loaded from environment config).

```typescript
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules/database';
import { drizzle } from 'drizzle-orm/node-postgres';

import * as schema from './schemas';

@Module({
  imports: [
    DatabaseModule.forRoot({
      postgres: {
        factory: (config, connection) =>
          drizzle({
            ...config,
            schema,
            connection: { connectionString: connection.url, max: connection.maxConnections },
          }),
        constraintErrorMap: {
          users_email_unique: new ConflictError('Email already exists'),
        },
      },
      redis: true, // uses database.redis.url config
      memcache: true, // uses database.memcache.hosts config
    }),
  ],
})
export class AppModule {}
```

**Async Configuration:**

```typescript
DatabaseModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    postgres: {
      factory: (config, connection) => drizzle({ ...config, schema, connection: connection.url }),
    },
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

| Setting         | Config Key                          | Description                                                                  |
| --------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| PostgreSQL URL  | `database.postgres.url`             | PostgreSQL connection URL (passed to factory via `PostgresConnectionConfig`) |
| Max Connections | `database.postgres.max-connections` | Max connections (passed to factory via `PostgresConnectionConfig`)           |
| Redis URL       | `database.redis.url`                | Redis connection URL                                                         |
| Memcached Hosts | `database.memcache.hosts`           | Memcached server host(s)                                                     |

> The `database.postgres.max-connections` config value is automatically loaded and included in the `PostgresConnectionConfig.maxConnections` field passed to your factory. Your factory decides how to use it (e.g., pass it as a driver-specific `max` option).

#### Usage

Inject `DatabaseService` to access the database clients:

```typescript
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules/database';

@Injectable()
export class UserService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getUsers() {
    const db = this.databaseService.getPostgresClient();
    return db.select().from(users);
  }
}
```

**Type-safe Drizzle client:**

Augment the `DatabaseRecords` interface to get a fully typed `getPostgresClient()` return type:

```typescript
import { BunSQLDatabase } from 'drizzle-orm/bun-sql';
import * as schema from './schemas';

declare module '@shadow-library/modules/database' {
  interface DatabaseRecords {
    postgres: BunSQLDatabase<typeof schema>;
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
| `getPostgresClient()`                                    | Returns the Drizzle ORM client (throws if not configured)            |
| `getRedisClient()`                                       | Returns the `ioredis` client (throws if not configured)              |
| `getMemcacheClient()`                                    | Returns the `Memcached` client (throws if not configured)            |
| `isPostgresEnabled()`                                    | Returns `true` if the Postgres client is initialized                 |
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
