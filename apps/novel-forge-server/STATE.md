# State

> Caveman-style fact sheet. Bullets, not prose.

## Stack

- Bun runtime, TypeScript strict, ESM modules
- `@shadow-library/app` DI, `@shadow-library/fastify` HTTP, `@shadow-library/modules` DatabaseModule
- Drizzle ORM + bun-sql driver, PostgreSQL, pgvector (1024 dims)
- LangChain + LangGraph + LlamaIndex.TS for AI layer
- `bun:test` + template-DB clone per spec; 90% coverage enforced

## Conventions

- Section banners in every file (side-effects / npm / user / types / constants)
- 180-char print width, single quotes (prettier)
- `@server/*`=src/*, `@modules/*`=src/modules/*, `@scripts/*`=scripts/*, `@tests/*`=tests/*
- Source files: relative imports. Tests: alias imports.
- Errors: AppErrorCode extends ServerErrorCode; `throw new ServerError(AppErrorCode.XXX)`
- Logging: `Logger.getLogger(APP_NAME, ClassName)` — no console
- Drizzle: `bigserial({mode:'bigint'})` PKs, namespaced type exports, `relations(...)`

## Capabilities

### M1 — Project structure & dependencies
- `@shadow-library/*` bumped to pulse versions; drizzle-orm, langchain stack, llamaindex in package.json
- `moduleResolution: bundler`; aliases `@modules/*`, `@scripts/*`, `@tests/*` added to tsconfig
- bootstrap.ts owns all config keys: `app.stage`, `server.*`, `ai.*` (anthropic/openai/xai/ollama/subprocess), `storage.*`
- `src/constants.ts` exports `APP_NAME = 'novel-forge'`
- `src/modules/dynamic.modules.ts`: `HttpRouteModule` with `/api` prefix + versioning; no feature modules yet
- `src/app.module.ts` imports `[DatabaseModule, HttpRouteModule]`
- `AppErrorCode` groups: PRJ/SRC/CHP/PLN/DRF/FIN/AI/CNT/ENT all defined
- `AuthGuard` permissive seam in `src/common/auth.guard.ts`
- `DatabaseModule` wired (empty schema); `constraintErrorMap` empty (M2 fills it)
- db scripts: `db:migrate`, `db:create-template`, `db:seed`
- `TestEnvironment` in `tests/test-environment.ts` (requires PostgreSQL + template DB)
- Tests require PostgreSQL; legacy scaffold test removed; `bun test` passes on unit-only specs

## Considered but deferred

- External durable queue (in-process JobService sufficient per §1.1.9)
- S3 image storage (interface only; local ships first)
- Flask browse UI (out of scope; future frontend)

## Open issues

<!-- none yet -->
