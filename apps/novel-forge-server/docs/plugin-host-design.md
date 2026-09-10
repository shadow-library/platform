# Plugin Host Design — optional per-novel behaviour without forking core

Novel Forge is one authoring server and one web app. Every novel on a deployment currently shares the same
prompt modules, the same model-router preamble, the same chapter toolbar, and the same hub actions. Operators
already need **per-novel** behaviour that does not belong in this monorepo: a house-style imprint on two
novels, a localisation pass on another, a clue-tracking overlay on a mystery. None of those should land as
core prompts, core DTOs, or core UI copy.

This document specifies a **plugin host**: core stays a generic authoring engine; a deployment may load zero
or more plugins from disk; an author enables a plugin on a single novel. Public CI and public images load no
plugins. The only plugin that ships in this tree is a **test fixture** under `tests/`.

Follows the conventions of `ai-system-design.md`. §2 lists amendments. Drives checklist tasks **PL1–PL7**.

The implementing agent treats this file as the source of truth. Do not invent a product plugin. Do not add
imprint (or any other domain) copy to production prompts or production UI.

---

## 1. Problem

Today the only extension points are compile-time: `@Injectable` registrars (`HubActionRegistrar`), a frozen
`PROMPT_REGISTRY`, and TanStack routes. Nothing in this monorepo is published to npm (`workspace:*` only), so
"install a package from the registry" is not available.

Without a host, every specialised workflow either merges into core or requires a fork. With a host, core does
not know what a plugin is _for_ — only that one may contribute system text, extra prompt modules, opaque
config, and invoke ops.

### 1.1 Motivating use case (test fixture only, not a product)

**Imprint / house-style overlay.** A server hosts many novels. Two belong to a "Travelogue" imprint. For those
novels only:

1. Every chapter generate / revise / fix call prepends a house-style system message (short sentences, concrete
   place names, no omniscient moralising, no chosen-one cadence).
2. Novel settings show the plugin's config form: max sentence length, a comma-separated forbidden-phrase list,
   and a toggle "append a short author's note after the chapter body."
3. The chapter toolbar shows **Apply house style** (label from the manifest). It invokes a rewrite of the
   current draft against the house sheet without changing canon facts.
4. Disabling the plugin on that novel removes the preamble and hides the action. A sibling novel never sees it.

This is enough to demand the full host: disk load, per-novel enable, prompt hooks, invoke, manifest-driven UI,
and isolation between projects. Implement it only as `tests/plugins/fixtures/travelogue/`. Production
`src/modules/ai/prompts/` and `novel-forge-web` production routes must not contain Travelogue (or any imprint)
copy.

Other valid plugins the host must be able to support later, without a redesign: localisation of a chapter
span; a fair-play mystery overlay that injects clue contracts; a serial author's-note footer. Do not build
those in v1.

### 1.2 Non-goals

- Loading code from a URL, npm, or the browser (no module federation, no `eval`, no remote UI bundles).
- A plugin marketplace in the product UI.
- Plugin-defined Fastify routes (they would mutate public OpenAPI and break `bun scripts/gen-api-types.ts --check`).
- Giving a plugin a raw Drizzle `db` handle.
- Replacing the app shell, auth, or billing.
- Wiring context-pack sections, lifecycle events, hub actions, or model-profile routing in the first PR.
  Those methods exist on the TypeScript interface as optional no-ops so a later plugin can use them without
  another host redesign.

---

## 2. Amendments to earlier documents

- **Adds `ai-system-design.md` Appendix A rule 18.** _Plugin code loads only from an operator-controlled
  filesystem directory (`plugins.dir`). Plugins never register HTTP routes; the public API is the generic
  list / enable / invoke surface in this document. Extra system messages and extra prompt modules come only
  from plugins enabled on the project of the call. A plugin writes domain tables only through `ForgePluginHost`
  methods, never by holding the database client. Vanilla generate (no plugin enabled) is exactly the prompt
  module — the model router does not prepend a core policy addendum._
