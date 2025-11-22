# @shadow-library/common

The **@shadow-library/common** package provides a comprehensive collection of essential utilities, services, and error-handling mechanisms designed to streamline development across the Shadow Library ecosystem. This package is built with TypeScript and offers robust, reusable components for task management, API requests, caching, logging, configuration management, and more.

## Features

### 🏗️ **Task Management & Orchestration**

- **Task Class**: Robust task execution with retry logic, exponential backoff, and rollback capabilities
- **TaskManager**: Orchestrate multiple tasks with automatic rollback on failure
- **FlowManager**: Type-safe state machine for complex workflows with conditional transitions
- **Configurable retry strategies** with custom retry callbacks

### 🌐 **HTTP Client & API Management**

- **APIRequest**: Fluent API client with method chaining for HTTP requests
- **Built-in error handling** with customizable error suppression
- **Request/response logging** with configurable detail levels
- **Support for all HTTP methods** (GET, POST, PUT, PATCH, DELETE)
- **Child class creation** for reusable API configurations

### 🗄️ **Caching Solutions**

- **InMemoryStore**: Simple key-value store with array manipulation methods
- **LRUCache**: High-performance Least Recently Used cache with TypedArray optimization
- **Global store instance** for application-wide state management

### ⚙️ **Configuration Management**

- **Type-safe configuration** with environment variable validation
- **Built-in validation** for numbers, booleans, and allowed values
- **Array environment variables** with comma-separated value parsing
- **Custom transformers** and validators
- **Environment detection** (development, production, test)
- **Production-required configurations** with automatic validation

### 📝 **Advanced Logging System**

- **Multi-transport logging** (Console, File, CloudWatch)
- **Configurable log levels** and formats
- **Metadata injection** and structured logging
- **Dynamic context providers** for automatic metadata injection
- **Namespace support** to prevent context key conflicts
- **Sensitive data redaction** with fast-redact integration
- **Environment-specific transport configuration**

### 🚨 **Comprehensive Error Handling**

- **Structured error hierarchy** with error codes and types
- **ValidationError** with field-level error tracking
- **AppError** with interpolated error messages
- **Built-in error types** for common scenarios

### 🛠️ **Utility Functions**

- **String interpolation** with object path resolution
- **Data masking utilities** for emails, numbers, words, and flexible text masking
- **Object manipulation** (pick, omit, deep freeze, path access, plain object detection)
- **Temporal utilities** with time unit support
- **Reflection utilities** with metadata management
- **Functional programming helpers** (tryCatch, withThis, throwError)

### 🔍 **Metadata & Reflection**

- **Enhanced reflection capabilities** with metadata manipulation
- **Metadata cloning** and updating
- **Integration with reflect-metadata**

### 📱 **TypeScript Support**

- **Fully typed interfaces** and implementations
- **Generic type support** throughout the library
- **Enhanced IntelliSense** and type safety

---

## Installation

Install the package using your preferred package manager:

```bash
# npm
npm install @shadow-library/common

# Yarn
yarn add @shadow-library/common

# pnpm
pnpm add @shadow-library/common

# bun
bun add @shadow-library/common
```

---

## Usage

### 🏗️ **Task Management**

#### Creating and Executing Tasks

```ts
import { Task } from '@shadow-library/common';

// Simple task execution
const task = Task.create(() => performOperation())
  .name('Data Processing')
  .retry(3)
  .delay(1000)
  .backoff(2)
  .onRetry((error, attempt) => console.log(`Retry ${attempt}:`, error))
  .rollback(result => cleanupOperation(result));

const result = await task.execute();

// Execute rollback if needed
if (task.hasRollback()) {
  await task.executeRollback();
}
```

#### Custom Retry Logic

```ts
import { Task } from '@shadow-library/common';

// Only retry for specific error types
const networkTask = Task.create(() => makeNetworkRequest())
  .name('Network Operation')
  .retry(5)
  .shouldRetry((error, attempt) => {
    // Only retry for network errors, not for authentication errors
    return error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT';
  });

// Conditional retry based on attempt count and error type
const complexTask = Task.create(() => processData())
  .name('Complex Processing')
  .retry(3)
  .shouldRetry((error, attempt) => {
    // Retry transient errors for first 2 attempts only
    if (attempt <= 2 && error.type === 'TRANSIENT') return true;

    // Always retry rate limit errors
    if (error.code === 'RATE_LIMITED') return true;

    // Don't retry validation errors
    if (error.type === 'VALIDATION') return false;

    return false;
  });

// Async retry logic with external checks
const smartTask = Task.create(() => performOperation())
  .name('Smart Retry')
  .retry(3)
  .shouldRetry(async (error, attempt) => {
    // Check service health before retrying
    const isServiceHealthy = await checkServiceHealth();
    return isServiceHealthy && attempt <= 2;
  });
```

#### Task Orchestration with TaskManager

```ts
import { TaskManager } from '@shadow-library/common';

const orchestrator = TaskManager.create({
  name: 'Data Pipeline',
  rollbackOnError: true,
});

orchestrator
  .addTask(() => fetchData())
  .addTask(() => processData())
  .addTask(() => saveData());

try {
  const results = await orchestrator.execute();
  console.log('All tasks completed:', results);
} catch (error) {
  console.error('Pipeline failed, rollback completed:', error);
}
```

#### State Management with FlowManager

