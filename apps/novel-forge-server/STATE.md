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

<!-- sections added as tasks complete -->

## Considered but deferred

- External durable queue (in-process JobService sufficient per §1.1.9)
- S3 image storage (interface only; local ships first)
- Flask browse UI (out of scope; future frontend)

## Open issues

<!-- none yet -->