- **Amends Appendix A rule 10** ("Prompt text lives in versioned code modules"). Plugin-registered prompts are
  still versioned modules (`plugin:<id>:<name>` @ `version`); they live on disk next to the plugin, not in
  `PROMPT_REGISTRY`. Every call still logs `promptKey@promptVersion`.
- Rule 5 still applies: plugin prompts that produce structured output go through `modelRouter.structured` and
  the repair ladder. Rule 8 (isolation) is unchanged — a plugin cannot index isolated prose, because it has no
  retrieval API.

No other numbered hard rule is affected.

---

## 3. Locked decisions

1. **Two layers.** Deployment install (`plugins.dir` on disk) and per-novel enable (`project_plugins`) are
   both required. A plugin on disk does nothing to a novel until enabled. A novel cannot enable a plugin the
   deploy does not have.
2. **In-process, filesystem only.** `import()` of `index.js` / `index.ts` under `plugins.dir/<id>/`. That is
   RCE by construction; only the operator's path is trusted. Reject path traversal; only direct children of
   `plugins.dir` load. Never fetch plugin code over the network.
3. **Generic HTTP only.** Five endpoints, no plugin-specific paths, no plugin-specific DTO names. OpenAPI and
   `api-types.gen.ts` describe only those generic types. CI runs with `plugins.dir` unset.
4. **Generic web only.** The web app renders manifests. Button labels, form fields, and descriptions are
   runtime data. No plugin JavaScript in the browser.
5. **Narrow host, no `db`.** The factory is `createPlugin(host: ForgePluginHost)`. Plugins must not import
   `@modules/*` or `@server/*`. Tests may stub the host.
6. **Storage split.** Settings → `project_plugins.config`. Working state → `plugin_kv`. No core column named
   for a domain (`house_style`, or anything else a plugin might want). Briefs and drafts change only through
   `host.generation.*`.
7. **Core addendum removed.** `ModelRouterService.buildMessages` formats the prompt module, then appends
   plugin `contributeSystemMessages`, then cache-control. It does not prepend a content-mode policy addendum.
   `projects.contentMode` continues to select the model map only.
8. **Disable does not delete prose.** `onDisable` must not wipe drafts or chapters. KV may remain; the plugin
   decides whether the next enable starts clean.
9. **v1 surfaces.** Settings form + chapter actions. Volume / novel action surfaces may appear in the
   manifest; the v1 web app ignores them.

---

## 4. Shape

```
plugins.dir/
  travelogue/
    manifest.json
    index.js          # default export: createPlugin(host): ForgePlugin

boot   → PluginHost reads each direct child, validates id === dirname, import()s the entry
web    → GET /api/v1/plugins   (empty array when dir unset or empty)
author → PUT /api/v1/projects/:id/plugins/travelogue  { config }
write  → ModelRouter asks PluginHost for extra system messages / vars for that project
click  → POST /api/v1/projects/:id/plugins/travelogue/invoke  { op, payload }
```

`plugins.dir` is optional config (`Config.load('plugins.dir', { defaultValue: '' })` in `src/bootstrap.ts`).
Empty / unset ⇒ no plugins, `GET /plugins` returns `[]`, generate prepends nothing extra.

Each plugin directory contains:

| File                     | Role                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `manifest.json`          | Identity, capabilities, forms, actions. `id` must equal the directory name (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). |
| `index.js` or `index.ts` | Default export `createPlugin(host)`. Tests may ship `index.ts`; production plugins ship `index.js`.        |

A load failure (missing entry, thrown factory, id mismatch) logs and **skips that plugin**. It does not crash
boot. The skipped id is absent from `GET /plugins`.

---

## 5. Schema

`src/database/schemas/plugins.ts`, re-exported from `schemas/index.ts`.

```ts
projectPlugins = pgTable(
  'project_plugins',
  {
    id: bigserial('id').primaryKey(),
    projectId: bigint('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    pluginId: varchar('plugin_id', { length: 64 }).notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    enabledAt: timestamp('enabled_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique().on(t.projectId, t.pluginId)],
);

pluginKv = pgTable(
  'plugin_kv',
  {
    id: bigserial('id').primaryKey(),
    projectId: bigint('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    pluginId: varchar('plugin_id', { length: 64 }).notNull(),
    key: varchar('key', { length: 128 }).notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique().on(t.projectId, t.pluginId, t.key)],
);
```