FlowManager provides a type-safe state machine for managing complex workflows with conditional transitions based on context. It's ideal for authentication flows, order processing, approval workflows, and any scenario requiring controlled state transitions.

```ts
import { FlowManager } from '@shadow-library/common';
import type { FlowDefinition } from '@shadow-library/common';

// Define authentication states and context
type AuthState = 'initial' | 'credentials' | 'mfa_required' | 'mfa_verify' | 'authenticated' | 'failed';

interface AuthContext {
  userId?: string;
  email: string;
  requiresMFA: boolean;
  mfaMethod?: '2fa' | 'sms' | 'email';
  loginAttempts: number;
  maxAttempts: number;
  sessionToken?: string;
}

// Define the authentication flow with conditional transitions
const authFlowDefinition: FlowDefinition<AuthState, AuthContext> = {
  name: 'AuthenticationFlow',
  startState: 'initial',
  states: {
    initial: {
      getNextStates: () => ['credentials'],
    },
    credentials: {
      // Transition based on user's MFA settings
      getNextStates: state => {
        if (state.context.requiresMFA) {
          return ['mfa_required', 'failed'];
        }
        return ['authenticated', 'failed'];
      },
    },
    mfa_required: {
      getNextStates: () => ['mfa_verify', 'failed'],
    },
    mfa_verify: {
      // Allow retry or final authentication
      getNextStates: state => {
        const canRetry = state.context.loginAttempts < state.context.maxAttempts;
        return canRetry ? ['authenticated', 'mfa_verify', 'failed'] : ['failed'];
      },
    },
    authenticated: {
      isFinal: true,
    },
    failed: {
      isFinal: true,
    },
  },
};

// Example: User with 2FA enabled
async function authenticateUser(email: string, password: string) {
  // Create flow with initial context
  const authFlow = FlowManager.create<AuthState, AuthContext>(authFlowDefinition, {
    email,
    requiresMFA: false, // Will be determined after credential check
    loginAttempts: 0,
    maxAttempts: 3,
  });

  // Step 1: Start authentication
  authFlow.transitionTo('credentials');

  // Verify credentials
  const user = await verifyCredentials(email, password);
  if (!user) {
    authFlow.transitionTo('failed');
    throw new Error('Invalid credentials');
  }

  // Update context with user info
  authFlow.updateContext({
    userId: user.id,
    requiresMFA: user.mfaEnabled,
    mfaMethod: user.mfaMethod,
  });

  // Step 2: Check if MFA is required
  if (authFlow.canTransitionTo('mfa_required')) {
    authFlow.transitionTo('mfa_required');
    console.log(`MFA required via ${user.mfaMethod}`);

    // Send MFA code
    await sendMFACode(user.id, user.mfaMethod);
    authFlow.transitionTo('mfa_verify');

    // Step 3: Verify MFA (with retry logic)
    let mfaVerified = false;
    while (authFlow.canTransitionTo('mfa_verify') && !mfaVerified) {
      const code = await promptForMFACode();
      mfaVerified = await verifyMFACode(user.id, code);

      if (mfaVerified) {
        const sessionToken = await createSession(user.id);
        authFlow.transitionTo('authenticated', { sessionToken });
      } else {
        authFlow.updateContext({
          loginAttempts: authFlow.getContext().loginAttempts + 1,
        });

        if (authFlow.getContext().loginAttempts >= authFlow.getContext().maxAttempts) {
          authFlow.transitionTo('failed');
          throw new Error('Maximum MFA attempts exceeded');
        }

        // Stay in mfa_verify for retry
        console.log(`Invalid code. ${authFlow.getContext().maxAttempts - authFlow.getContext().loginAttempts} attempts remaining`);
      }
    }
  } else {
    // No MFA required - direct authentication
    const sessionToken = await createSession(user.id);
    authFlow.transitionTo('authenticated', { sessionToken });
  }

  // Check final status
  const status = authFlow.getStatus();
  console.log('Authentication flow completed:', {
    state: status.currentState,
    isComplete: status.isComplete,
    history: status.history,
  });

  if (status.currentState === 'authenticated') {
    return authFlow.getContext().sessionToken;
  }

  throw new Error('Authentication failed');
}

// Restore flow from snapshot (useful for long-running processes)
const snapshot = authFlow.toSnapshot();
// ... later or in different process
const restoredFlow = FlowManager.from<AuthState, AuthContext>(authFlowDefinition, snapshot);
restoredFlow.transitionTo('authenticated');
```

#### Centralized Flow Management with FlowRegistry

For applications with multiple flows, use `FlowRegistry` to manage flow definitions centrally and enable dynamic flow restoration. This is particularly useful for APIs that handle multiple flow types.

