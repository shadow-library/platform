# @shadow-library/fastify

A powerful TypeScript-first Fastify wrapper featuring decorator-based routing, automatic validation, response serialization, and comprehensive middleware support.

## Features

- 🚀 **High Performance**: Built on top of Fastify, one of the fastest Node.js web frameworks
- 🎯 **Decorator-Based**: Clean, intuitive API using TypeScript decorators
- ✅ **Automatic Validation**: Fast validation for body, query, and URL parameters using AJV
- 📝 **Response Serialization**: Consistent response formatting with fast-json-stringify
- 🔒 **Authentication & Authorization**: Built-in support for guards and middleware
- 🛡️ **Error Handling**: Comprehensive error handling with custom error types
- 🔄 **Middleware Support**: Flexible middleware system with lifecycle hooks
- 📊 **Type Safety**: Full TypeScript support with schema generation
- 🎨 **Templating Ready**: Built-in support for templating engines
- ⚡ **Dynamic Module**: Configurable module with `forRoot()` and `forRootAsync()` methods

## Installation

```bash
# npm
npm install @shadow-library/fastify

# yarn
yarn add @shadow-library/fastify

# pnpm
pnpm add @shadow-library/fastify

# bun
bun add @shadow-library/fastify
```

## Quick Start

### 1. Create a Controller

```typescript
import { HttpController, Get, Post, Body, RespondFor } from '@shadow-library/fastify';
import { Schema, Field } from '@shadow-library/class-schema';

@Schema()
class CreateUserDto {
  @Field(() => String, { minLength: 2, maxLength: 50 })
  name: string;

  @Field(() => String, { format: 'email' })
  email: string;
}

@Schema()
class UserResponse {
  @Field(() => Number)
  id: number;

  @Field(() => String)
  name: string;

  @Field(() => String)
  email: string;
}

@HttpController('/api/users')
export class UserController {
  @Get()
  @RespondFor(200, [UserResponse])
  async getUsers(): Promise<UserResponse[]> {
    return [{ id: 1, name: 'John Doe', email: 'john@example.com' }];
  }

  @Post()
  @RespondFor(201, UserResponse)
  async createUser(@Body() userData: CreateUserDto): Promise<UserResponse> {
    // Your business logic here
    return { id: 2, ...userData };
  }
}
```

### 2. Create a Module

`FastifyModule` is a dynamic module that provides both synchronous and asynchronous configuration methods.

```typescript
import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { UserController } from './user.controller';

@Module({
  imports: [
    FastifyModule.forRoot({
      controllers: [UserController],
      port: 3000,
      host: '0.0.0.0',
    }),
  ],
})
export class AppModule {}
```

### 3. Bootstrap Your Application

```typescript
import { ShadowFactory } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { AppModule } from './app.module';

Logger.addDefaultTransports();

async function bootstrap() {
  const app = await ShadowFactory.create(AppModule);
  await app.start();
}

bootstrap();
```

## API Reference

### Decorators

#### Route Decorators

```typescript
@Get(path?: string)        // GET requests
@Post(path?: string)       // POST requests
@Put(path?: string)        // PUT requests
@Patch(path?: string)      // PATCH requests
@Delete(path?: string)     // DELETE requests
@Options(path?: string)    // OPTIONS requests
@Head(path?: string)       // HEAD requests
```

#### Parameter Decorators

```typescript
@Body(schema?: JSONSchema)     // Request body
@Params(schema?: JSONSchema)   // URL parameters
@Query(schema?: JSONSchema)    // Query parameters
@Request() / @Req()            // Raw Fastify request
@Response() / @Res()           // Raw Fastify response
```

#### Response Decorators

```typescript
@RespondFor(statusCode: number, schema: Class | JSONSchema)
@HttpStatus(statusCode: number)
```

#### Controller Decorator

```typescript
@HttpController(prefix?: string)
```

### Example: Advanced Usage with Authentication

```typescript
import { HttpController, Get, Post, Middleware, Body, Params } from '@shadow-library/fastify';

// Custom Authentication Guard
@Middleware({ type: 'preHandler', weight: 100 })
class AuthGuard {
  use(request: HttpRequest, reply: HttpResponse, done: HttpCallback) {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    // Validate token logic here
    done();
  }
}

@HttpController('/api/protected')
export class ProtectedController {
  @Get('/profile')
  @RespondFor(200, UserResponse)
  async getProfile(@Request() req): Promise<UserResponse> {
    // Access authenticated user from request
    return req.user;
  }
}
```

