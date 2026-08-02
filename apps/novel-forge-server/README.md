# Novel Forge Server

Backend service for an AI-powered novel generation platform. See `CLAUDE.md` for architecture,
conventions, and the source-of-truth design docs.

## Environment Variables

All keys are declared in `src/bootstrap.ts`, except `APP_STAGE`, which `@shadow-library/common` declares for every app.
Keys marked **required in prod** must be set when `APP_STAGE=prod`.

| Env key                 | Default                  | Description                                  |
| ----------------------- | ------------------------ | -------------------------------------------- |
| `APP_STAGE`             | `prod`                   | Stage: `dev`, `staging`, or `prod`           |
| `SERVER_PORT`           | `8080`                   | HTTP listen port                             |
| `SERVER_HOST`           | `0.0.0.0`                | HTTP listen host                             |
| `DATABASE_POSTGRES_URL` | —                        | PostgreSQL connection URL (required)         |
| `AI_PROFILE`            | `production`             | `production` or `local-test` (Ollama-only)   |
| `AI_ANTHROPIC_API_KEY`  | —                        | Anthropic API key                            |
| `AI_OPENAI_API_KEY`     | —                        | OpenAI API key                               |
| `AI_XAI_API_KEY`        | —                        | xAI API key                                  |
| `AI_GROK_LLM_MODEL`     | `grok-3`                 | Default xAI LLM model                        |
| `AI_GROK_IMAGE_MODEL`   | `grok-2-image`           | xAI image model                              |
| `AI_OLLAMA_HOST`        | `http://localhost:11434` | Ollama server URL                            |
| `AI_EMBEDDING_MODEL`    | `qwen3-embedding:8b`     | Embedding model for vector indexes           |
| `AI_ALLOW_CLAUDE_CODE`  | `false`                  | Enable Claude Code tool in agent loops       |
| `AI_ALLOW_CODEX`        | `false`                  | Enable OpenAI Codex tool in agent loops      |
| `AI_CLAUDE_CODE_BIN`    | `claude`                 | Path to the `claude` binary                  |
| `AI_CODEX_BIN`          | `codex`                  | Path to the `codex` binary                   |
| `AI_LANGSMITH_API_KEY`  | —                        | LangSmith API key (enables tracing when set) |
| `STORAGE_DRIVER`        | `local`                  | Storage driver (`local` only currently)      |
| `STORAGE_IMAGE_DIR`     | `./images`               | Directory for generated images               |

## AI-specific commands

```bash
# Test aliases (bun run <script>)
test:ai:unit      # Prompt, model-router, and context-assembler unit tests
test:ai:graph     # LangGraph workflow tests
test:ai:tools     # Tool registry tests
test:ai:local     # Ollama local integration tests (requires Ollama)

# AI utilities
ai:smoke          # Smoke test against all configured providers
ai:pull-models    # Pull required Ollama models
```

## API Overview

All routes are prefixed `/api/v1`.

### Projects

| Method   | Path            | Description      |
| -------- | --------------- | ---------------- |
| `POST`   | `/projects`     | Create a project |
| `GET`    | `/projects`     | List projects    |
| `GET`    | `/projects/:id` | Get a project    |
| `PATCH`  | `/projects/:id` | Update a project |
| `DELETE` | `/projects/:id` | Delete a project |

### Story Bible

| Method  | Path                         | Description             |
| ------- | ---------------------------- | ----------------------- |
| `GET`   | `/projects/:id/bible`        | Get all bible documents |
| `POST`  | `/projects/:id/bible`        | Create a bible document |
| `GET`   | `/projects/:id/bible/:docId` | Get a bible document    |
| `PATCH` | `/projects/:id/bible/:docId` | Update a bible document |
| `GET`   | `/projects/:id/entities`     | List entities           |
| `POST`  | `/projects/:id/entities`     | Create an entity        |
| `GET`   | `/projects/:id/volumes`      | List volumes            |
| `POST`  | `/projects/:id/volumes`      | Create a volume         |

### Generation Workflows