```ts
import { FlowRegistry, FlowDefinition } from '@shadow-library/common';

// Define your flows
const authFlowDefinition: FlowDefinition<AuthState, AuthContext> = {
  name: 'auth',
  startState: 'start',
  states: {
    start: { getNextStates: () => ['credentials-verified', 'failed'] },
    'credentials-verified': {
      getNextStates: state => (state.context.requiresMFA ? ['mfa-pending'] : ['authenticated']),
    },
    'mfa-pending': { getNextStates: () => ['mfa-verified', 'failed'] },
    'mfa-verified': { getNextStates: () => ['authenticated'] },
    authenticated: { isFinal: true },
    failed: { isFinal: true },
  },
};

const approvalFlowDefinition: FlowDefinition<ApprovalState, ApprovalContext> = {
  name: 'approval',
  startState: 'pending',
  states: {
    pending: { getNextStates: () => ['approved', 'rejected'] },
    approved: { isFinal: true },
    rejected: { isFinal: true },
  },
};

// 1. Bootstrap - Register all flows at application startup
const flowRegistry = new FlowRegistry();
flowRegistry.registerAll([authFlowDefinition, approvalFlowDefinition]);

// 2. Create new flows by name
const authFlow = flowRegistry.create<AuthState, AuthContext>('auth', {
  userId: 'user123',
  requiresMFA: true,
});

// 3. Save flow state to Redis/database
const flowId = crypto.randomUUID();
await redis.set(flowId, authFlow.toSnapshot(), 'EX', 300);

// 4. Restore flow from snapshot - automatically resolves flow definition
async function verifyEndpoint(flowId: string, code: string) {
  const snapshot = await redis.get(flowId);
  if (!snapshot) throw new Error('Flow not found');

  // Registry automatically resolves the correct flow definition
  const flow = flowRegistry.restore<AuthState, AuthContext>(snapshot);

  if (flow.canTransitionTo('mfa-verified')) {
    flow.updateContext({ verificationCode: code }).transitionTo('mfa-verified');

    // Save updated state
    await redis.set(flowId, flow.toSnapshot(), 'EX', 300);
  }

  return flow.getStatus();
}

// 5. Use with dependency injection for clean architecture
class AuthService {
  constructor(
    private readonly flowRegistry: FlowRegistry,
    private readonly redis: RedisClient,
  ) {}

  async startAuth(userId: string, requiresMFA: boolean): Promise<string> {
    const flow = this.flowRegistry.create('auth', { userId, requiresMFA });
    const flowId = crypto.randomUUID();
    await this.redis.set(flowId, flow.toSnapshot(), 'EX', 300);
    return flowId;
  }

  async verify(flowId: string, code: string): Promise<void> {
    const snapshot = await this.redis.get(flowId);
    const flow = this.flowRegistry.restore(snapshot);

    // Continue flow execution...
    if (flow.canTransitionTo('mfa-verified')) {
      flow.transitionTo('mfa-verified', { verificationCode: code });
      await this.redis.set(flowId, flow.toSnapshot(), 'EX', 300);
    }
  }
}

// 6. Extract flow type without full parsing (for routing/logging)
const flowName = flowRegistry.getFlowName(snapshot); // Uses regex, no JSON parse
console.log(`Processing ${flowName} flow`);
```

### 🌐 **HTTP Client & API Requests**

#### Fluent API Client

```ts
import { APIRequest } from '@shadow-library/common';

// Simple GET request
const response = await APIRequest.get('/users').header('Authorization', 'Bearer token').query('page', '1').query('limit', '10');

// POST request with complex body
const user = await APIRequest.post('/users')
  .header('Content-Type', 'application/json')
  .field('profile.name', 'John Doe')
  .field('profile.email', 'john@example.com')
  .field('settings.theme', 'dark')
  .body({ active: true });

// Create reusable API client
const UserAPI = APIRequest.get('/api/users').child();
UserAPI.setOptions({
  headers: { Authorization: 'Bearer token' },
  throwErrorOnFailure: false,
});

const userClient = new UserAPI();
```

#### Error Handling

```ts
// Suppress errors for custom handling
const response = await APIRequest.get('/might-fail').suppressErrors().execute();

if (response.statusCode >= 400) {
  console.log('Request failed:', response.data);
}

// Handle APIError
try {
  await APIRequest.post('/data').body({ invalid: 'data' });
} catch (error) {
  if (error instanceof APIError) {
    console.log('Status:', error.statusCode);
    console.log('Response:', error.data);
  }
}
```

### 🗄️ **Caching**

#### In-Memory Store

```ts
import { InMemoryStore, GlobalStore } from '@shadow-library/common';

const cache = new InMemoryStore();

// Basic operations
cache.set('user:1', { name: 'John', age: 30 });
const user = cache.get<User>('user:1');

// Array operations
cache.insert('tags', 'typescript');
cache.insert('tags', 'nodejs');
cache.remove('tags', 'typescript');

// Numeric operations
cache.inc('counter', 1); // Increment counter
cache.inc('score', -5); // Decrement score

// Using global store
GlobalStore.set('app:config', { theme: 'dark' });
```

#### LRU Cache

```ts
import { LRUCache } from '@shadow-library/common';

// Basic usage
const cache = new LRUCache(100); // Capacity of 100 items

// Usage with TTL (Time To Live)
const ttlCache = new LRUCache(100, { ttl: 5000 }); // Items expire after 5 seconds

cache.set('key1', 'value1');
cache.set('key2', 'value2');

// Check existence without affecting order
// Returns false if item exists but has expired
const exists = cache.has('key1');
const value = cache.peek('key1'); // Doesn't update access time

// Get with LRU update
// Returns undefined if item has expired
const recentValue = cache.get('key1'); // Moves to top

// Remove specific item
const removed = cache.remove('key2');

// Clear all items
cache.clear();
```

### ⚙️ **Configuration Management**

#### Type-Safe Configuration

