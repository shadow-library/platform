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

If you are using the Cache module, you will also need to install the driver for your chosen backend:

```bash
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
- **Health Checks**: Ready-to-use `HealthController` exposing a `/health` endpoint.
- **OpenAPI Support**: Seamless integration for generating OpenAPI documentation.
- **Request Initialization**: Middleware for initializing request context.
- **Cookie Support**: Integrated cookie handling.

### Cache Module

The `CacheModule` offers a flexible caching layer with support for multiple backends.

- **Redis Support**: Full integration with Redis via `RedisCacheService`.
- **Memcached Support**: Support for Memcached via `MemcacheService`.
- **Abstraction**: Unified `CacheService` for consistent caching operations regardless of the backend.

## Usage

You can import the modules separately to keep your application bundle small and focused.

### Importing HttpCore

```typescript
import { HttpCoreModule } from '@shadow-library/modules/http-core';
```

### Importing Cache

```typescript
import { CacheModule, RedisCacheService, MemcacheService } from '@shadow-library/modules/cache';
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
            expiresIn: { days: 1 },
            refreshLeeway: { hours: 6 },
          },
          helmet: {
            global: true,
            // ... fastify-helmet options
          },
          compress: {
            // ... fastify-compress options
          },
          openapi: {
            // ... OpenAPI document definition
          },
        }),
      ],
    }),
  ],
})
export class AppModule {}
```

#### Features in Detail

1.  **Health Check**: Automatically registers a `HealthController` that responds to `GET /health` with `{ status: 'ok' }`.
2.  **CSRF Protection**:
    - CSRF validation is only performed when cookies are present in the request (cookie-based session detection).
    - Sets a `csrf-token` cookie when cookies are present but the CSRF token is missing.
    - Validates the `x-csrf-token` header against the cookie token on state-changing requests (`POST`, `PUT`, `DELETE`, etc.).
    - Tokens have an expiration time and are automatically refreshed before expiry.
    - **Dev Mode Toggle**: CSRF protection can be disabled in non-production environments by setting the `HTTP_CORE_CSRF_ENABLED` environment variable to `false`.
3.  **Request Initialization**:
    - Ensures every request has a unique `x-correlation-id` header for tracing.
    - Preserves the ID if sent by the client.

### Cache Module

The `CacheModule` provides a multi-level caching strategy (L1: Memory, L2: Redis/Memcached).

#### Configuration

You can configure the module to use either Redis or Memcached as the L2 cache.

**Using Redis:**

```typescript
import { Module } from '@shadow-library/app';
import { CacheModule } from '@shadow-library/modules/cache';
import Redis from 'ioredis';

const redisClient = new Redis();

@Module({
  imports: [
    CacheModule.forRoot({
      redis: redisClient,
    }),
  ],
})
export class AppModule {}
```

**Using Memcached:**

```typescript
import { Module } from '@shadow-library/app';
import { CacheModule } from '@shadow-library/modules/cache';
import Memcached from 'memcached';

const redisClient = new Redis();
const memcachedClient = new Memcached('localhost:11211');

@Module({
  imports: [
    CacheModule.forRoot({
      redis: redisClient,
      memcached: memcachedClient,
    }),
  ],
})
export class AppModule {}
```

#### Usage

Inject the `CacheService` to interact with the cache. It handles the L1/L2 logic automatically.

```typescript
import { Injectable } from '@shadow-library/app';
import { CacheService } from '@shadow-library/modules/cache';

@Injectable()
export class UserService {
  constructor(private readonly cacheService: CacheService) {}

  async getUser(id: string) {
    // Try to get from cache
    const cachedUser = await this.cacheService.get(`user:${id}`);
    if (cachedUser) {
      return cachedUser;
    }

    // Fetch from DB...
    const user = { id, name: 'John Doe' };

    // Set in cache with TTL (e.g., 60 seconds)
    await this.cacheService.set(`user:${id}`, user, 60);

    return user;
  }
}
```

You can also inject `RedisCacheService` or `MemcacheService` directly if you need backend-specific features (like `incr`, `decr`).

```typescript
import { Injectable } from '@shadow-library/app';
import { RedisCacheService } from '@shadow-library/modules/cache';

@Injectable()
export class CounterService {
  constructor(private readonly redisService: RedisCacheService) {}

  async increment() {
    return await this.redisService.incr('my-counter', 1);
  }
}
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Bugs & Issues

If you encounter any issues, please report them on the [Issue Tracker](https://github.com/shadow-library/modules/issues).
