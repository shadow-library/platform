# Synapse

The platform's AI service. Every model call from every app goes through it: apps name a task, Synapse picks the model, translates for the provider, applies effort, enforces budgets and records usage.
`synapse-server` is the API and dispatch engine; `synapse-web` is a thin admin console over it (no business logic). `packages/synapse` is the client (typed calls and a LangChain chat model).
Authentication is Identity's job (`docs/identity.md`).

## Concepts

- Provider: an upstream endpoint with a kind (`openai`-compatible, `ollama`, `mock`), a locality (`in_cluster`, `host`, `third_party`), a cost class (`zero` or `metered`) and features (`sessions`, `native_web_search`, `image_input`). Secrets are named by Config key, never stored in the catalog.
- Model: a catalog entry with capabilities (tools, structured output native or by prompt, vision, image output, embedding dimensions, context, reasoning mode and supported efforts, prompt cache, sampling), list prices per million tokens, and ordered deployments (provider plus the provider's own model id). Deployment order is failover order.
- Alias: the user-facing family name ("Opus", "GPT Sol") that targets one model. The admin chooses the target, so moving "Opus" to a newer model changes what users get without any app change. The version is hidden by default and shown only when the alias opts in. States: `active` (offered and usable), `hidden` (usable by key but not offered), `retired` (never offered; a request naming it falls through to the task's routes).
- Task: the app's contract, keyed `<app>.<name>` and callable only by that app. Declares kind (chat, embedding, image), required capabilities, an effort range (default, min, max), a data policy (`any` or `in_cluster_only`), the aliases it accepts, and its routes. An embedding task is pinned: its route models cannot change across catalog versions, because stored vectors depend on them.
- Route: a model chosen by selectors the caller sends (`tier`, `content_mode`, `plan`, ...). The route with the most matching selector keys wins, ties go to the earliest; exactly one route has no selectors and is the default.
- Budget: a limit on calls and/or list-price cost for an app, per subject or for the whole app, over a fixed window (`1h`, `1d`, `30d`). Cost is counted at list price, never at what a provider billed.
- Catalog: one JSON document holding providers, models, aliases, tasks and budgets. Versions are `DRAFT` (at most one), `PUBLISHED` (the active one is the highest) or `ARCHIVED`. Publish replaces the whole document atomically after validation and must present the fingerprint of the draft it saw; a draft save may present the fingerprint it replaces, or that no draft exists, and is refused on a mismatch; rollback copies an older document into a NEW published version, so history is append-only. Replicas poll the published version and keep the previous one if a reload fails.
- A baseline seed writes catalog v1 only when no version exists. The `local-only` seed profile replaces every deployment with local Ollama, so the test environment makes no paid call.

## Architecture

- Callers are Identity M2M clients (`novel-forge`, `memoir`); the calling app is the token's client id, and a task whose prefix is not the caller is refused. Each caller needs a service-access rule in Identity for `api://synapse`.
- Request contract on `/api/v1/*` (OpenAI-compatible chat, embeddings and image generation): the body is the OpenAI body with `model` set to the task id, plus a `synapse` envelope carrying the caller-generated `request_id` (unique), the `subject` (owner, user or app), `selectors`, and optionally an `alias`, an `effort`, a `session` and `web_search`. The only header is `Authorization`. A request without the envelope is invalid.
- The response is the OpenAI shape, with `model` echoing the task id, plus a `synapse` block: `alias` (the alias key, or null), `label` (the alias label, plus the model version when the alias sets `showVersion`, else the model label), model, provider, effort applied, attempts, catalog version and list and billed cost (`cost.list_usd`, `cost.billed_usd`). Streams end with one choice-less frame carrying usage and that block, then `[DONE]`.
- `GET /api/v1/catalog` tells an app what a user may choose for a task and selectors: the default, the active matching aliases with price and capabilities, and whether the first eligible provider has native web search. Without `task` it returns every task of the calling app. It is ETag-cached by catalog version, so apps render pickers from it and hold no model list.
- Resolution: task, then the alias if the caller names one and the task accepts it and its `available` rule matches the selectors, otherwise the routes; deployments are then filtered by the data policy and the request's needs. An empty result is refused, never silently relaxed.
- Dispatch: budgets are admitted first, then effort is clamped to the task's range and snapped to what the model supports, then deployments are tried in order. A duplicate `request_id` is refused with `SYN_DUPLICATE_REQUEST` before dispatch. Settlement after the response writes the usage ledger row and adds list cost to every admitted budget.
- Provider translation is Synapse's job alone: model id substitution, effort encoding per provider kind, session and web-search switches for the host gateway, structured output native or injected into the prompt, cache-control kept or stripped, sampling parameters dropped for models that reject them, Ollama's OpenAI-compatible endpoints, image generation endpoints, and usage parsing including cached and reasoning tokens. Apps never see a provider dialect.
- Own PostgreSQL database: `catalog_versions`, the `ledger` and `budget_counters`. A daily retention sweep prunes the ledger.
- `synapse-web` calls same-origin `/api/*` in the browser and `synapse-server` directly during SSR, and authenticates via Identity; its `api-types.gen.ts` is generated from `synapse-server`. It hides the controls a user lacks the permission for, read from `GET /api/v1/admin/access`; the server enforces every permission regardless.

## Integrations

- `identity`: Synapse is an `INTERNAL` app. Service scopes `synapse:infer` (inference) and `synapse:catalog:read` (catalog); these are distinct from the user permissions, and inference and catalog routes admit only service principals while `/api/v1/admin/*` admits only users. Service-access rules name exact paths, never a wildcard covering the admin routes. User permissions `synapse:catalog:read`, `synapse:catalog:write`, `synapse:catalog:publish`, `synapse:providers:write`, `synapse:budgets:write` and `synapse:usage:read`, grouped into roles `SynapseViewer`, `SynapseOperator` (adds `synapse:catalog:write`) and `SynapseAdmin` (adds `synapse:catalog:publish`, `synapse:providers:write` and `synapse:budgets:write`; granted to the bootstrap admin). A draft that changes `budgets` also needs `synapse:budgets:write`, and one that changes `providers` needs `synapse:providers:write`, in addition to `synapse:catalog:write`. The permission catalog MUST match Identity's seed: edit both together.
- `novel-forge`: tasks `novel-forge.{writing,planning,review,chat,helper,vision,image,embedding}`, selectors `tier` and `content_mode`; chat pins store alias keys; spend limits are Synapse budgets per owner.
- `memoir`: tasks `memoir.insight` and `memoir.receipt-structuring`, selector `plan` (`free` or `paid`). memoir's entitlement quotas stay in memoir.
- The host CLI gateway is the `subscription` provider: zero cost, sessions and native web search, a small per-replica in-flight cap. OpenRouter is the metered third-party provider; local Ollama serves embeddings and memoir's default routes (`llama3.1`), and replaces every deployment in the `local-only` profile.

## Hard rules

- NEVER store prompt or completion text: the ledger holds identifiers, tokens, cost, timing and outcome only, and logs carry no message content.
- NEVER rename or delete a task id: apps depend on it. NEVER rename or delete an alias key: stored pins depend on it, so retire it instead. Publish rejects a document that drops either.
- NEVER edit a published version or write catalog rows outside the publish and rollback code. Publish MUST validate the whole document, with errors carrying a JSON path; a dangling reference, a route lacking a required capability, an unordered or unsupported effort range, an `in_cluster_only` task that can reach a non-in-cluster provider, a pinned task whose models changed, or a task without exactly one default route is refused.
- Failover happens only before the first byte reaches the caller, and only on a connect error, 408, 429, 5xx, a 400 with `unsupported_parameter`, or a deployment at its in-flight cap. After that an error is an error frame, never a retry on another deployment. When every deployment fails the call is `SYN_PROVIDERS_EXHAUSTED`.
- Client disconnect and timeout MUST abort the upstream request on every path; the ledger records `cancelled`.
- Providers own their capacity: Synapse neither queues nor throttles beyond a deployment's in-flight cap.
- Any replica serves any request. Shared state lives only in Postgres and changes by atomic statements: budget admission is one conditional upsert per budget, `request_id` uniqueness is claimed before dispatch, and the retention sweep runs under an advisory lock. Per-replica memory holds only the catalog cache and in-flight counts.
- A budget counts list price, so a free subscription call still spends budget.
- The `data_policy` of a task is enforced at resolution; no seeded task uses `in_cluster_only`.
- No app other than Synapse may hold a provider key, URL or vendor model slug, and apps MUST NOT read Synapse's database.
- Every route needs an auth decorator; inference routes need the service scope and the admin routes a user permission, except `GET /api/v1/admin/access`, which needs only a user session and reports which Synapse permissions the user holds. Bots are refused.
- A server contract change requires regenerating `synapse-web`'s `api-types.gen.ts` and fixing its callers.

## Non-goals

- No prompt storage, prompt templates or caching of completions. No per-provider rate limiting. No billing: budgets are guardrails, not invoices.