```ts
import { Config, ConfigService } from '@shadow-library/common';

// Using global config
const appName = Config.get('app.name');
const logLevel = Config.get('log.level');
const isDev = Config.isDev();
const isProd = Config.isProd();

// Create custom configuration
interface CustomConfig extends ConfigRecords {
  'api.baseUrl': string;
  'api.timeout': number;
  'feature.enabled': boolean;
}

class MyConfigService extends ConfigService<CustomConfig> {
  constructor() {
    super();
    this.load('api.baseUrl', {
      defaultValue: 'http://localhost:3000',
      isProdRequired: true,
    });
    this.load('api.timeout', {
      defaultValue: '5000',
      validateType: 'number',
    });
    this.load('feature.enabled', {
      defaultValue: 'false',
      validateType: 'boolean',
    });
    this.load('features.enabled', {
      defaultValue: '',
      isArray: true,
    });
  }
}

const myConfig = new MyConfigService();
const apiUrl = myConfig.get('api.baseUrl');
const timeout = myConfig.getOrThrow('api.timeout'); // Throws if undefined
```

#### Dynamic Configuration Loading

The `load()` method is exposed to allow developers to dynamically load environment variables into the singleton ConfigService instance. This ensures all configuration is managed in one place without creating multiple instances.

```ts
import { Config } from '@shadow-library/common';

// Load custom configurations into the global singleton
Config.load('custom.api.url', {
  envKey: 'API_URL',
  defaultValue: 'https://api.example.com',
});

Config.load('custom.port', {
  envKey: 'PORT',
  validateType: 'number',
  defaultValue: '3000',
});

Config.load('custom.features', {
  envKey: 'ENABLED_FEATURES',
  isArray: true,
  defaultValue: 'feature1,feature2',
});

Config.load('custom.debug.enabled', {
  envKey: 'DEBUG_ENABLED',
  validateType: 'boolean',
  defaultValue: 'false',
});

// Access the loaded configurations
const apiUrl = Config.get('custom.api.url');
const port = Config.get('custom.port');
const features = Config.get('custom.features'); // Array of strings
const debugEnabled = Config.get('custom.debug.enabled'); // Boolean

// Use validation and required values for production
Config.load('database.url', {
  envKey: 'DATABASE_URL',
  isProdRequired: true, // Will exit if not set in production
  validator: value => value.startsWith('postgresql://'), // Custom validation
});
```

**Configuration Options:**

- `envKey`: Environment variable name (auto-generated from config key if not provided)
- `defaultValue`: Default value if environment variable is not set
- `isProdRequired`: Require the value in production environment
- `validateType`: Built-in validation for `'number'` or `'boolean'` types
- `validator`: Custom validation function
- `isArray`: Parse comma-separated values as an array
- `allowedValues`: Restrict to specific allowed values
- `transform`: Custom transformation function for the value

### 📝 **Logging**

#### Advanced Logging System

```ts
import { Logger } from '@shadow-library/common';

// Get logger instance
const logger = Logger.getLogger('MyApp', 'UserService');

// Log at different levels
logger.info('User created successfully', { userId: 123 });
logger.warn('User email not verified', { userId: 123 });
logger.error('Failed to create user', { error: 'Validation failed' });
logger.debug('Processing user data', { step: 'validation' });

// Configure logger
Logger.setDefaultMetadata({ service: 'user-api', version: '1.0.0' });
Logger.setLogMetadataProvider(() => ({
  requestId: getCurrentRequestId(),
  timestamp: Date.now(),
}));

// Add sensitive data redaction
const redactor = Logger.getRedactor(['password', 'ssn', 'creditCard']);
const safeData = redactor({ user: 'john', password: 'secret123' });

// Add custom transport
Logger.addTransport(customTransport);

// Attach predefined transport types
Logger.attachTransport('console:pretty'); // Console with colors and brief format
Logger.attachTransport('file:json'); // File logging with JSON format
Logger.attachTransport('cloudwatch:json'); // CloudWatch logging

// Attach transport with custom format
import { format } from 'winston';
Logger.attachTransport('console:pretty', format.simple());

// Chain multiple transports
Logger.attachTransport('console:pretty').attachTransport('file:json');
```

#### Dynamic Context Providers

Add context providers that automatically inject metadata into every log. This is especially useful for packages that want to add contextual information (like request IDs, trace IDs) without requiring manual setup by end users.

```ts
import { Logger } from '@shadow-library/common';
import { AsyncLocalStorage } from 'node:async_hooks';

// For packages: Add namespaced context to avoid conflicts
Logger.addContextProvider('http', () => ({
  requestId: getCurrentRequestId(),
  method: getCurrentMethod(),
  url: getCurrentUrl(),
}));

Logger.addContextProvider('db', () => ({
  transactionId: getCurrentTransactionId(),
  queryCount: getQueryCount(),
}));

// Example with AsyncLocalStorage for request-scoped context
const requestContext = new AsyncLocalStorage();

Logger.addContextProvider('request', () => {
  const context = requestContext.getStore();
  return context || {};
});

// In your HTTP framework (e.g., Fastify, Express)
app.use((req, res, next) => {
  requestContext.run({ requestId: req.id, method: req.method }, next);
});

// All logs automatically include the context:
logger.info('Processing request');
// Output:
// {
//   message: 'Processing request',
//   http: { requestId: 'req-456', method: 'GET', url: '/api/users' },
//   db: { transactionId: 'tx-789', queryCount: 3 },
//   request: { requestId: 'req-456', method: 'GET' }
// }

// Clear all context providers if needed
Logger.clearContextProviders();
```