### Error Handling

```typescript
import { ServerError, ServerErrorCode } from '@shadow-library/fastify';

@HttpController('/api')
export class ExampleController {
  @Get('/error')
  throwError() {
    // Throws a predefined server error
    throw new ServerError(ServerErrorCode.S008);
  }

  @Get('/custom-error')
  throwCustomError() {
    // Throws a custom error
    throw new Error('Something went wrong');
  }
}
```

### Child Routes and Route Resolution

```typescript
@HttpController('/api')
export class RoutesController {
  constructor(@Inject(Router) private readonly fastifyRouter: FastifyRouter) {}

  @Get('/unified')
  async unifiedRoute(@Query() query: Record<string, any>) {
    const results = [];
    for (const route of query.routes?.split(',') ?? []) {
      const result = await this.fastifyRouter.resolveChildRoute(route);
      results.push(result);
    }
    return { results };
  }
}
```

#### Child Routes Configuration

Child routes enable server-side route resolution, commonly used for SSR (Server-Side Rendering) and internal API composition. When enabled, you can make internal HTTP requests to your own routes without going through the network layer.

**Basic Setup:**

```typescript
@Module({
  imports: [
    FastifyModule.forRoot({
      controllers: [UserController, DataController],

      // Enable child routes functionality
      enableChildRoutes: true,

      // Optional: Provide custom headers for child route requests
      childRouteHeaders: () => ({
        'x-correlation-id': '123',
      }),
    }),
  ],
})
export class AppModule {}
```

**Usage in Controllers:**

```typescript
@HttpController('/api')
export class DataAggregatorController {
  constructor(@Inject(Router) private readonly fastifyRouter: FastifyRouter) {}

  @Get('/dashboard')
  async getDashboardData() {
    // Make internal requests to other routes
    const [users, posts, analytics] = await Promise.all([
      this.fastifyRouter.resolveChildRoute('/api/users'),
      this.fastifyRouter.resolveChildRoute('/api/posts?limit=10'),
      this.fastifyRouter.resolveChildRoute('/api/analytics/summary'),
    ]);

    return {
      dashboard: {
        users,
        posts,
        analytics,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
```

**Custom Headers Function:**

The `childRouteHeaders` function is called for each child route request, allowing you to:

- Pass authentication context from the parent request
- Include tenant/user-specific information
- Add tracing or correlation IDs
- Set internal service flags

```typescript
// Dynamic headers based on current request context
childRouteHeaders: (contextService) => {
  const request = contextService.getRequest();
  return {
    'x-user-id': contextService.get('currentUserId'),
    'x-request-id': contextService.getRID(),
    'x-forwarded-from': 'internal-aggregator',
    'x-correlation-id': request.headers['x-correlation-id'],
  };
},
```

**Important Notes:**

- Child routes always include the header `x-service: 'internal-child-route'`
- Custom headers are merged with the default service header
- If you provide an `x-service` header, it will be overridden with the default value
- Child routes create isolated contexts, preventing middleware conflicts
- Enable only when needed, as it adds routing overhead

## Configuration

### Dynamic Module Configuration

`FastifyModule` is a **dynamic module** that configures itself based on the options you provide. Unlike static modules, dynamic modules return a module configuration object at runtime, allowing for flexible dependency injection and configuration.

The module provides two configuration methods:

#### Synchronous Configuration (forRoot)

```typescript
@Module({
  imports: [
    FastifyModule.forRoot({
      // Basic server configuration
      host: 'localhost',
      port: 8080,

      // Controllers to register
      controllers: [UserController, AuthController],

      // Additional providers
      providers: [UserService, AuthService],

      // Error handling
      errorHandler: new CustomErrorHandler(),

      // Security
      maskSensitiveData: true,

      // Request ID generation
      requestIdLogLabel: 'rid',
      genReqId: () => uuid(),

      // Router options
      routerOptions: {
        ignoreTrailingSlash: true,
        ignoreDuplicateSlashes: true,
      },

      // Response schemas for error handling
      responseSchema: {
        '4xx': ErrorResponseSchema,
        '5xx': ErrorResponseSchema,
      },

      // Child routes configuration (for SSR and internal route resolution)
      enableChildRoutes: true,
      childRouteHeaders: contextService => ({
        'x-correlation-id': contextService.getRequest().headers['x-correlation-id'],
      }),

      // Extend Fastify instance before registering controllers
      fastifyFactory: async fastify => {
        // Register plugins, add hooks, or configure Fastify
        await fastify.register(require('@fastify/cors'), {
          origin: true,
        });

        fastify.addHook('onRequest', async (request, reply) => {
          console.log(`Incoming request: ${request.method} ${request.url}`);
        });

        return fastify;
      },
    }),
  ],
})
export class AppModule {}
```