No enum of plugin ids — the disk is the catalog.

---

## 6. Error codes

Add to `AppErrorCode` (`src/classes/app-error-code.ts`):

| Code      | HTTP | When                                                                                                                                              |
| --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLG_001` | 404  | Plugin id is not loaded on this deploy                                                                                                            |
| `PLG_002` | 404  | Plugin is not enabled on this novel (also used for invoke). Same 404 as missing, so a probe cannot distinguish "not installed" from "not enabled" |
| `PLG_003` | 400  | Config fails the plugin's settings schema / `onEnable` validation                                                                                 |

Unknown throws from `invoke` become `AppError.internal` (no stack leak to the client).

---

## 7. Types (public contract)

`src/modules/plugins/plugin.types.ts`. This file is the contract a private plugin authors against. Keep it
free of domain-specific names.

```ts
export interface PluginFormField {
  name: string;
  type: 'string' | 'number' | 'boolean';
  title: string;
  description?: string;
  enum?: string[];
  widget?: 'input' | 'textarea' | 'checkbox' | 'select';
  default?: string | number | boolean;
}

export interface PluginForm {
  fields: PluginFormField[];
  required?: string[];
}

export interface PluginAction {
  id: string;
  op: string;
  label: string;
  surface: 'settings' | 'chapter' | 'volume' | 'novel';
  form?: string;
}

export interface PluginManifest {
  id: string;
  version: string;
  title: string;
  description: string;
  capabilities: string[];
  forms: Record<string, PluginForm>;
  actions: PluginAction[];
}

export interface PromptHookContext {
  projectId: bigint;
  role: string;
  promptKey: string;
  contentMode: string;
  config: unknown;
}

export interface InvokeContext {
  projectId: bigint;
  op: string;
  payload: unknown;
  config: unknown;
}

export interface PluginContextSection {
  key: string;
  title: string;
  rendered: string;
  tokens: number;
  stable: boolean;
}

export type PluginEvent =
  | { type: 'draft.persisted'; projectId: bigint; chapter: number }
  | { type: 'chapter.finalized'; projectId: bigint; chapter: number }
  | { type: 'brief.updated'; projectId: bigint; chapter: number }
  | { type: 'project.updated'; projectId: bigint };

export interface ForgePlugin {
  id: string;
  manifest(): PluginManifest;
  onLoad?(): void | Promise<void>;
  onEnable?(projectId: bigint, config: unknown): void | Promise<void>;
  onDisable?(projectId: bigint): void | Promise<void>;
  contributeSystemMessages?(ctx: PromptHookContext): Array<{ role: 'system'; content: string }>;
  contributePromptVars?(ctx: PromptHookContext): Record<string, string>;
  registerPrompts?(): unknown[];
  invoke?(ctx: InvokeContext): Promise<unknown>;
  contributeContextSections?(ctx: { projectId: bigint; chapter: number; config: unknown }): PluginContextSection[];
  contributeModelProfile?(ctx: { projectId: bigint; role: string; config: unknown }):
    | {
        allowlist?: string[];
        prefer?: { provider: string; model: string };
      }
    | undefined;
  onEvent?(event: PluginEvent): void | Promise<void>;
}