### 🚨 **Error Handling**

#### Structured Error Management

```ts
import { AppError, ValidationError, ErrorCode, ErrorType } from '@shadow-library/common';

// Custom error codes
class UserErrorCode extends ErrorCode {
  static readonly USER_NOT_FOUND = new ErrorCode('USER_NOT_FOUND', ErrorType.NOT_FOUND, 'User with ID {userId} not found');
}

// Create structured errors
const error = new AppError(UserErrorCode.USER_NOT_FOUND, { userId: 123 });
console.log(error.getCode()); // 'USER_NOT_FOUND'
console.log(error.getType()); // 'NOT_FOUND'
console.log(error.getMessage()); // 'User with ID 123 not found'

// Validation errors
const validation = new ValidationError().addFieldError('email', 'Invalid email format').addFieldError('password', 'Password too short');

// Combine multiple validation errors
const combined = ValidationError.combineErrors(validation1, validation2);
console.log(combined.getSummary()); // 'Validation failed for email and password'
```

### 🛠️ **Utility Functions**

#### String Utilities

```ts
import { utils } from '@shadow-library/common';

// String interpolation with object paths
const template = 'Hello {user.name}, your score is {stats.score}';
const data = {
  user: { name: 'John' },
  stats: { score: 100 },
};
const result = utils.string.interpolate(template, data);
// Result: 'Hello John, your score is 100'

// Escape interpolation
const escaped = utils.string.interpolate('Price: \\{notInterpolated}', {});
// Result: 'Price: {notInterpolated}'

// Email masking
const maskedEmail = utils.string.maskEmail('user@example.com');
// Result: 'u**r@e******.com'

// Number masking with configurable keep values
const maskedNumber = utils.string.maskNumber('1234567890', 2, 2);
const maskedNumber = utils.string.maskNumber(1234567890, 2, 2);
// Result: '12****7890'

const maskedCard = utils.string.maskNumber('1234 5678 9012 3456', 4, 4);
// Result: '1234 **** **** 3456'

// Word masking (preserves first and last character of each word)
const maskedWords = utils.string.maskWords('hello world');
// Result: 'h***o w***d'

// Advanced masking with customizable options
const maskedText = utils.string.mask('sensitive-data@domain.com', {
  keepStart: 2,
  keepEnd: 4,
  maskChar: 'X',
  preserveSeparators: ['@', '.', '-'],
});
// Result: 'seXXXXXXX-XXXX@XXXXXX.com'

// Flexible masking with minimum mask requirements
const masked = utils.string.mask('abc', {
  keepStart: 1,
  keepEnd: 1,
  minMask: 3,
  preserveSpaces: true,
});
// Result: '***' (ensures minimum masking by decreasing the keep start and end)
```

#### Object Utilities

```ts
import { utils } from '@shadow-library/common';

const user = {
  profile: { name: 'John', email: 'john@example.com' },
  settings: { theme: 'dark', notifications: true },
};

// Get nested values
const name = utils.object.getByPath(user, 'profile.name'); // 'John'
const theme = utils.object.getByPath(user, 'settings.theme'); // 'dark'

// Pick specific keys
const profile = utils.object.pickKeys(user, ['profile']);
// Result: { profile: { name: 'John', email: 'john@example.com' } }

// Omit keys
const withoutSettings = utils.object.omitKeys(user, ['settings']);
// Result: { profile: { name: 'John', email: 'john@example.com' } }

// Check if object is a plain object
const isPlain1 = utils.object.isPlainObject({}); // true
const isPlain2 = utils.object.isPlainObject({ name: 'John' }); // true
const isPlain3 = utils.object.isPlainObject(new Date()); // false
const isPlain4 = utils.object.isPlainObject([]); // false
const isPlain5 = utils.object.isPlainObject(null); // false

// Deep freeze objects
const frozen = utils.object.deepFreeze(user);

// Get all property names and descriptors
const properties = utils.object.getAllPropertyNames(user);
const descriptors = utils.object.getAllPropertyDescriptors(user);
```

#### Temporal Utilities

```ts
import { utils } from '@shadow-library/common';

// Sleep with different time units
await utils.temporal.sleep(500); // 500 milliseconds
await utils.temporal.sleep(2, 's'); // 2 seconds
await utils.temporal.sleep(5, 'm'); // 5 minutes
await utils.temporal.sleep(1, 'h'); // 1 hour
```

#### Functional Programming Helpers

```ts
import { tryCatch, withThis, throwError } from '@shadow-library/common';

// Safe function execution
const result = tryCatch(() => riskyOperation());
if (result.success) {
  console.log('Success:', result.data);
} else {
  console.error('Error:', result.error);
}

// Async version
const asyncResult = await tryCatch(async () => await asyncOperation());

// Context binding helper
class Calculator {
  multiplier = 10;

  multiply = withThis((context: Calculator, value: number) => value * context.multiplier);
}

const calc = new Calculator();
const result = calc.multiply(5); // 50

// Explicit error throwing
const value = someCondition ? 'valid' : throwError(new Error('Invalid'));
```

### 🔍 **Metadata & Reflection**

#### Enhanced Reflection

