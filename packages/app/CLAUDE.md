# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@shadow-library/app` is a platform-agnostic Node.js framework for building applications using SOLID principles. Unlike NestJS (which is tied to HTTP), this framework supports CLI tools, desktop apps, microservices, or any Node.js application. It provides dependency injection, interceptors, lifecycle hooks, and a module system.

## Commands

```bash
bun install                  # Install dependencies
bun run verify               # shadow verify: format (Prettier) + lint (ESLint) + type-check + test
bun run verify --fix         # Auto-fix format + lint issues, then type-check + test
bun run type-check           # TypeScript type checking (tsc)
bun run build                # shadow build: ESM-only, flat /dist with synthesized package.json
bun run test                 # Run all tests: unit (with coverage) + integration
bun run test:unit            # Unit tests only (bun test + coverage)
bun run test:integration     # Integration tests only
```

To run a single unit test file: `bun test tests/path/to/file.spec.ts`
To run a single integration test: `bun test ./tests/integration/path/to/file.spec.ts`

**Tooling** is centralized in `@shadow-library/scripts` (the `shadow` CLI), driven by `.shadowrc.json` — there is no local `eslint.config.js`, `.prettierrc`, `commitlint.config.js`, or `.release-it.json`. `shadow build`/`verify`/`release`/`commit-msg` replace the former hand-rolled `scripts/` and release-it setup.

**Pre-commit hook** runs `bun verify`; the **commit-msg hook** runs `shadow commit-msg`.

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

Format and lint rules are shipped by `@shadow-library/scripts` (applied via `shadow verify`); `.shadowrc.json` `verify` layers repo-specific overrides on top. Key points:

- **Prettier**: single quotes, trailing commas everywhere, 180 char width, no arrow parens
- **ESLint** (typescript-eslint strict + stylistic): `no-console` is an error; `explicit-module-boundary-types` required; `no-explicit-any` is off; import order enforced by `eslint-plugin-perfectionist` (builtin > external > internal > parent/sibling), where `@lib/*` and `@shadow-library/*` count as **internal** and the four banner comments partition the sorted blocks; Node built-ins must use `node:` protocol prefix
- **Test files** (`tests/**/*.spec.ts`) have relaxed rules (no-extraneous-class, no-empty-function, no-non-null-assertion, no-console off; unused vars allow `^_`)
- **TypeScript**: strict mode (TS 6.x via `shadow`), `module`/`moduleResolution` = `ESNext`/`bundler`, experimental decorators enabled, path alias `@lib/*` maps to `src/*`

### Commit messages

Format: `<type>(<scope>): <subject>` (max 100 chars, imperative present tense, no capitalization, no trailing period). Types: feat, fix, refactor, test, docs, style, chore, ci, perf, build. Validated by the commit-msg hook (`shadow commit-msg`, shipped `@commitlint/config-conventional`).

## Testing

- **Unit tests** (Bun's runner): in `tests/` with `.spec.ts` suffix, use `bun:test` imports; create test doubles with `mock()` / `spyOn()`. Avoid `mock.module()` — Bun's module mocks leak across files in a shared process, so isolate at the instance level instead (overwrite the field / spy the prototype and restore in `afterEach`).
- **Integration tests** (Bun native runner): in `tests/integration/`, use `bun:test` imports.
- Coverage runs on the unit suite via `--coverage` (reported to `./coverage`, no hard threshold): Bun applies `coverageThreshold` per-file and under-reports vs Jest/istanbul (it counts TS parameter-property/field declarations as executable lines, phantom module/class scopes as functions, and ignores `istanbul ignore` pragmas), so "all tests pass" is the gate. `reflect-metadata` is preloaded via `bunfig.toml`.
