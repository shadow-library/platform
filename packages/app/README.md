# @shadow-library/app

This TypeScript package is a framework for building efficient, scalable Node.js applications, emphasizing SOLID principles. It offers unparalleled flexibility through a meticulously crafted modular architecture, serving as a robust, elegant, and well-structured foundation for various applications. The framework introduces SOLID design patterns and well-established solutions to the Node.js landscape, enhancing testability with a sophisticated dependency injection system.

Unlike NestJS which is tightly coupled to HTTP servers and web applications, Shadow Application is platform-agnostic and provides a flexible foundation that can be adapted to any type of application - CLI tools, desktop applications, microservices, or any other Node.js application pattern.

## Features

- **SOLID Principles:** Write maintainable and scalable code following the SOLID design principles.
- **Platform Agnostic:** Unlike NestJS, not tied to HTTP/web servers - build any type of Node.js application.
- **Custom Router Support:** Implement your own router logic to integrate with any framework or protocol.
- **Modular Architecture:** Provides a highly modular architecture with modules, controllers, and providers.
- **Dependency Injection:** Sophisticated system for enhancing testability and managing dependencies.
- **Interceptors:** AOP (Aspect-Oriented Programming) support for cross-cutting concerns.
- **Lifecycle Methods:** Robust lifecycle management to handle initialization, running, and shutdown processes seamlessly.
- **Metadata System:** Rich decorator-based metadata system for configuration and behavior definition.
- **Graceful Shutdown:** Built-in support for graceful application shutdown with signal handling.

## Lifecycle Events

A shadow application manages all the lifecycle events in every application element. It provides lifecycle hooks that give visibility into key lifecycle events, and the ability to act (run registered code on your modules, providers or controllers) when they occur.

The lifecycle methods are divided into three phases: **initializing**, **running** and **terminating**. Using this lifecycle, you can plan for appropriate initialization of modules and services, manage active connections, and gracefully shutdown your application when it receives a termination signal.

The following diagram depicts the sequence of key application lifecycle events, from the time the application is bootstrapped until the node process exits.

![Lifecycle Events][lifecycle-events]

## Installation

```bash
# npm
npm install @shadow-library/app reflect-metadata

# Yarn
yarn add @shadow-library/app reflect-metadata

# pnpm
pnpm add @shadow-library/app reflect-metadata

# Bun
bun add @shadow-library/app reflect-metadata
```

**Note:** `reflect-metadata` is required as a peer dependency for the decorator metadata system to work.

## Quick Start

```ts
import 'reflect-metadata';
import { Module, Injectable, Controller, ShadowFactory } from '@shadow-library/app';

@Injectable()
class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}

@Controller()
class AppController {
  constructor(private readonly appService: AppService) {}

  getHello(): string {
    return this.appService.getHello();
  }
}

@Module({
  controllers: [AppController],
  providers: [AppService],
})
class AppModule {}

async function bootstrap() {
  const app = await ShadowFactory.create(AppModule);
  await app.start();

  // Get service instance
  const appService = app.get(AppService);
  console.log(appService.getHello()); // "Hello World!"
}

bootstrap();
```

## Core Components

### ShadowApplication

The main application class that orchestrates the entire framework. It manages the module registry, handles lifecycle events, and provides dependency injection capabilities.

#### Methods

- `init()`: Initialize the application and all modules
- `start()`: Start the application (calls init if not already initialized)
- `stop()`: Gracefully stop the application
- `get<T>(provider)`: Retrieve a provider instance from the dependency injection container
- `select(module)`: Get a ModuleRef for a specific module
- `isInitiated()`: Check if the application has been initialized

#### Options

```ts
interface ShadowApplicationOptions {
  enableShutdownHooks?: false | NodeJS.Signals[];
}
```

#### Example

```ts
import { ShadowApplication } from '@shadow-library/app';

const app = new ShadowApplication(AppModule, {
  enableShutdownHooks: ['SIGINT', 'SIGTERM'], // Default
});

await app.init();
await app.start();

// Get a service
const myService = app.get(MyService);

// Graceful shutdown
await app.stop();
```

### ShadowFactory

A factory class that provides a convenient way to create and initialize Shadow applications.

```ts
import { ShadowFactory } from '@shadow-library/app';

const app = await ShadowFactory.create(AppModule);
await app.start();
```