```ts
import { Reflector } from '@shadow-library/common';

// Define metadata
Reflector.defineMetadata('roles', ['admin', 'user'], UserController);
Reflector.defineMetadata('permissions', 'read', UserController, 'getUser');

// Append/prepend to existing metadata
Reflector.appendMetadata('roles', 'guest', UserController);
Reflector.prependMetadata('roles', 'super-admin', UserController);

// Update object metadata
Reflector.updateMetadata('config', { timeout: 5000 }, UserController);

// Clone metadata between objects
Reflector.cloneMetadata(NewController, UserController);

// Check and retrieve metadata
const hasRoles = Reflector.hasMetadata('roles', UserController);
const roles = Reflector.getMetadata('roles', UserController);
```

### 🔧 **Advanced Features**

#### Validation Utilities

```ts
import { utils } from '@shadow-library/common';

// Universal validation
console.log(utils.isValid('hello')); // true
console.log(utils.isValid('')); // false
console.log(utils.isValid(null)); // false
console.log(utils.isValid(undefined)); // false
console.log(utils.isValid(0)); // true
console.log(utils.isValid(NaN)); // false
```

---

## Environment Variables

The package uses environment variables for configuration. Below are the key variables:

### Application Configuration

- `NODE_ENV`: Application environment (`development`, `production`, `test`)
- `APP_NAME`: Application name (default: `shadow-app`)

### Logging Configuration

- `LOG_LEVEL`: Logging level (`silly`, `debug`, `http`, `info`, `warn`, `error`)
- `LOG_DIR`: Log directory path (default: `logs`, set to `false` to disable file logging)
- `LOG_BUFFER_SIZE`: Log buffer size for batch processing (default: `10000`)

### AWS CloudWatch Configuration

- `AWS_REGION`: AWS region for CloudWatch logs (default: `ap-south-1`)
- `AWS_CLOUDWATCH_LOG_GROUP`: CloudWatch log group name (default: app name)
- `AWS_CLOUDWATCH_LOG_STREAM`: CloudWatch log stream name (default: app name)
- `AWS_CLOUDWATCH_UPLOAD_RATE`: CloudWatch upload rate in ms (default: `2000`)

---

## API Reference

### Core Classes

#### Task

- `Task.create(fn)` - Create a new task
- `.name(string)` - Set task name
- `.retry(number)` - Set retry count
- `.delay(number)` - Set delay between retries in ms
- `.backoff(number)` - Set exponential backoff factor
- `.onRetry(callback)` - Set retry callback
- `.shouldRetry(fn)` - Set custom retry condition function
- `.rollback(fn)` - Set rollback function
- `.execute()` - Execute the task
- `.executeRollback()` - Execute rollback

#### TaskManager

- `TaskManager.create(options)` - Create task orchestrator
- `.addTask(task|fn)` - Add task to execution queue
- `.getResult(task)` - Get result of specific task
- `.execute()` - Execute all tasks

#### FlowManager

- `FlowManager.create(definition, context?)` - Create new flow with initial state
- `FlowManager.from(definition, snapshot)` - Restore flow from snapshot with explicit definition
- `FlowManager.from(definition, state)` - Create flow from definition and state object
- `.toSnapshot()` - Serialize flow to JSON string (includes flowName for registry resolution)
- `.getCurrentState()` - Get current state name
- `.getDefinition()` - Get flow definition
- `.getHistory()` - Get state transition history
- `.getContext()` - Get flow context
- `.updateContext(updates)` - Update context (chainable)
- `.getAvailableTransitions()` - Get valid next states
- `.canTransitionTo(state)` - Check if transition is valid
- `.transitionTo(state, contextUpdates?)` - Transition to new state (chainable)
- `.isComplete()` - Check if flow is in final state
- `.getStatus()` - Get complete flow status

#### FlowRegistry

- `new FlowRegistry()` - Create flow registry instance
- `.register(definition)` - Register a flow definition (chainable)
- `.registerAll(definitions[])` - Register multiple flow definitions (chainable)
- `.unregister(flowName)` - Remove a flow definition
- `.clear()` - Remove all flow definitions
- `.has(flowName)` - Check if flow is registered
- `.get(flowName)` - Get registered flow definition
- `.getRegisteredFlows()` - Get array of registered flow names
- `.create(flowName, context?)` - Create new flow instance by name
- `.restore(snapshot)` - Restore flow from snapshot (auto-resolves definition)
- `.getFlowName(snapshot)` - Extract flow name from snapshot without parsing JSON

#### APIRequest

- `APIRequest.get(url)` - Create GET request
- `APIRequest.post(url)` - Create POST request
- `APIRequest.put(url)` - Create PUT request
- `APIRequest.patch(url)` - Create PATCH request
- `APIRequest.delete(url)` - Create DELETE request
- `.header(key, value)` - Add header
- `.query(key, value)` - Add query parameter
- `.field(path, value)` - Add nested field to body
- `.body(object)` - Set request body
- `.suppressErrors()` - Disable automatic error throwing
- `.child()` - Create reusable child class
- `.execute()` - Execute request

#### LRUCache

- `new LRUCache(capacity, options?)` - Create cache with capacity and optional TTL
- `.set(key, value)` - Store value (resets TTL if enabled)
- `.get(key)` - Retrieve and mark as recently used (returns undefined if expired)
- `.peek(key)` - Retrieve without updating access (returns undefined if expired)
- `.has(key)` - Check if key exists (returns false if expired)
- `.remove(key)` - Remove specific key
- `.clear()` - Clear all items