#### Asynchronous Configuration (forRootAsync)

Use `forRootAsync` when you need to inject dependencies or load configuration dynamically:

```typescript
@Module({
  imports: [
    FastifyModule.forRootAsync({
      useFactory: async (configService: ConfigService) => ({
        host: configService.get('HOST'),
        port: configService.get('PORT'),
        controllers: [UserController],
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

#### Dynamic Module Benefits

- **Flexible Configuration**: Configure the module differently for different environments
- **Dependency Injection**: Inject services into the module configuration
- **Runtime Configuration**: Load configuration from external sources (databases, config files, etc.)
- **Type Safety**: Full TypeScript support for all configuration options
- **Modular Design**: Easy to compose with other modules in your application

### Extending Fastify Instance

Use the `fastifyFactory` option to customize the Fastify instance before controllers are registered. This is perfect for adding plugins, global hooks, or custom configurations:

```typescript
import { Module } from '@shadow-library/app';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

@Module({
  imports: [
    FastifyModule.forRoot({
      controllers: [UserController],
      fastifyFactory: async fastify => {
        // Register security plugins
        await fastify.register(helmet, {
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
            },
          },
        });

        // Add CORS support
        await fastify.register(cors, {
          origin: (origin, callback) => {
            const allowedOrigins = ['http://localhost:3000', 'https://myapp.com'];
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true);
            } else {
              callback(new Error('Not allowed by CORS'), false);
            }
          },
          credentials: true,
        });

        // Add rate limiting
        await fastify.register(rateLimit, {
          max: 100,
          timeWindow: '1 minute',
        });

        // Add global hooks
        fastify.addHook('onRequest', async (request, reply) => {
          console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`);
        });

        fastify.addHook('onResponse', async (request, reply) => {
          const responseTime = reply.elapsedTime;
          console.log(`Response sent in ${responseTime}ms`);
        });

        // Add custom context or decorators
        fastify.decorate('config', {
          apiVersion: 'v1',
          environment: process.env.NODE_ENV,
        });

        // Register custom content type parsers
        fastify.addContentTypeParser('text/plain', { parseAs: 'string' }, (req, body, done) => {
          done(null, body);
        });

        return fastify;
      },
    }),
  ],
})
export class AppModule {}
```

#### Common Use Cases for fastifyFactory:

- **Security**: Add helmet, CORS, rate limiting
- **Logging**: Custom request/response logging hooks
- **Authentication**: Register authentication plugins
- **File Upload**: Configure multipart/file upload handling
- **Custom Parsers**: Add support for custom content types
- **Swagger/OpenAPI**: Register documentation plugins
- **Database**: Add database connection decorators
- **Caching**: Configure caching plugins

## Middleware

Create custom middleware by implementing the `Middleware` decorator:

```typescript
@Middleware({ type: 'preHandler', weight: 50 })
export class LoggingMiddleware {
  use(request: HttpRequest, reply: HttpResponse, done: HttpCallback) {
    console.log(`${request.method} ${request.url}`);
    done();
  }
}

// Or generate middleware dynamically
@Middleware({ type: 'preValidation', weight: 75 })
export class ValidationMiddleware {
  generate(route: RouteMetadata) {
    return (request: HttpRequest, reply: HttpResponse, done: HttpCallback) => {
      // Custom validation logic based on route metadata
      done();
    };
  }
}
```

## Validation

The package uses `@shadow-library/class-schema` for automatic validation:

```typescript
@Schema()
class CreateProductDto {
  @Field(() => String, {
    minLength: 1,
    maxLength: 100,
    description: 'Product name',
  })
  name: string;

  @Field(() => Number, {
    minimum: 0,
    description: 'Product price in cents',
  })
  price: number;

  @Field(() => [String], {
    maxItems: 10,
    description: 'Product tags',
  })
  tags?: string[];
}
```

## Response Serialization

Define response schemas for automatic serialization and documentation:

```typescript
@Schema()
class ProductResponse {
  @Field(() => Number)
  id: number;

  @Field(() => String)
  name: string;

  @Field(() => Number)
  price: number;

  @Field(() => Date)
  createdAt: Date;
}

@HttpController('/products')
export class ProductController {
  @Get('/:id')
  @RespondFor(200, ProductResponse)
  @RespondFor(404, ErrorResponse)
  async getProduct(@Params() params: { id: number }): Promise<ProductResponse> {
    // Only the fields defined in ProductResponse will be serialized
    return this.productService.findById(params.id);
  }
}
```

## Context Service

The `ContextService` provides request-scoped context management using Node.js AsyncLocalStorage. It allows you to access request-specific data from anywhere in your application without explicitly passing it through function parameters.

**Important**: Context is automatically initialized for all HTTP requests and is always available within the request-response lifecycle (controllers, middleware, guards, services called during request processing). The `isInitialized()` method is primarily useful for methods that might be called both within and outside the request-response scope, such as during application startup, migrations, or background tasks.

### Accessing Context Service

```typescript
import { ContextService } from '@shadow-library/fastify';

@HttpController('/api')
export class ExampleController {
  constructor(private readonly contextService: ContextService) {}

  @Get('/current-request')
  getCurrentRequestInfo() {
    const request = this.contextService.getRequest();
    const rid = this.contextService.getRID();

    return {
      method: request.method,
      url: request.url,
      requestId: rid,
      userAgent: request.headers['user-agent'],
    };
  }
}
```

### Core Methods

#### Context State Management

```typescript
// Check if context is initialized
// Useful for methods that may be called outside request-response scope
// (e.g., during migrations, startup tasks, background jobs)
contextService.isInitialized(): boolean

// Check if running in a child context (for nested operations)
contextService.isChildContext(): boolean
```

#### Request/Response Access

```typescript
// Get the current HTTP request object
contextService.getRequest(): FastifyRequest
contextService.getRequest(false): FastifyRequest | null

// Get the current HTTP response object
contextService.getResponse(): FastifyReply
contextService.getResponse(false): FastifyReply | null

// Get the current request ID
contextService.getRID(): string
contextService.getRID(false): string | null
```

#### Data Storage

```typescript
// Store data in current context
contextService.set('user', userData);
contextService.set('startTime', Date.now());

// Retrieve data from current context
const user = contextService.get('user');
const startTime = contextService.get('startTime', true); // throws if missing

// Store data in parent context (when in child context)
contextService.setInParent('sharedData', value);

// Get data from parent context
const parentData = contextService.getFromParent('sharedData');

// Resolve data (checks current context first, then parent)
const resolvedData = contextService.resolve('someKey');
```

### Practical Examples

#### Service Used in Multiple Contexts

```typescript
@Injectable()
export class UserService {
  constructor(private readonly contextService: ContextService) {}

  async getUserInfo(userId: string) {
    // This service method might be called during HTTP requests
    // OR during migrations/background tasks
    if (this.contextService.isInitialized()) {
      // We're in a request context - can access request-specific data
      const requestId = this.contextService.getRID();
      console.log(`Fetching user ${userId} for request ${requestId}`);

      // Maybe add audit trail with request context
      const request = this.contextService.getRequest();
      await this.auditLog.log({
        action: 'getUserInfo',
        userId,
        requestId,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
    } else {
      // We're outside request context (migration, background task, etc.)
      console.log(`Fetching user ${userId} outside request context`);
    }

    return this.database.findUser(userId);
  }
}
```

#### Migration Script Example

```typescript
// During migrations, context is not initialized
class UserMigration {
  constructor(private readonly userService: UserService) {}

  async migrateBulkUsers() {
    // Context is NOT initialized here
    console.log('Context initialized:', this.contextService.isInitialized()); // false

    const users = await this.userService.getAllUsers(); // Works fine
    // Process users...
  }
}
```

#### Request Logging Middleware

```typescript
@Middleware({ type: 'onRequest', weight: 100 })
export class RequestLoggerMiddleware {
  constructor(private readonly contextService: ContextService) {}

  use(request: FastifyRequest, reply: FastifyReply, done: Function) {
    // Context is ALWAYS initialized in middleware during requests
    // No need to check isInitialized() here
    this.contextService.set('startTime', Date.now());
    this.contextService.set('userIP', request.ip);
    done();
  }
}

@Middleware({ type: 'onResponse', weight: 100 })
export class ResponseLoggerMiddleware {
  constructor(private readonly contextService: ContextService) {}

  use(request: FastifyRequest, reply: FastifyReply, done: Function) {
    // Context is ALWAYS initialized in middleware during requests
    const startTime = this.contextService.get<number>('startTime');
    const duration = startTime ? Date.now() - startTime : 0;

    console.log({
      requestId: this.contextService.getRID(),
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: `${duration}ms`,
      userIP: this.contextService.get('userIP')
    });
    done();
  }
}

      console.log({
        requestId: this.contextService.getRID(),
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration: `${duration}ms`,
        userIP: this.contextService.get('userIP'),
      });
    }
    done();
  }
}
```

#### Authentication Context

```typescript
@Middleware({ type: 'preHandler', weight: 90 })
export class AuthMiddleware {
  constructor(private readonly contextService: ContextService) {}

  async use(request: FastifyRequest, reply: FastifyReply) {
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (token) {
      // Context is always available in middleware during requests
      const user = await this.validateToken(token);
      if (user) {
        // Store authenticated user in context
        this.contextService.set('currentUser', user);
        this.contextService.set('isAuthenticated', true);
      }
    }
  }
}

// Use in any controller or service
@HttpController('/api/profile')
export class ProfileController {
  constructor(private readonly contextService: ContextService) {}

  @Get()
  getProfile() {
    // Context is always available in controllers during requests
    const isAuthenticated = this.contextService.get<boolean>('isAuthenticated');
    if (!isAuthenticated) {
      throw new ServerError(ServerErrorCode.UNAUTHORIZED);
    }

    const currentUser = this.contextService.get('currentUser');
    return { user: currentUser };
  }
}
```

#### Child Context Usage

```typescript
@HttpController('/api')
export class DataController {
  constructor(
    private readonly contextService: ContextService,
    @Inject(Router) private readonly fastifyRouter: FastifyRouter,
  ) {}

  @Get('/aggregate')
  async getAggregateData() {
    const results = [];

    // Each child route call creates a new child context
    for (const endpoint of ['/users', '/posts', '/comments']) {
      const result = await this.fastifyRouter.resolveChildRoute(endpoint);
      results.push(result);
    }

    return { aggregated: results };
  }
}
```

### Extending Context Service

The `ContextService` can be extended with custom methods to add application-specific functionality while maintaining type safety and method chaining capabilities.

```typescript
import { contextService } from '@shadow-library/fastify';

declare module '@shadow-library/fastify' {
  export interface ContextExtension {
    setUserRole(role: string): ContextService;
    getUserRole(): string;
    setCurrentUserId(userId: string): ContextService;
    getCurrentUserId(): string;
  }
}

// Extend the context service with custom methods
contextService.extend({
  setUserRole(role: string) {
    return this.set('user-role', role);
  },
  getUserRole() {
    return this.get<string>('user-role', false);
  },
  setCurrentUserId(userId: string) {
    return this.set('current-user-id', userId);
  },
  getCurrentUserId() {
    return this.get<string>('current-user-id', false);
  },
});

// Use in controllers with method chaining
@HttpController('/api')
export class UserController {
  constructor(private readonly contextService: ContextService) {}

  @Post('/login')
  async login(@Body() loginDto: LoginDto) {
    const user = await this.authService.validateUser(loginDto);

    // Chain extended methods
    this.contextService.setCurrentUserId(user.id).setUserRole(user.role);

    return { message: 'Login successful' };
  }

  @Get('/profile')
  getProfile() {
    return {
      userId: this.contextService.getCurrentUserId(),
      role: this.contextService.getUserRole(),
      requestId: this.contextService.getRID(),
    };
  }
}
```

## Examples

Check out the [examples](./examples) directory for complete working examples:

- **hello-world**: Basic HTTP controller with GET/POST routes
- **user-auth**: Advanced example with authentication guards
- **child-routes**: Route resolution, unified endpoints, and custom headers for SSR

## Contributing

Contributions are welcome! Please read the [Contributing Guide](./CONTRIBUTING.md) for details.

## License

This package is licensed under the MIT License. See the [LICENSE](./LICENSE) file for more information.
