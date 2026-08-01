# RFC 0001 — Templates as a First-Class CMS in Pulse

> Status: **Implemented** · Owner: Pulse · Supersedes: the in-code email design system (`renderEmailDocument`) and the seed-file template catalogue.

> **As-built note (deviations from this proposal):** The engine ships as **LiquidJS + juice** as proposed, but the email **layout is authored as hand-written responsive HTML** (the ported `@shadow-library/ui` design system) rather than **MJML**. MJML's component packages do not lazy-load under the Bun runtime (`mjml2html` returns empty output), so a compile-at-publish MJML step was dropped in favour of a self-contained HTML layout that juice inlines at render — simpler, dependency-light, and fully client-compatible. The render-bundle cache is an in-process, immutable-version-keyed cache (content is pinned by version id; layouts/partials invalidate on publish) rather than the L1/L2 `CacheService` sketched in §11 — sufficient for the single-instance deployment and trivially swappable. Everything else (versioned draft→publish→rollback, variable contract enforced at publish + send, layouts/partials, preview, granular RBAC `templates:publish` / `layouts:write`, idempotent overwritable fixtures, unchanged `POST /api/v1/notifications` contract) shipped as designed.

## 1. Summary

Pulse should be the **single source of truth** for every notification template — content **and** presentation — with all of it editable at runtime by permissioned users and **none of it hard-coded**. Today Pulse stores template _bodies_ in Postgres but (a) the branded email **layout/design system lives in code** (`src/modules/notification/email/email-layout.ts`), (b) the template bodies are **owned by seed files** (`scripts/seed-data/template-*.data.ts`) that `db:seed` re-applies via `TRUNCATE … RESTART IDENTITY CASCADE`, so DB edits are transient, and (c) there is **no versioning, draft/publish lifecycle, variable contract, reusable components, or safe author-time rendering**.

This RFC proposes evolving Pulse's existing template module into a proper **headless template CMS**: versioned templates with a draft→publish→rollback lifecycle, a managed **layout/partials design system**, a declared **variable schema** (the contract between sender services and templates), a **sandboxed rendering engine**, preview/test-send, granular RBAC, and an audit trail — while keeping the public `POST /api/v1/notifications` contract **100% unchanged**.

## 2. Motivation — what's wrong today

| Area            | Current state                                                                | Problem                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Presentation    | Branded HTML shell + CSS tokens in `email-layout.ts`, applied at render time | A design change is a code change + build + deploy; non-engineers cannot touch it                                                          |
| Source of truth | `scripts/seed-data/template-*.data.ts`; `db:seed` truncates + re-inserts     | The DB is **not** authoritative — a runtime edit is wiped on the next reseed                                                              |
| Lifecycle       | Variants mutated in place via `PATCH`                                        | No history, no draft vs live, no preview-before-publish, no rollback, no immutability                                                     |
| Contract        | Templates reference `{{code}}`, `{{ipAddress}}`… with nothing declared       | Sender (identity) and template are implicitly coupled; a payload change silently breaks output; editors have no idea what variables exist |
| Reuse           | The OTP block / button / alert panel are copy-pasted HTML in every fragment  | No component library; inconsistent edits                                                                                                  |
| Safety          | `body` is `varchar(5000)`; Mustache renders it verbatim                      | Too small for real templates; no author-time validation; no sandbox story for user-edited HTML/logic                                      |
| Governance      | `pulse:templates:read/write` on plain CRUD                                   | No approval, no audit of who published what, no separation between editing content vs editing the brand/theme                             |

**What already exists and we keep:** the `template_groups` / `template_channel_settings` / `template_variants` tables, the `/api/v1/template-groups[/…/variants]` admin API, the `pulse:templates:*` RBAC, per-channel/locale resolution, and the `{templateKey, recipients, payload, service, locale}` send contract. This RFC is an **evolution, not a rewrite**.

## 3. Goals & non-goals

**Goals**