#### InMemoryStore

- `new InMemoryStore()` - Create store
- `.set(key, value)` - Store value
- `.get(key, defaultValue?)` - Retrieve value
- `.del(key)` - Delete key
- `.insert(key, value)` - Add to array
- `.remove(key, value)` - Remove from array
- `.inc(key, amount)` - Increment numeric value

### Error Classes

#### AppError

- `new AppError(errorCode, data?)` - Create structured error
- `.getCode()` - Get error code
- `.getType()` - Get error type
- `.getMessage()` - Get formatted message
- `.getData()` - Get error data
- `.setCause(error)` - Set underlying cause
- `.toObject()` - Convert to plain object

#### ValidationError

- `new ValidationError(field?, message?)` - Create validation error
- `.addFieldError(field, message)` - Add field error
- `.getErrors()` - Get all field errors
- `.getErrorCount()` - Get error count
- `.getSummary()` - Get human-readable summary
- `ValidationError.combineErrors(...errors)` - Combine multiple errors

### Services

#### ConfigService

- `Config.get(key)` - Get configuration value
- `Config.getOrThrow(key)` - Get value or throw
- `Config.load(key, options)` - Load configuration from environment variables
- `Config.isDev()` - Check if development environment
- `Config.isProd()` - Check if production environment
- `Config.isTest()` - Check if test environment

#### Logger

- `Logger.getLogger(namespace, label?)` - Get logger instance
- `Logger.setDefaultMetadata(metadata)` - Set default metadata
- `Logger.getRedactor(paths, censor?)` - Create data redactor
- `Logger.addTransport(transport)` - Add log transport
- `Logger.attachTransport(type, format?)` - Attach predefined transport type with optional custom format
- `Logger.isDebugEnabled()` - Check if debug logging enabled

#### Reflector

- `Reflector.defineMetadata(key, value, target, property?)` - Define metadata
- `Reflector.getMetadata(key, target, property?)` - Get metadata
- `Reflector.appendMetadata(key, value, target, property?)` - Append to metadata
- `Reflector.updateMetadata(key, value, target, property?)` - Update metadata
- `Reflector.cloneMetadata(target, source, property?)` - Clone metadata

### Utility Functions

#### String Utils

- `utils.string.interpolate(template, data)` - Interpolate string with object
- `utils.string.maskEmail(email)` - Mask email address preserving structure
- `utils.string.maskNumber(number, keepStart?, keepEnd?)` - Mask number preserving start/end digits
- `utils.string.maskWords(input)` - Mask words preserving first/last characters
- `utils.string.mask(input, options?)` - Flexible masking with customizable options
  - `options.maskChar` - Character to use for masking (default: '\*')
  - `options.keepStart` - Characters to keep at start (default: 1)
  - `options.keepEnd` - Characters to keep at end (default: 1)
  - `options.preserveSpaces` - Preserve spaces (default: true)
  - `options.preserveSeparators` - Preserve separators (default: false)
  - `options.minMask` - Minimum characters to mask (default: 0)

#### Object Utils

- `utils.object.getByPath(obj, path)` - Get nested value by path
- `utils.object.pickKeys(obj, keys)` - Pick specific keys
- `utils.object.omitKeys(obj, keys)` - Omit specific keys
- `utils.object.deepFreeze(obj)` - Recursively freeze object
- `utils.object.isPlainObject(obj)` - Check if object is a plain object
- `utils.object.getAllPropertyNames(target, filter?)` - Get all property names including inherited
- `utils.object.getAllPropertyDescriptors(target, filter?)` - Get all property descriptors including inherited

#### Temporal Utils

- `utils.temporal.sleep(duration, unit?)` - Sleep for specified duration

#### General Utils

- `utils.isValid(value)` - Check if value is valid (not null/undefined/empty)

### Shorthand Functions

- `throwError(error)` - Explicitly throw error
- `tryCatch(fn)` - Safe function execution with result object
- `withThis(fn)` - Create function with explicit context binding

---

## Types & Interfaces

### Configuration Types

```ts
type NodeEnv = 'development' | 'production' | 'test';
type LogLevel = 'silly' | 'debug' | 'http' | 'info' | 'warn' | 'error';
type TimeUnit = 'ms' | 's' | 'm' | 'h';
type AttachableTransports = 'pretty-console' | 'structured-file' | 'structured-cloudwatch';
```

### Masking Types

```ts
interface MaskOptions {
  /** Character to use for masking. Default: '*' */
  maskChar?: string;

  /** How many characters to keep at the start and end (of the whole string). */
  keepStart?: number; // Default: 1
  keepEnd?: number; // Default: 1

  /** Preserve spaces literally? Default: true */
  preserveSpaces?: boolean;

  /**
   * Preserve "separators" (non-alphanumeric punctuation like .-_/() etc)?
   * - true  → preserve all non-alphanumeric chars (except space, which is controlled by preserveSpaces)
   * - false → do not preserve (mask like normal)
   * - RegExp | string[] → only preserve matches of the regex or chars in the list
   * Default: false
   */
  preserveSeparators?: boolean | RegExp | string[];

  /** Ensure at least this many masked chars (helps with very short strings). Default: 0 */
  minMask?: number;
}
```

### Result Types

```ts
type TryResult<TError, TResult> = { success: true; data: TResult } | { success: false; error: TError };

interface APIResponse<T = any> {
  statusCode: number;
  headers: Record<string, string>;
  data: T | null;
}
```