export interface ForgePluginHost {
  log: {
    debug(msg: string, meta?: Record<string, unknown>): void;
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
  };
  generation: {
    getBrief(projectId: bigint, chapter: number): Promise<unknown>;
    updateBrief(projectId: bigint, chapter: number, body: { title?: string; body: string }): Promise<unknown>;
    getDraft(projectId: bigint, chapter: number): Promise<unknown>;
    reviseDraft(projectId: bigint, chapter: number, note: string): Promise<unknown>;
    generateUnrestricted(projectId: bigint, chapter: number, body: { guidance?: string }): Promise<unknown>;
  };
  context: { forChapter(projectId: bigint, chapter: number): Promise<unknown> };
  modelRouter: { structured(prompt: unknown, vars: Record<string, unknown>, ctx: unknown, project?: unknown): Promise<unknown> };
  jobs: { enqueue(input: unknown): Promise<{ jobId: string }> };
  kv: {
    get(projectId: bigint, key: string): Promise<unknown | undefined>;
    set(projectId: bigint, key: string, value: unknown): Promise<void>;
    delete(projectId: bigint, key: string): Promise<void>;
  };
}
```

v1 **implements**: manifest, load, enable/disable, `contributeSystemMessages`, `contributePromptVars`,
`registerPrompts`, `invoke`, `host.kv`, `host.generation`, `host.context.forChapter`, `host.modelRouter.structured`,
`host.log`.

v1 **stubs**: `host.jobs.enqueue` throws `AppError.internal('plugin jobs are not available')`. Context sections,
model-profile, and `onEvent` are optional on the plugin interface; the host does not call them yet.

`registerPrompts` keys must be namespaced `plugin:<pluginId>:<name>`. Keep a parallel `PluginPromptRegistry`
resolved by `modelRouter.structured` — do not stuff plugin keys into the frozen core `PromptKey` union.

`contributePromptVars` merges into the template input. Only pass keys the active template declares, or have
the plugin declare `varsFor: string[]` on the contribution; unknown LangChain template vars must not crash
`formatMessages`.

### 7.1 Reserved capabilities

| Capability        | Meaning                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| `prompt.system`   | Contributes system messages                                                 |
| `prompt.vars`     | Contributes template variables                                              |
| `prompt.register` | Registers extra prompt modules                                              |
| `invoke`          | Handles `invoke` ops                                                        |
| `ui.settings`     | Has a settings form (`forms.settings`)                                      |
| `ui.chapter`      | Has a chapter action                                                        |
| `ui.volume`       | Has a volume action (v1 web ignores)                                        |
| `model-profile`   | May influence model allowlist / content-mode presentation (not wired in v1) |
| `context.section` | Contributes context-pack sections (not wired in v1)                         |
| `jobs`            | Enqueues long-running work (not wired in v1)                                |
| `events`          | Subscribes to novel lifecycle events (not wired in v1)                      |

Unknown capability strings are legal; the UI ignores them.

---

## 8. HTTP

All routes `@Authenticated()`. Project-scoped routes go through `ProjectOwnershipGuard` (404 `PRJ_001` on a
foreign project, same as every other project route). `GET /api/v1/plugins` is deploy-scoped, like the model
registry — authenticated, no project param.

| Method   | Path                                                   | Behaviour                                                                                                                                       |
| -------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/plugins`                                      | Plugins loaded on this deploy (manifests only). `[]` when none                                                                                  |
| `GET`    | `/api/v1/projects/:projectId/plugins`                  | Enabled plugins for this novel + stored `config`                                                                                                |
| `PUT`    | `/api/v1/projects/:projectId/plugins/:pluginId`        | Enable or update config. Body `{ config?: Record<string, unknown> }`. 404 `PLG_001` if not on disk. Calls `onEnable`. Upserts `project_plugins` |
| `DELETE` | `/api/v1/projects/:projectId/plugins/:pluginId`        | Disable. Idempotent 204 even if it was not enabled. Calls `onDisable` when a row existed                                                        |
| `POST`   | `/api/v1/projects/:projectId/plugins/:pluginId/invoke` | Body `{ op: string, payload?: unknown }`. 404 `PLG_002` if missing on disk or not enabled. Returns the plugin's JSON-serialisable result        |

Controllers live in `src/modules/plugins/` (`plugin.controller.ts`, `plugin.dto.ts`, `plugin.service.ts`,
`plugin-host.service.ts`, `plugin-loader.ts`, `plugins.module.ts`, barrel). Register `PluginsModule` in
`dynamic.modules.ts` `HttpRouteModule` imports — that is how every other HTTP module is wired, not
`app.module.ts`.

DTOs are `@Schema` / `@Field` classes. `config` and `payload` and the invoke result are untyped objects
(`Record<string, unknown>` / `unknown`) — core does not know the plugin's shape.