1. All template content **and** the design system live in Pulse's datastore, editable at runtime by permissioned users — **zero template bodies or layouts in application code**.
2. Full CMS lifecycle: draft → validate → preview → publish → rollback, with immutable published versions and complete history.
3. A declared **variable schema** per template as the producer↔template contract, enforced at send time and surfaced to editors.
4. A reusable **layout + partials** design system (the current branded shell becomes managed content).
5. **Safe** author-time rendering (sandboxed engine, auto-escaped data, validation on publish).
6. Backward compatibility: **no change** to how identity (or any service) sends notifications.

**Non-goals (this RFC)**

- A visual drag-and-drop email builder (the API is builder-ready; a WYSIWYG in `pulse-web` is a follow-up).
- Marketing-campaign features (A/B, audiences, scheduling) — out of scope; this is transactional template management.
- Migrating providers/vendors; only DEV delivery is implemented today and that is unchanged.

## 4. CMS & architecture principles adopted

This design deliberately maps to established CMS and software-architecture practice:

- **Separation of content from presentation** — content (per-channel/locale message) is distinct from **layout** (brand shell/theme) and **partials** (blocks). (Headless-CMS standard.)
- **Structured content with a schema** — every template declares its variables; content is validated against a contract, not free text.
- **Immutable published versions + draft workspace + rollback** — the Git/CMS model: you edit a draft, publish an immutable snapshot, and can revert. (Contentful/Sanity/Strapi publishing model.)
- **Preview before publish + test send** — no blind publishes.
- **Least privilege + audit** — granular permissions (author vs publish vs theme), full change log. (Governed CMS.)
- **Safe-by-default rendering** — a **sandboxed, non-Turing-complete** template language with automatic output escaping (defends against SSTI/RCE/XSS) — the model Shopify/Jekyll/most ESPs use with user-authored templates.
- **API-first / headless** — one authoring API, one rendering path; UI (pulse-web) is just a client.
- **Backward-compatible public contract; refactor behind it** — producers are insulated from the internal redesign.
- **DDD aggregates & CQRS read model** — `Template`/`TemplateVersion` aggregates for writes; a cached, denormalised "published render bundle" for the hot send path.

## 5. Proposed architecture

### 5.1 Content model (aggregates)

```
Template (aggregate root)            — the logical message, keyed by templateKey
 ├─ metadata: name, description, messageType, category, isActive
 ├─ variableSchema: declared variables (the contract)
 └─ TemplateVersion*                 — immutable snapshots
      ├─ status: DRAFT | PUBLISHED | ARCHIVED
      ├─ version: monotonic int, notes, editor, publishedAt
      └─ TemplateContent*            — one per (channel, locale)
           ├─ subject (email/push), body (text)
           └─ layoutRef (which Layout version wraps it)

Layout   (aggregate root)            — the design system shell / theme (was renderEmailDocument)
 └─ LayoutVersion*  (DRAFT|PUBLISHED|ARCHIVED): body with a {{ content }} slot + CSS/tokens

Partial  (aggregate root)            — reusable blocks: otp-block, button, alert-panel, footer
 └─ PartialVersion* (DRAFT|PUBLISHED|ARCHIVED): body
```

Rationale: a **version** is the unit of publish/rollback and is immutable once published; **content** is per channel+locale so localisation and channel differences are first-class; **layout** and **partials** are independently versioned so the brand can evolve without touching every template.

### 5.2 Versioning & lifecycle

- Editing never mutates live content. `create draft` opens (or clones the published version into) a `DRAFT`. Authors edit the draft freely.
- `publish` runs **validation** (compile, schema, references), stamps a new monotonic `version`, marks it `PUBLISHED`, and demotes the previous published version to `ARCHIVED` (retained forever). **At most one PUBLISHED version per template** (enforced by a partial unique index).
- `rollback(version N)` clones an archived version to a new published version (never deletes history).
- Only `PUBLISHED` versions are used for live sends; `DRAFT` is used for preview/test-send.
- Every transition is written to the audit log (actor, before/after, note).

This is the core CMS gap being closed: safe editing, full history, instant rollback, and no possibility of a half-edited template reaching a recipient.

### 5.3 The design system becomes managed content

The current `renderEmailDocument` shell (header, type scale, OTP block, alert panel, footer, dark-mode CSS) is **decomposed and moved into the CMS**:

- The document skeleton → a **Layout** (`email-default`) with a `{{ content }}` slot and the CSS/tokens.
- The OTP block, CTA button, alert/warn panel, meta table, footer → **Partials**, referenced from templates as `{% render 'otp-block', code: code %}`.

Result: brand/theme changes are a permissioned runtime edit (with preview + rollback), not a deploy. Content authors compose small fragments; the layout guarantees consistency. Editing the layout/partials is gated behind a **higher** permission than editing a single template's content (see 5.7).

### 5.4 Variable schema — the producer↔template contract

Each `Template` declares a `variableSchema` (JSON-Schema-style):

```jsonc
// templateKey: auth.login.otp
{
  "variables": {
    "code": { "type": "string", "required": true, "example": "482913", "description": "6-digit one-time code" },
  },
}
```

- **At send time**, Pulse validates the inbound `payload` against the schema (missing-required → structured error + dead-letter, not a silent blank).
- **At author time**, editors get the variable list + examples for autocomplete and preview; publish validation rejects a template that references an undeclared variable.
- This **decouples** identity from the template internals: identity promises the `{code}` contract; the template can be re-authored freely as long as it honours the declared variables. Schema changes are themselves versioned.

### 5.5 Rendering engine & pipeline

**Engine choice: adopt a sandboxed, logic-limited template language — recommended [LiquidJS](https://liquidjs.com/).** Rationale (this is a security decision, not a preference): templates become **user-editable**, so the engine must be **sandboxed and non-Turing-complete** — no arbitrary code execution, no filesystem/network access, bounded CPU/among iterations. Liquid is the industry standard for exactly this (Shopify themes, Jekyll, many ESPs), gives us **layouts, partials/includes, filters, and auto-escaping** (`{{ var }}` HTML-escapes by default; explicit `| raw` is required to emit unescaped), and has a strict mode we can enforce on publish. Mustache (current) is safe but too limited (no layout inheritance, no parameterised partials, no filters), which is why the design system had to live in code. See §12 for the full engine comparison.

**Email specifically:** author the **Layout** in [MJML](https://mjml.io/) (the email-responsive standard) and compile MJML→HTML at publish, then run a **CSS inliner** (juice) — so responsive, client-compatible HTML is produced once at publish, not per send. SMS/PUSH skip layout/MJML (plain-text/notification payloads).

**Render pipeline (send path):**

```
resolve published version (templateKey, channel, locale → fallback en-ZZ)
  → validate payload against variableSchema
  → render content fragment (Liquid, data auto-escaped)
  → compose into layout (Liquid include of published Layout + Partials)   [EMAIL]
  → MJML compile + CSS inline                                              [EMAIL, at publish → cached]
  → deliver via the existing provider/sender-routing path
```

The heavy steps (compile, MJML, inline) happen **at publish** and are cached as a "render bundle"; the per-send path is a fast variable-interpolation over a precompiled template.

### 5.6 Authoring API & UX

New and extended endpoints under `/api/v1` (all gated by RBAC, see 5.7). The public `POST /api/v1/notifications` is untouched.

- Templates: `GET/POST /templates`, `GET/PATCH /templates/:key` (metadata + variableSchema).
- Versions: `GET /templates/:key/versions`, `POST /templates/:key/versions` (create/clone draft), `PATCH …/versions/:v/contents/:channel/:locale` (edit draft content), `POST …/versions/:v/validate`, `POST …/versions/:v/preview` (render with sample or supplied data → returns HTML/text), `POST …/versions/:v/publish`, `POST …/versions/:v/rollback`.
- Layouts & Partials: parallel CRUD + versioning + publish.
- `POST /templates/:key/test-send` (channel, recipient, data) — deliver a real test through the normal pipeline.

`pulse-web` gains a template studio (list → edit draft → live preview with sample data → diff vs published → publish/rollback). It is a pure client of this API.

### 5.7 AuthZ, audit, governance

Refine the RBAC catalogue (kept in sync with identity's seed, per `rbac.constants.ts`):

| Permission                | Grants                                                  |
| ------------------------- | ------------------------------------------------------- |
| `pulse:templates:read`    | View templates, versions, previews                      |
| `pulse:templates:write`   | Create/edit **drafts**, preview, test-send              |
| `pulse:templates:publish` | Publish / rollback a template version                   |
| `pulse:layouts:write`     | Edit the design-system layouts & partials (brand-level) |

Roles: `PulseViewer` (read), `PulseOperator` (write + publish), `PulseAdmin` (+ layouts). Optional **four-eyes** governance: for `PROMOTIONAL`/high-blast templates, require the publisher ≠ the last drafter. Every draft-save, publish, rollback, and layout edit is written to an **audit trail** (actor, template, version, diff, timestamp) reusing Pulse's audit facility.

### 5.8 Caching & performance

Rendering is on the notification hot path. Add a **published render-bundle cache** (ecosystem `CacheService`: L1 LRU + L2 Redis) keyed by `(templateKey, channel, locale, publishedVersion)` holding the precompiled Liquid AST + MJML-compiled/inlined layout. Publishing bumps the version → old keys expire naturally; no manual invalidation races. Cold cache falls back to compile-on-demand.

### 5.9 Backward compatibility

`POST /api/v1/notifications { templateKey, recipients, payload, service, locale? }` is unchanged. Sender services (identity et al.) require **no** changes. Internally, resolution switches from "the active variant row" to "the published version's content + composed layout." Existing `template_groups`/`template_variants` data is migrated (see §9).

## 6. Data model (Drizzle)

New/changed tables (illustrative):

```ts
export const versionStatus = pgEnum('version_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);

// templates  (evolves template_groups)
templateKey    varchar(255) unique notNull
name           varchar(255) notNull
description    varchar(500)
messageType    message_types notNull
category       varchar(100)
variableSchema jsonb notNull default '{}'
isActive       boolean notNull default true

// template_versions
templateId     bigint fk→templates cascade
version        int notNull
status         version_status notNull default 'DRAFT'
notes          varchar(1000)
editedBy       varchar(255)
publishedAt    timestamp
// unique(templateId, version); partial unique index (templateId) WHERE status='PUBLISHED'

// template_contents  (evolves template_variants — versioned, body is text)
templateVersionId bigint fk→template_versions cascade
channel           notification_channel notNull
locale            varchar(10) notNull default 'en-ZZ'
subject           varchar(255)
body              text notNull           // <- was varchar(5000)
layoutId          bigint fk→layouts null // email only
// unique(templateVersionId, channel, locale)

// layouts + layout_versions, partials + partial_versions   — same version pattern
// template_audit (or reuse the audit module): actor, entity, entityId, version, action, diff, ts
```

`template_channel_settings` is retained (which channels a template supports). `notification_messages.rendered_body` is already `text` (done in the prior email work).

## 7. Removing templates from code (the explicit ask)

1. **Delete** `src/modules/notification/email/` (`renderEmailDocument` + tokens) and the branded-shell wrap in `notification-provider.service.ts`. Rendering composes the **published Layout** from the CMS instead.
2. **Delete** the template bodies/subjects/groups/channel-settings from `scripts/seed-data/template-*.data.ts`.
3. Replace the destructive `db:seed` (`TRUNCATE … RESTART IDENTITY CASCADE`) with an **idempotent baseline bootstrap**: on a fresh environment it publishes a baseline **content pack** (default email layout, partials, and the current identity templates) **only if absent**, records that it ran (a data-migration marker), and **never overwrites runtime edits**. After first boot the **database is the sole source of truth**; the repository contains **no template bodies or layouts** on the runtime path.
   - The baseline pack is shipped as **installable fixtures** (a versioned "starter theme," the standard CMS way to provision a clean environment) — clearly labelled as first-run seed, not the live source. If you prefer **zero** template artifacts in the repo, the alternative is an **empty start**: deploy with no templates and author the baseline via the admin API/UI. Recommendation: idempotent fixtures (reproducible environments + disaster recovery); happy to do empty-start if that is the stricter reading you want. See §12.

## 8. Rollout plan (phased, each shippable & reversible)

1. **Schema & versioning** — add versioned tables; write a migration that folds every existing `template_variant` into a `PUBLISHED` v1 with content; keep the current renderer reading v1. (No behaviour change.)
2. **Engine swap** — introduce LiquidJS (+ MJML/juice for email) behind the existing render call; port the current fragments/shell to Liquid layout+partials as published fixtures; golden-file tests assert byte-comparable output to today's emails. Delete `email-layout.ts`.
3. **Authoring lifecycle** — draft/validate/preview/publish/rollback API + the published render-bundle cache; retire in-place `PATCH` of live content.
4. **Variable schema** — declare schemas for the identity catalogue; enforce at send + author time.
5. **Governance** — granular permissions, audit, optional four-eyes; `pulse-web` template studio.
6. **De-seed** — remove template bodies from code; switch to idempotent baseline bootstrap.

Feature-flag the new resolver so we can fall back to the v1-variant path during rollout.

## 9. Security considerations

- **Sandboxed engine** (Liquid strict mode): no code exec, no I/O, bounded iterations, render timeout, max output size.
- **Auto-escaping**: recipient/payload data is HTML-escaped by default; `| raw` is disallowed for `payload.*` and only permitted for trusted composed regions.
- **Author-time validation** on publish: compile check, undeclared-variable rejection, referenced layout/partial must exist and be published, size limits.
- **Least privilege**: content authors can't edit the brand layout; publish is a distinct permission; all changes audited.
- **Blast-radius**: a broken draft can never reach a recipient (only PUBLISHED sends); rollback is one call.

## 10. Alternatives considered

| Decision         | Options                                                                                                                                                                                                                                           | Choice & why                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine           | Keep **Mustache** (min change, but no layouts/partials/filters → design system stays in code) · **Handlebars** (powerful but needs careful sandboxing) · **Liquid** (sandboxed, user-safe, layouts/partials/filters) · **MJML-only** (email-only) | **Liquid** for authoring + **MJML** for the email layout. Sandboxing for user-edited templates is the deciding factor.                                                              |
| Layout           | Keep design system **as code** (content in CMS) · **Managed in CMS**                                                                                                                                                                              | **Managed in CMS** — you explicitly want it runtime-editable. Tradeoff: layout edits carry rendering risk, mitigated by permissions + validation + versioning + preview + rollback. |
| Versioning       | **Mutate in place** (today; no history) · **Version table**                                                                                                                                                                                       | **Version table** — history, rollback, immutability are core CMS requirements.                                                                                                      |
| Baseline content | **Keep destructive seed** (DB not authoritative) · **Idempotent fixtures** · **Empty start**                                                                                                                                                      | **Idempotent fixtures** (reproducible envs, DR) with **empty-start** offered if you want zero repo artifacts.                                                                       |

## 11. Risks & mitigations

- _Render regressions during engine swap_ → golden-file tests comparing new output to current emails; feature-flag + fallback resolver.
- _Performance of compile/MJML on the hot path_ → do it at publish, cache the render bundle; per-send is fast interpolation.
- _Editors breaking the brand_ → layout behind `pulse:layouts:write`, validation on publish, instant rollback.
- _RBAC drift with identity_ → the permission catalogue stays declared in `rbac.constants.ts` and seeded by identity; extend both together.
- _Migration data loss_ → the fold-to-v1 migration is additive and reversible; no `TRUNCATE`.

## 12. Open questions

1. **Empty-start vs baseline fixtures** — do you want _literally zero_ template artifacts in the repo (author everything post-deploy), or an idempotent starter pack for reproducible environments? (I recommend the latter.)
2. **Four-eyes publishing** — required for all templates, only `PROMOTIONAL`, or off for now?
3. **Engine** — comfortable standardising on Liquid + MJML, or is there a preferred stack?
4. **Scope of the first delivery** — full RFC, or land Phases 1–2 (versioning + engine + de-seed) first and iterate?

---

_Appendix: files removed/changed — deletes `src/modules/notification/email/*` and the seed template data; evolves `src/database/schemas/templates.ts`, `src/modules/template/**`, `notification-provider.service.ts`; adds a rendering/engine module, layouts/partials modules, and the authoring lifecycle. Public `POST /api/v1/notifications` unchanged._