## Decorators

### @Module

Defines a module which is a collection of related providers, controllers, and other modules.

```ts
interface ModuleMetadata {
  imports?: (Class<unknown> | ForwardReference<Class<unknown>>)[];
  controllers?: Class<unknown>[];
  providers?: Provider[];
  exports?: InjectionToken[];
}

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [UserController, PostController],
  providers: [UserService, PostService],
  exports: [UserService], // Available to other modules that import this module
})
class UserModule {}
```

### @Injectable

Marks a class as a provider that can be injected into other classes.

```ts
interface InjectableOptions {
  transient?: boolean; // Create new instance for each injection
}

@Injectable()
class UserService {
  findAll() {
    return [];
  }
}

@Injectable({ transient: true })
class TransientService {
  // New instance created for each injection
}
```

### @Controller

Marks a class as a controller. Controllers handle the application logic and can be used with custom routers.

```ts
@Controller()
class UserController {
  constructor(private userService: UserService) {}

  @Route({ path: '/users', method: 'GET' })
  findAll() {
    return this.userService.findAll();
  }
}
```

### @Route

Defines routing metadata for controller methods. The metadata is flexible and can be adapted to any routing system.

```ts
@Route({ path: '/users/:id', method: 'GET' })
getUserById(id: string) {
  return this.userService.findById(id);
}

@Route({
  path: '/users',
  method: 'POST',
  guards: ['auth'],
  middleware: ['validation']
})
createUser(userData: CreateUserDto) {
  return this.userService.create(userData);
}
```

### @Inject

Explicitly specify which provider to inject when TypeScript's type metadata isn't sufficient.

```ts
class UserService {
  constructor(
    @Inject('DATABASE_CONNECTION') private db: DatabaseConnection,
    @Inject(CACHE_MANAGER) private cache: CacheManager,
  ) {}
}
```

### @Optional

Marks a dependency as optional. If the provider isn't available, `undefined` will be injected.

```ts
class UserService {
  constructor(
    private userRepository: UserRepository,
    @Optional() private logger?: Logger,
  ) {}
}
```

### @UseInterceptors

Apply interceptors to methods for cross-cutting concerns like logging, caching, transformation, etc. Unlike NestJS, interceptors can be applied to both controller methods and service methods.

```ts
// On controller methods
@UseInterceptors(LoggingInterceptor, CacheInterceptor)
@Route({ path: '/users', method: 'GET' })
findAll() {
  return this.userService.findAll();
}

// On service methods
@Injectable()
class UserService {
  @UseInterceptors(CacheInterceptor, ValidationInterceptor)
  findById(id: string) {
    return this.userRepository.findById(id);
  }

  @UseInterceptors(LoggingInterceptor)
  async createUser(userData: CreateUserDto) {
    return await this.userRepository.create(userData);
  }
}
```

### @SetMetadata

Attach custom metadata to classes or methods that can be accessed via reflection.

```ts
@SetMetadata('roles', ['admin', 'user'])
@Route({ path: '/admin', method: 'GET' })
adminOnly() {
  return 'Admin data';
}
```

### @EnableIf

Conditionally enable or disable controllers or routes based on runtime conditions.

```ts
// Conditional controller
@EnableIf(process.env.FEATURE_FLAG === 'enabled')
@Controller()
class FeatureController {
  @Route({ path: '/feature', method: 'GET' })
  getFeature() {
    return 'Feature enabled';
  }
}

// Conditional route
@Controller()
class UserController {
  @EnableIf(() => process.env.NODE_ENV === 'production')
  @Route({ path: '/admin', method: 'GET' })
  adminRoute() {
    return 'Admin only in production';
  }
}
```

### applyDecorators

Combine multiple decorators into a single decorator for reusability.

```ts
const Auth = (roles: string[]) =>
  applyDecorators(
    SetMetadata('roles', roles),
    UseInterceptors(AuthInterceptor)
  );

@Auth(['admin'])
@Route({ path: '/admin', method: 'GET' })
adminEndpoint() {
  return 'Protected data';
}
```

## Dependency Injection

### Provider Types

#### Class Provider

```ts
@Module({
  providers: [
    UserService, // Shorthand for { token: UserService, useClass: UserService }
    {
      token: UserService,
      useClass: UserService
    }
  ]
})
```