---

## 9. Model router

`ModelRouterService.buildMessages` today formats the prompt module and, for some content modes, prepends a
fixed addendum. After this work:

1. Format the prompt module's messages as today.
2. If the call has a `projectId`, load plugins enabled on that project. For each, if
   `contributeSystemMessages` returns messages, append them after the module's own system message.
3. Merge `contributePromptVars` into `input` **before** `formatMessages` (so the template can see them).
4. Apply Anthropic cache-control as today, then the JSON-schema trailer as today.

No core addendum remains. `contentMode` still selects `UNRESTRICTED_*` vs default model maps.

`structured()` looks up plugin-registered prompts by key when the key is not in `PROMPT_REGISTRY`.

---

## 10. Web (`novel-forge-web`)

No Travelogue (or any imprint) strings in production source.

1. **Settings → Plugins tab** (new tab on `settings.tsx`). `GET /plugins`; if empty, hide the tab.
   For each deploy plugin: enable/disable, and if `forms.settings` exists, render it with
   `@shadow-library/ui` (`FormField` + `Input` / `Textarea` / `Checkbox` / `Select` per `widget`). Save via
   `PUT`. Prefill from `GET /projects/:id/plugins`.
2. **Chapter toolbar** (`chapters.tsx`). For each enabled plugin, one button per `actions` entry with
   `surface === 'chapter'`. Label = `action.label`. If `action.form` is set, open a dialog of that form;
   submit `invoke` with `{ op: action.op, payload: { chapter, ...formValues } }`. If no form, invoke
   immediately with `{ op, payload: { chapter } }`. Toast the result or error.
3. API wrappers next to the other `src/lib/apis/*.api.ts` files. Regen `api-types.gen.ts` in the same change.

Form renderer: only the field types in §7. No general JSON Schema engine.

---

## 11. Test fixture

`tests/plugins/fixtures/travelogue/`

- `manifest.json` — id `travelogue`, title `Travelogue imprint`, capabilities
  `prompt.system`, `prompt.register`, `invoke`, `ui.settings`, `ui.chapter`.
- Settings form fields: `maxSentenceWords` (number), `forbiddenPhrases` (string, textarea),
  `authorsNote` (boolean).
- Chapter action: id `restyle`, op `restyle`, label `Apply house style`, no extra form.
- `index.ts` implements `ForgePlugin`:
  - `contributeSystemMessages` for roles `generation`, `revision`, `fix`: one system message that states the
    max sentence words and lists forbidden phrases from config. Empty array for other roles.
  - `registerPrompts`: one module `plugin:travelogue:restyle`, system text
    `Rewrite the chapter to honour the house sheet. Do not add facts.`
  - `invoke restyle`: `{ chapter: number }` → `host.generation.getDraft`, `host.modelRouter.structured` with
    the restyle prompt, returns `{ title, body }` (the test stubs `modelRouter` and asserts it was called).
  - `invoke preview-preamble`: returns `{ preamble: string }` — the exact system string generate would get.

Host suite `tests/plugins/plugin-host.spec.ts` (and HTTP e2e next to other controller specs):

1. Unset `plugins.dir` ⇒ `GET /plugins` is `[]`; a generate-path `buildMessages` contains no extra system
   message from a plugin.
2. Dir pointing at the fixture parent ⇒ plugin appears in `GET /plugins`.
3. Enable on project A only ⇒ generate for A includes the house system message; generate for project B does
   not.
4. Disable on A ⇒ preamble gone.
5. `invoke` without enable ⇒ 404 (`PLG_002`).
6. `invoke restyle` with enable ⇒ `modelRouter.structured` called with `plugin:travelogue:restyle`.
7. `PUT` with config that fails `onEnable` ⇒ 400 `PLG_003`.

The fixture is house style. It does not encode a content-policy addendum.

An in-memory `PluginHost.registerForTest(plugin)` seam is allowed so unit tests need not touch the
filesystem; the HTTP e2e that covers (2) must still load from a real dir.

---

## 12. Files to touch

**Server**