### Function Types

```ts
type Fn<T = any, U = any> = (...args: U[]) => Promisable<T>;
type RetryCallback = (error: unknown, attempt: number) => Promisable<unknown>;
type RollbackFn<T> = (data: T) => Promisable<unknown>;
type ShouldRetryFn = (error: unknown, attempt: number) => Promisable<boolean>;
```

---

## Examples

### Building a Robust Data Pipeline

```ts
import { TaskManager, Task, Logger, Config } from '@shadow-library/common';

const logger = Logger.getLogger('DataPipeline');

// Create tasks with retry and rollback
const extractTask = Task.create(async () => {
  const data = await fetchFromAPI();
  return data;
})
  .name('Extract Data')
  .retry(3)
  .delay(1000)
  .rollback(async data => {
    await cleanupExtractedData(data.id);
  });

const transformTask = Task.create(async () => {
  const rawData = taskManager.getResult(extractTask);
  return await transformData(rawData);
})
  .name('Transform Data')
  .retry(2);

// Orchestrate pipeline
const taskManager = TaskManager.create({
  name: 'ETL Pipeline',
  rollbackOnError: true,
});

taskManager
  .addTask(extractTask)
  .addTask(transformTask)
  .addTask(() => saveToDatabase());

try {
  await taskManager.execute();
  logger.info('Pipeline completed successfully');
} catch (error) {
  logger.error('Pipeline failed, rollback completed', error);
}
```

### Creating a Resilient API Client

```ts
import { APIRequest, tryCatch, Logger } from '@shadow-library/common';

// Create base API client
const BaseAPI = APIRequest.get('https://api.example.com').child();
BaseAPI.setOptions({
  headers: {
    Authorization: `Bearer ${Config.get('api.token')}`,
    'User-Agent': `${Config.get('app.name')}/1.0.0`,
  },
  throwErrorOnFailure: false,
});

class UserService {
  private api = new BaseAPI();
  private logger = Logger.getLogger('UserService');

  async getUser(id: string) {
    const result = await tryCatch(async () => {
      const response = await this.api.get(`/users/${id}`).query('include', 'profile,settings');

      if (response.statusCode === 404) {
        throw new AppError(UserErrorCode.USER_NOT_FOUND, { userId: id });
      }

      return response.data;
    });

    if (result.success) {
      this.logger.info('User retrieved successfully', { userId: id });
      return result.data;
    } else {
      this.logger.error('Failed to retrieve user', result.error);
      throw result.error;
    }
  }
}
```

### Advanced Caching Strategy

```ts
import { LRUCache, InMemoryStore, utils } from '@shadow-library/common';

class CacheManager {
  private l1Cache = new LRUCache(1000); // Fast L1 cache
  private l2Cache = new InMemoryStore(); // Larger L2 cache
  private stats = new InMemoryStore();

  async get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    // Try L1 cache first
    let value = this.l1Cache.get<T>(key);
    if (value) {
      this.stats.inc('l1_hits', 1);
      return value;
    }

    // Try L2 cache
    value = this.l2Cache.get<T>(key);
    if (value) {
      this.l1Cache.set(key, value); // Promote to L1
      this.stats.inc('l2_hits', 1);
      return value;
    }

    // Fetch and cache
    value = await fetcher();
    this.l1Cache.set(key, value);
    this.l2Cache.set(key, value);
    this.stats.inc('misses', 1);

    return value;
  }

  getStats() {
    return {
      l1Hits: this.stats.get('l1_hits', 0),
      l2Hits: this.stats.get('l2_hits', 0),
      misses: this.stats.get('misses', 0),
    };
  }
}
```

---

## Best Practices

### Error Handling

- Use `AppError` with custom error codes for business logic errors
- Use `ValidationError` for input validation with field-level details
- Implement proper error logging with context information
- Use `tryCatch` for safe execution of risky operations

### Task Management

- Set meaningful task names for better debugging
- Implement rollback functions for operations with side effects
- Use exponential backoff for transient failures
- Log retry attempts for monitoring

### Configuration

- Define type-safe configuration interfaces
- Use validation for critical configuration values
- Set appropriate defaults for development
- Mark production-required configurations
- Use array configuration for lists (comma-separated in env vars)
- Validate array elements individually with custom validators
- Apply transformations consistently across array items

### Logging

- Use structured logging with consistent metadata
- Implement log redaction for sensitive data
- Configure appropriate log levels per environment
- Use contextual loggers with namespace and labels

### Caching

- Choose appropriate cache types based on use case
- Implement cache invalidation strategies
- Monitor cache hit rates and performance
- Use global store sparingly for application state

---

## Performance Considerations

### LRU Cache Optimization

- Uses TypedArray for memory efficiency
- Automatically selects optimal array type based on capacity
- O(1) operations for get, set, and remove
- Supports up to 4.2 billion items

### Task Execution

- Implements efficient retry mechanisms with configurable delays
- Rollback operations are atomic and fast
- Task orchestration with automatic cleanup

### API Client

- Request/response logging with performance metrics
- Connection reuse through undici integration
- Configurable error handling and timeouts

### Memory Management

- Global singletons for configuration and store
- Efficient object manipulation utilities
- Metadata caching with reflection optimization

---

## Contributing

We welcome contributions! Please refer to the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines.

---

## License

This package is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.