#### Value Provider

```ts
@Module({
  providers: [
    {
      token: 'API_KEY',
      useValue: process.env.API_KEY
    },
    {
      token: 'CONFIG',
      useValue: { port: 3000, host: 'localhost' }
    }
  ]
})
```

#### Factory Provider

```ts
@Module({
  providers: [
    {
      token: 'DATABASE_CONNECTION',
      useFactory: async (config: ConfigService) => {
        return await createDatabaseConnection(config.getDatabaseUrl());
      },
      inject: [ConfigService]
    }
  ]
})
```

#### Alias Provider

The `useExisting` syntax allows you to create aliases for existing providers. This creates two ways to access the same provider. In the example below, the (string-based) token `'AliasedLoggerService'` is an alias for the (class-based) token `LoggerService`. Assume we have two different dependencies, one for `'AliasedLoggerService'` and one for `LoggerService`. If both dependencies are specified with `SINGLETON` scope, they'll both resolve to the same instance.

```ts
@Module({
  providers: [
    LoggerService,
    {
      token: 'AliasedLoggerService',
      useExisting: LoggerService
    }
  ]
})
```

### Forward References

Handle circular dependencies between modules:

```ts
@Module({
  imports: [forwardRef(() => UserModule)],
  providers: [PostService],
  exports: [PostService],
})
class PostModule {}
```

## Dynamic Modules

Dynamic modules allow you to create configurable, reusable modules that can be customized with options when imported. This is useful for modules that need different configurations for different use cases.

### Creating a Dynamic Module

A dynamic module implements a static method that returns a `DynamicModule` object:

```ts
import { DynamicModule, Module } from '@shadow-library/app';

export interface ConfigModuleOptions {
  folder: string;
}

@Module({})
export class ConfigModule {
  static register(options: ConfigModuleOptions): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ token: 'CONFIG_OPTIONS', useValue: options }, ConfigService],
      exports: [ConfigService],
    };
  }
}
```

### Using Dynamic Modules

Import and configure dynamic modules in your application:

```ts
@Module({
  imports: [ConfigModule.register({ folder: './config' })],
  providers: [AppService],
})
export class AppModule {}
```

### Usage in Services

Inject the dynamic module's providers into your services:

```ts
@Injectable()
export class AppService {
  constructor(private configService: ConfigService) {}

  getHello(): string {
    return this.configService.get('HELLO_MESSAGE');
  }
}
```

### Common Patterns

- **`forRoot`**: Global module configuration (once per application)
- **`register`**: Instance configuration (can be used multiple times)
- **`forFeature`**: Feature-specific registration within a configured module

## Custom Router Implementation

Shadow Application provides a `Router` abstract class that you can extend to implement your own routing logic:

```ts
import { Router, ControllerRouteMetadata } from '@shadow-library/app';

@Injectable()
class ExpressRouter extends Router {
  private app = express();

  async register(controllers: ControllerRouteMetadata[]) {
    for (const controller of controllers) {
      for (const route of controller.routes) {
        const { method, path } = route.metadata;
        this.app[method.toLowerCase()](path, async (req, res) => {
          const result = await route.handler.call(controller.instance, req, res);
          res.json(result);
        });
      }
    }
  }

  async start() {
    this.app.listen(3000, () => {
      console.log('Server running on port 3000');
    });
  }

  async stop() {
    // Implement server shutdown logic
  }
}

@Module({
  providers: [ExpressRouter],
  controllers: [UserController],
})
class AppModule {}
```

## Interceptors

Implement the `Interceptor` interface to create cross-cutting functionality. Unlike NestJS, Shadow Application interceptors can be applied to both controller methods and service methods, providing more flexibility for aspect-oriented programming.

```ts
@Injectable()
class LoggingInterceptor implements Interceptor {
  intercept(context: InterceptorContext, next: CallHandler) {
    const className = context.getClass().name;
    const methodName = context.getMethodName();
    const isAsync = context.isPromise();

    console.log(`Calling ${className}.${methodName} (async: ${isAsync})`);
    const start = Date.now();
    const afterFn = () => console.log(`${className}.${methodName} took ${Date.now() - start}ms`);

    const result = next.handle();
    if (isAsync) result.then(() => afterFn());
    else afterFn();

    return result;
  }
}
```