| Method | Path                            | Description                                  |
| ------ | ------------------------------- | -------------------------------------------- |
| `POST` | `/projects/:id/seed-from-brief` | Kick off bible builder workflow from a brief |
| `POST` | `/projects/:id/plan`            | Generate volume plan                         |
| `POST` | `/projects/:id/approve`         | Approve the volume plan                      |
| `POST` | `/projects/:id/outline`         | Generate chapter briefs                      |
| `GET`  | `/projects/:id/briefs/:n`       | Get chapter brief                            |
| `PUT`  | `/projects/:id/briefs/:n`       | Update chapter brief                         |
| `POST` | `/projects/:id/generate`        | Enqueue chapter generation job               |
| `POST` | `/projects/:id/finalize`        | Finalize an approved draft                   |
| `POST` | `/projects/:id/validate`        | Run novel-level validation workflow          |

### Drafts & Review

| Method | Path                                | Description                                     |
| ------ | ----------------------------------- | ----------------------------------------------- |
| `GET`  | `/projects/:id/drafts`              | List drafts                                     |
| `GET`  | `/projects/:id/drafts/:n`           | Get a chapter draft                             |
| `PUT`  | `/projects/:id/drafts/:n`           | Update draft (hand edit)                        |
| `POST` | `/projects/:id/drafts/:n/revise`    | Request AI revision with feedback               |
| `POST` | `/projects/:id/drafts/:n/judge`     | Run judge on a draft                            |
| `POST` | `/projects/:id/drafts/:n/feedback`  | Submit reviewer feedback                        |
| `POST` | `/projects/:id/drafts/:n/approve`   | Approve a draft                                 |
| `GET`  | `/projects/:id/drafts/:n/revisions` | List all revisions                              |
| `GET`  | `/projects/:id/review-queue`        | Drafts and continuity proposals awaiting review |

### Observability

| Method | Path                        | Description                      |
| ------ | --------------------------- | -------------------------------- |
| `GET`  | `/projects/:id/ai-usage`    | AI token usage and cost per role |
| `GET`  | `/projects/:id/runs`        | List workflow runs               |
| `GET`  | `/projects/:id/runs/:runId` | Get run details                  |
| `GET`  | `/projects/:id/jobs`        | List jobs for a project          |

### Manuscript

| Method | Path                       | Description                                                 |
| ------ | -------------------------- | ----------------------------------------------------------- |
| `GET`  | `/projects/:id/manuscript` | Get the assembled markdown manuscript (final chapters only) |
| `GET`  | `/projects/:id/search`     | Vector search across prose and lore indexes                 |

## Development Notes

### AI_PROFILE

Set `AI_PROFILE=local-test` to route all AI calls to Ollama instead of cloud providers. Requires Ollama running locally with models pulled:

```bash
bun run ai:pull-models
bun run dev
```

### Template DB for tests

Tests use a `_template` database to spin up isolated per-test databases without running migrations each time:

```bash
# One-time setup (from the repo root):
bun scripts/db.ts apps/novel-forge-server migrate
bun scripts/db.ts apps/novel-forge-server create-template

# Then run tests normally:
bun test
```

### Model routing

The model router (`src/modules/ai/model-router.service.ts`) selects a model per generation role (`generation`, `judge`, `fix`, `extraction`, etc.). Per-project overrides are stored in `projects.config.models`. The `AI_PROFILE=local-test` seam redirects all roles to Ollama models.

### Workflow architecture

Five LangGraph workflows run as durable jobs:

- **bible-builder** — generates world, characters, factions, plot outline
- **chapter-generation** — draft → judge → repair loop → persist
- **chapter-finalization** — apply continuity, index prose, mark chapter final
- **novel-validation** — windowed continuity check across the full manuscript
- **source-extraction** — extract lore from uploaded source text

Jobs are queued in PostgreSQL and dispatched by `JobExecutor`. Crash recovery resets `running` jobs to `pending` on startup.

### LangSmith tracing

Set `AI_LANGSMITH_API_KEY` to enable LangSmith tracing for all LangGraph runs. No additional wiring is required — LangChain picks up the key from the environment automatically.
