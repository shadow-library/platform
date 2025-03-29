# Shadow Common Services

The **Shadow Common Services** package provides a collection of essential utilities, services, and error-handling mechanisms designed to streamline development across the Shadow Apps ecosystem. This package is built with TypeScript and offers robust, reusable components for caching, logging, configuration management, and more.

## Features

- **Caching Services**: Includes in-memory and LRU caching solutions for efficient data storage and retrieval.
- **Configuration Management**: Simplifies environment-specific settings and secrets management.
- **Logging Services**: Provides a flexible logging system with support for console, file, and CloudWatch transports.
- **Utility Functions**: Offers reusable utilities for string manipulation, object operations, and validation.
- **Error Handling**: Predefined error classes for common scenarios like validation errors, internal errors, and application-specific errors.
- **TypeScript Support**: Fully typed interfaces and implementations for enhanced type safety and IntelliSense.

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
```

---

## Usage

### 1. **Configuration Management**

The `ConfigService` allows you to manage environment-specific settings and secrets.

```ts
import { Config } from '@shadow-library/common';

const appName = Config.get('app.name'); // Retrieve application name
const logLevel = Config.get('log.level'); // Retrieve log level
```

### 2. **Caching**

#### In-Memory Store

Use the `InMemoryStore` for simple key-value storage.

```ts
import { InMemoryStore } from '@shadow-library/common';

const cache = new InMemoryStore();
cache.set('key', 'value');
console.log(cache.get('key')); // Output: 'value'
```

#### LRU Cache

Use the `LRUCache` for least-recently-used caching.

```ts
import { LRUCache } from '@shadow-library/common';

const cache = new LRUCache(3); // Capacity of 3
cache.set('key1', 'value1');
cache.set('key2', 'value2');
console.log(cache.get('key1')); // Output: 'value1'
```

### 3. **Logging**

The `Logger` service provides a flexible logging system.

```ts
import { Logger } from '@shadow-library/common';

const logger = Logger.getLogger('App');
logger.info('Application started');
logger.error('An error occurred');
```

### 4. **Error Handling**

Use predefined error classes for consistent error handling.

```ts
import { ValidationError } from '@shadow-library/common';

const error = new ValidationError('field', 'Invalid value');
throw error;
```

### 5. **Utility Functions**

#### String Utilities

Perform string interpolation.

```ts
import { utils } from '@shadow-library/common';

const result = utils.string.interpolate('Hello {name}', { name: 'World' });
console.log(result); // Output: 'Hello World'
```

#### Object Utilities

Manipulate objects with ease.

```ts
import { utils } from '@shadow-library/common';

const obj = { name: { first: 'John', last: 'Doe' } };
console.log(utils.object.getByPath(obj, 'name.first')); // Output: 'John'
```

---

## Environment Variables

The package uses environment variables for configuration. Below are some key variables:

- `NODE_ENV`: Application environment (`development`, `production`, `test`).
- `LOG_LEVEL`: Logging level (`silly`, `debug`, `http`, `info`, `warn`, `error`).
- `AWS_REGION`: AWS region for CloudWatch logs.
- `AWS_CLOUDWATCH_LOG_GROUP`: CloudWatch log group name.
- `AWS_CLOUDWATCH_LOG_STREAM`: CloudWatch log stream name.

---

# Shorthand Functions

The following shorthand utility functions are available in the library:

### `throwError(error: Error): never`

Throws the provided error. This is useful for explicitly throwing errors in a functional programming style.

**Example:**

```typescript
import { throwError } from './shorthands';

throwError(new Error('Something went wrong!'));
```

---

### `tryCatch<TError extends Error, TResult>(fn: () => TResult | Promise<TResult>): TryResult<TError, TResult> | Promise<TryResult<TError, TResult>>`

Executes a function and catches any errors, returning a result object indicating success or failure. This is useful for handling errors in a structured way.

**Example:**

```typescript
import { tryCatch } from './shorthands';

const result = tryCatch(() => {
  // Some synchronous or asynchronous operation
  return 'Success!';
});

if (result.success) {
  console.log('Data:', result.data);
} else {
  console.error('Error:', result.error);
}
```

---

### `withThis<T, A extends any[], R>(fn: (context: T, ...args: A) => R): (this: T, ...args: A) => R`

Creates a function that binds the `this` context to the provided function. This is useful for working with methods that rely on the `this` context.

**Example:**

```typescript
import { withThis } from './shorthands';

class Example {
  value = 42;

  logValue = withThis(function () {
    console.log(this.value);
  });
}

const example = new Example();
example.logValue(); // Logs: 42
```

---

## Contributing

We welcome contributions! Please refer to the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines.

---

## License

This package is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.