### InterceptorContext Methods

- `getClass()`: Returns the class whose method is being intercepted
- `getMethodName()`: Returns the name of the method being intercepted
- `getArgs()`: Returns the arguments passed to the intercepted method as an array
- `isPromise()`: Returns `true` if the original method returns a Promise, `false` for synchronous methods

### Important Caveats

**Promise Conversion**: If an interceptor returns a Promise while intercepting a synchronous function, the originally synchronous function will become asynchronous. This means:

```ts
@Injectable()
class MathService {
  @UseInterceptors(AsyncInterceptor) // This interceptor returns a Promise
  add(a: number, b: number): number {
    // Originally synchronous
    return a + b;
  }
}

// Usage:
const result = mathService.add(2, 3); // This will now return a Promise!
// Correct usage: await mathService.add(2, 3);
```

To avoid this, ensure your interceptors handle sync/async appropriately:

```ts
@Injectable()
class SmartInterceptor implements Interceptor {
  intercept(context: InterceptorContext, next: CallHandler) {
    const result = next.handle();

    if (context.isPromise()) {
      // Handle async methods
      return result.then(data => this.processResult(data));
    } else {
      // Handle sync methods - don't return a Promise
      return this.processResult(result);
    }
  }

  private processResult(data: any) {
    // Process the result synchronously
    return data;
  }
}
```

### Interceptor Examples

#### Smart Caching Interceptor (Works on Services)

```ts
@Injectable()
class SmartCacheInterceptor implements Interceptor {
  private memoryCache = new Map<string, any>();

  constructor(@Inject('REDIS_CLIENT') private redisClient: RedisClient) {}

  private async interceptAsync(context: InterceptorContext, next: CallHandler) {
    const className = context.getClass().name;
    const methodName = context.getMethodName();
    const args = context.getArgs();
    const key = `${className}:${methodName}:${JSON.stringify(args)}`;

    const redisValue = await this.redisClient.get(key);
    if (redisValue) {
      const parsedValue = JSON.parse(redisValue);
      return parsedValue;
    }

    const result = await next.handle();

    await this.redisClient.setex(key, 3600, JSON.stringify(result));
    return result;
  }

  intercept(context: InterceptorContext, next: CallHandler) {
    const className = context.getClass().name;
    const methodName = context.getMethodName();
    const args = context.getArgs();
    const key = `${className}:${methodName}:${JSON.stringify(args)}`;
    const isAsync = context.isPromise();

    // Check memory cache first (available for both sync and async)
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key);
    }

    const handleResult = data => this.memoryCache.set(key, data);
    const result = isAsync ? this.interceptAsync(context, next) : next.handle();
    if (isAsync) return result.then(data => handleResult(data));
    else handleResult(result);

    return result;
  }
}

@Injectable()
class UserService {
  @UseInterceptors(SmartCacheInterceptor)
  getUserName(id: string): string {
    // Cache key will be: "UserService:getUserName:["123"]"
    return `User ${id}`;
  }

  @UseInterceptors(SmartCacheInterceptor)
  async findExpensiveData(id: string): Promise<any> {
    // Cache key will be: "UserService:findExpensiveData:["123"]"
    return await this.performExpensiveOperation(id);
  }

  @UseInterceptors(SmartCacheInterceptor)
  async getUserProfile(id: string, includeDetails: boolean): Promise<UserProfile> {
    // Cache key will be: "UserService:getUserProfile:["123",true]"
    return await this.database.findUserProfile(id, includeDetails);
  }
}
```

#### Validation Interceptor (Works on Services)

```ts
@Injectable()
class ValidationInterceptor implements Interceptor {
  intercept(context: InterceptorContext, next: CallHandler) {
    // Pre-execution validation
    console.log(`Validating call to ${context.getMethodName()}`);

    const result = next.handle();

    if (context.isPromise()) {
      return (result as Promise<any>).then(data => {
        this.validateResult(data);
        return data;
      });
    } else {
      this.validateResult(result);
      return result;
    }
  }

  private validateResult(data: any) {
    if (!data) {
      throw new Error('Invalid result: data is null or undefined');
    }
  }
}
```

## Lifecycle Hooks

Implement lifecycle interfaces to hook into application events:

```ts
@Injectable()
class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private connection: DatabaseConnection;

  async onModuleInit() {
    this.connection = await createConnection();
    console.log('Database connected');
  }

  async onModuleDestroy() {
    await this.connection.close();
    console.log('Database disconnected');
  }
}
```

Available lifecycle hooks:

- `OnModuleInit`: Called after module initialization
- `OnModuleDestroy`: Called before module destruction
- `OnApplicationReady`: Called when application is ready
- `OnApplicationStop`: Called when application is stopping

## Advanced Examples

### Creating a CLI Application

```ts
import { Module, Injectable, Controller, Route, ShadowFactory } from '@shadow-library/app';

@Injectable()
class CLIRouter extends Router {
  async register(controllers: ControllerRouteMetadata[]) {
    const args = process.argv.slice(2);
    const command = args[0];

    for (const controller of controllers) {
      for (const route of controller.routes) {
        if (route.metadata.command === command) {
          await route.handler.call(controller.instance, ...args.slice(1));
          return;
        }
      }
    }

    console.log('Command not found');
  }

  async start() {
    // CLI router doesn't need to start a server
  }

  async stop() {
    // CLI router doesn't need to stop anything
  }
}

@Controller()
class CLIController {
  @Route({ command: 'hello' })
  hello(name: string = 'World') {
    console.log(`Hello, ${name}!`);
  }

  @Route({ command: 'version' })
  version() {
    console.log('v1.0.0');
  }
}

@Module({
  controllers: [CLIController],
  providers: [CLIRouter],
})
class CLIModule {}

// Usage: node app.js hello John
// Output: Hello, John!
```

### WebSocket Server Example

```ts
@Injectable()
class WebSocketRouter extends Router {
  private wss: WebSocketServer;

  async register(controllers: ControllerRouteMetadata[]) {
    this.wss = new WebSocketServer({ port: 8080 });

    this.wss.on('connection', ws => {
      ws.on('message', async data => {
        const message = JSON.parse(data.toString());

        for (const controller of controllers) {
          for (const route of controller.routes) {
            if (route.metadata.event === message.event) {
              const result = await route.handler.call(controller.instance, message.data);
              ws.send(JSON.stringify({ event: message.event, data: result }));
              return;
            }
          }
        }
      });
    });
  }

  async start() {
    console.log('WebSocket server started on port 8080');
  }

  async stop() {
    this.wss?.close();
  }
}

@Controller()
class ChatController {
  @Route({ event: 'join-room' })
  joinRoom(data: { room: string; user: string }) {
    return { message: `${data.user} joined ${data.room}` };
  }

  @Route({ event: 'send-message' })
  sendMessage(data: { room: string; message: string; user: string }) {
    return {
      room: data.room,
      message: data.message,
      user: data.user,
      timestamp: new Date(),
    };
  }
}
```

## Testing

Shadow Application's dependency injection makes testing straightforward:

```ts
describe('UserService', () => {
  let userService: UserService;
  let app: ShadowApplication;

  beforeAll(async () => {
    @Module({
      providers: [UserService, { token: 'DATABASE_CONNECTION', useValue: mockDatabase }],
    })
    class TestModule {}

    app = await ShadowFactory.create(TestModule);
    userService = app.get(UserService);
  });

  afterAll(async () => {
    await app.stop();
  });

  it('should find all users', () => {
    const users = userService.findAll();
    expect(users).toBeDefined();
  });
});
```

## Comparison with NestJS

| Feature            | Shadow Application               | NestJS                        |
| ------------------ | -------------------------------- | ----------------------------- |
| **Platform**       | Platform-agnostic                | HTTP/Web focused              |
| **Router**         | Custom implementable             | Built-in Express/Fastify      |
| **Interceptors**   | Controller & Service methods     | Controller methods only       |
| **Flexibility**    | High - any application type      | Medium - web applications     |
| **Bundle Size**    | Lightweight                      | Heavier (includes HTTP stack) |
| **Learning Curve** | Moderate                         | Moderate to High              |
| **Use Cases**      | CLI, Desktop, Microservices, Web | Primarily web applications    |

## License

This package is licensed under the MIT License. See the `LICENSE` file for more information.

[lifecycle-events]: https://firebasestorage.googleapis.com/v0/b/shadow-apps-376620.appspot.com/o/docs%2Fshadow-apps-lifecycle-events.webp?alt=media
