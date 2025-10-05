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

```typescript
import { FastifyModule } from '@shadow-library/fastify';
import { UserController } from './user.controller';

export const AppModule = FastifyModule.forRoot({
  controllers: [UserController],
  port: 3000,
  host: '0.0.0.0',
});
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

## Configuration

### Module Configuration

```typescript
const AppModule = FastifyModule.forRoot({
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
});
```

### Async Configuration

```typescript
const AppModule = FastifyModule.forRootAsync({
  useFactory: async (configService: ConfigService) => ({
    host: configService.get('HOST'),
    port: configService.get('PORT'),
    controllers: [UserController],
  }),
  inject: [ConfigService],
});
```

### Extending Fastify Instance

Use the `fastifyFactory` option to customize the Fastify instance before controllers are registered. This is perfect for adding plugins, global hooks, or custom configurations:

```typescript
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

const AppModule = FastifyModule.forRoot({
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
});
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

## Examples

Check out the [examples](./examples) directory for complete working examples:

- **hello-world**: Basic HTTP controller with GET/POST routes
- **user-auth**: Advanced example with authentication guards
- **child-routes**: Route resolution and unified endpoints

## Contributing

Contributions are welcome! Please read the [Contributing Guide](./CONTRIBUTING.md) for details.

## License

This package is licensed under the MIT License. See the [LICENSE](./LICENSE) file for more information.
