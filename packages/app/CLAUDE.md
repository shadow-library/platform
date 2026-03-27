# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@shadow-library/app` is a platform-agnostic Node.js framework for building applications using SOLID principles. Unlike NestJS (which is tied to HTTP), this framework supports CLI tools, desktop apps, microservices, or any Node.js application. It provides dependency injection, interceptors, lifecycle hooks, and a module system.

## Commands

```bash
bun install                  # Install dependencies
bun run lint                 # Run Prettier + ESLint checks
bun run lint --fix           # Auto-fix lint issues
bun run type-check           # TypeScript type checking (tsc)
bun run build                # Build ESM and CJS to /dist
bun test                     # Run all tests (unit + integration)
bun test:unit                # Jest unit tests only (enforces 100% coverage)
bun test:integration         # Bun native integration tests
```

To run a single unit test file: `bun jest tests/path/to/file.spec.ts`
To run a single integration test: `bun test ./tests/integration/path/to/file.spec.ts`

**Pre-commit hook** runs: `bun lint && bun type-check && bun run test`

## Architecture

The framework entry point is `ShadowFactory.create(AppModule)` which bootstraps the DI container and module graph.

### Core flow

1. **ShadowFactory** (`src/shadow-factory.ts`) creates a **ShadowApplication** instance
2. **ShadowApplication** (`src/shadow-application.ts`) orchestrates module scanning, DI resolution, and lifecycle execution
3. The **Injector** (`src/injector/`) handles the DI container (~1000 LOC), including module registration, instance wrapping, provider resolution, and dependency graph analysis

### Key directories

- `src/decorators/` - `@Module`, `@Injectable`, `@Controller`, `@Route`, `@Inject`, `@Optional`, `@UseInterceptors`, `@SetMetadata`, `@EnableIf`, `applyDecorators`
- `src/injector/` - DI container: module registry, instance wrappers, module refs, and helpers for provider classification, dependency graphs, and error handling
- `src/classes/` - Router abstraction
- `src/interfaces/` - Core TypeScript interfaces (Interceptor, ModuleMetadata, Provider, DynamicModule, lifecycle interfaces)
- `src/utils/` - `forwardRef` (circular dependency resolution), `createContextId`
- `src/constants.ts` - Metadata keys (Reflect metadata symbols)

### DI system

- **Metadata-based** using `reflect-metadata` for constructor parameter type inference
- **Singleton** scope by default; **transient** via `@Injectable({ transient: true })`
- Four provider types: class, value (`useValue`), factory (`useFactory` with async support), alias (`useExisting`)
- Circular dependencies handled via `forwardRef()`
- Optional dependencies via `@Optional()` decorator

### Interceptors

Interceptors implement the `Interceptor` interface and work on both controller AND service methods (broader than NestJS which only supports controller-level). Applied via `@UseInterceptors()`.

### Lifecycle hooks

`OnModuleInit` -> `OnApplicationReady` -> `OnApplicationStop` -> `OnModuleDestroy`

## Code Conventions

### File structure pattern

Every TypeScript file follows this section comment pattern:

```typescript
/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
```

### Style rules

- **Prettier**: single quotes, trailing commas everywhere, 180 char width, no arrow parens
- **ESLint**: `no-console` is an error; `explicit-module-boundary-types` required; `no-explicit-any` is off; import order enforced (builtin > external > internal > parent/sibling, alphabetized); Node built-ins must use `node:` protocol prefix
- **Test files** (`tests/**/*.spec.ts`) have relaxed rules (no-extraneous-class, no-empty-function, no-non-null-assertion, no-unused-vars all off)
- **TypeScript**: strict mode, experimental decorators enabled, path alias `@lib/*` maps to `src/*`

### Commit messages

Format: `<type>(<scope>): <subject>` (max 100 chars, imperative present tense, no capitalization, no trailing period). Types: feat, fix, refactor, test, docs, style, chore, ci, perf, build. Validated by commitlint.

## Testing

- **Unit tests** (Jest): in `tests/` with `.spec.ts` suffix, use `@jest/globals` imports, mock `@lib/` paths with `jest.mock()`. 100% coverage threshold on lines/branches/functions/statements.
- **Integration tests** (Bun native runner): in `tests/integration/`, use `bun:test` imports.
- `reflect-metadata` is auto-loaded via Jest setupFiles.