- `src/bootstrap.ts` — `plugins.dir`
- `src/database/schemas/plugins.ts` + barrel
- `src/classes/app-error-code.ts` — `PLG_001`–`PLG_003`
- `src/modules/plugins/` — host, loader, service, controller, DTOs, module, types
- `src/modules/dynamic.modules.ts` — import `PluginsModule`
- `src/modules/ai/model-router.service.ts` — plugin contributions; delete the core content-mode addendum prepend
- `src/modules/ai/prompts/authoring-preamble.ts` — remove the addendum constant if nothing else references it
- tests as §11
- drizzle migration via `bun scripts/db.ts apps/novel-forge-server generate`

**Web**

- `src/lib/apis/plugin.api.ts` (or generated types only, once OpenAPI exists)
- Settings Plugins tab
- Chapter toolbar plugin actions
- `api-types.gen.ts` regen

**Do not** add production plugins, imprint copy in `authoring-preamble.ts`, or new prompt files under
`src/modules/ai/prompts/` for house style.

---

## 13. Conventions

- `AGENTS.md` and `.claude/skills/shadow-library-ecosystem/` (backend + frontend references).
- DTOs: `@Schema` / `@Field`. Errors: catalog `ErrorCode`. Config: `Config.load` — never `process.env` in app
  code. Logging: `Logger.getLogger`. DI: `@Injectable` / `@Module`.
- Verify from repo root: `bun scripts/verify.ts apps/novel-forge-server` and
  `bun scripts/verify.ts apps/novel-forge-web`.
- Schema: `bun scripts/check-migrations.ts apps/novel-forge-server`.
- API: regen web types in the same change.
- Kebab-case filenames with role suffixes; named exports; 2-space; 180-col; no comments unless a non-obvious
  constraint.

---

## 14. Tasks

- [ ] **PL1** — Types, loader, config, `GET /api/v1/plugins`. Empty dir / unset ⇒ `[]`. Boot skip-on-failure.
      Verify: unit test on the loader; HTTP list with dir unset.
- [ ] **PL2** — `project_plugins` + `plugin_kv` + `PLG_` codes + enable/disable endpoints + `onEnable` /
      `onDisable` + `host.kv`. Verify: migration applies; schema tests; enable on A is invisible to B;
      disable is idempotent; `PLG_001` / `PLG_003`.
- [ ] **PL3** — `contributeSystemMessages` / `contributePromptVars` in `buildMessages`; delete the core
      content-mode addendum prepend. Verify: enabled project A gets the fixture preamble on generation /
      revision / fix roles; project B does not; other roles get nothing; prompt goldens that asserted the
      old addendum are updated to "no extra system message without a plugin."
- [ ] **PL4** — `invoke` + `PluginPromptRegistry` / `registerPrompts`. Verify: 404 when not enabled;
      restyle calls `structured` with `plugin:travelogue:restyle`; unknown throws map to internal.
- [ ] **PL5** — Web: settings Plugins tab (hidden when deploy list is empty) + chapter toolbar actions from
      the manifest. Verify: web type-check/lint; no imprint strings in production `src/`.
- [ ] **PL6** — Travelogue fixture + the assertions in §11. Verify: `bun test tests/plugins` green.
- [ ] **PL7** — Regen `novel-forge-web` `api-types.gen.ts` from a booted server (dir unset, so OpenAPI has
      only the generic plugin surface). Verify: `bun scripts/gen-api-types.ts apps/novel-forge-web --check`.

Stop after PL7. Do not wire context sections, events, hub actions, or model-profile routing.

---

## 15. Success criteria

- A fresh clone, `plugins.dir` unset, behaves as today minus the removed core addendum.
- An operator can drop a compiled plugin on disk, enable it on one novel, and that novel's generate calls
  receive extra system text; every other novel does not.
- The web app can show a settings form and a chapter button without compiling in any plugin.
- No production prompt or UI string in `apps/novel-forge-*` describes an imprint, a genre overlay, or a
  generation content policy. Those strings, if any, live in plugins loaded at runtime or in
  `tests/plugins/fixtures/`.
