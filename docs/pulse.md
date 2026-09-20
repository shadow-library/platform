# Pulse

Notification service and operations console. Other apps send a message by template key; Pulse renders it, picks a sender, delivers it and logs the outcome.
`pulse-server` is the API and delivery engine; `pulse-web` is a thin admin console over it (no business logic). Authentication is Identity's job (`docs/identity.md`).

## Concepts

- Channels: EMAIL, SMS, PUSH only. A send fans out to every channel enabled on the template; an inactive template accepts the call and sends nothing.
- Template: stable `templateKey` with message type, priority, per-channel flags and a variable schema (the producer-to-template contract).
- Version: immutable snapshot of content per (channel, locale); DRAFT, PUBLISHED or ARCHIVED. Layout (email shell) and partial (Liquid block) are versioned the same way.
- Sender profile: bundle of weighted endpoints per channel/provider. Only DEV (logs only, sends nothing) and RESEND (email) work; other providers are enum stubs that fail.
- Routing rule: (service, region, messageType), each nullable, mapping to a profile. Precedence most-specific first, ending at the global all-null rule.

## Architecture

- Producers call Pulse server-to-server: `identity` (auth/security/user/org/bot templates) and `shadow-memoir-server` (memoir-*). Each needs a service-access rule in Identity.
- Producers only enqueue: Pulse answers with per-channel QUEUED/FAILED and delivers afterwards, in-process. A producer needing durability keeps its own worker-drained outbox (identity and memoir do); Pulse has no retry worker.
- Send validates the payload once, then per channel inserts a job pinned to the published version id. Delivery composes that pinned content with the CURRENT
  layout and partials, picks rule and endpoint (attempt index into the weight-ordered active endpoints, so today always the heaviest), renders (sandboxed LiquidJS) and hands to the provider.
- A baseline seed creates the default layout, partials and the template catalogue producers rely on; it only creates what is absent, never overwrites edits.
- Published content is cached in-process; change it only through publish, never by editing rows.
- `pulse-web` calls same-origin `/api/*` in the browser and `pulse-server` directly during SSR, and authenticates via Identity; its `api-types.gen.ts` is generated from `pulse-server`.

## Hard rules

- NEVER edit content in place: edits go to the single DRAFT; only PUBLISHED serves live sends.
- MUST keep exactly one PUBLISHED version per template/layout/partial. Only the transactional publish/rollback code enforces it (no DB index); never write statuses elsewhere.
- Template and layout publish MUST be render-gated on sample data; partial publish is NOT. Rollback creates a NEW published copy (history never deleted), templates only.
- A job MUST pin `templateVersionId`; NEVER resolve "latest" at delivery. Layout/partial publishes still hit every template at once, including retries of pinned jobs.
- Missing required payload variables abort the whole send (a producer bug); extra keys pass through and can override globals.
- Locale falls back to `en-ZZ`: keep `en-ZZ` content on every template or an unmatched locale fails that channel.
- A null layout sends the email fragment unwrapped; layouts never apply to SMS/PUSH.
- Auto-escaping is a security boundary on EMAIL bodies (SMS/PUSH and all subjects are plain text): only the framework's `content` slot is unescaped (`| raw` and
  `{% echo %}` are overridden). NEVER weaken it.
- Recipients are masked in info logs and the message-log API, which exists only when `app.stage` is `dev`. The job and message tables still hold raw recipient, payload and
  rendered body (OTP codes, reset links) and `debug` logs the whole job row: NEVER widen that exposure.
- The global routing rule cannot be deleted and rules cannot be created or edited to point at an inactive profile (deactivating a profile later is not checked). No matching rule/endpoint makes the job PERMANENTLY_FAILED.
- The baseline DEV profile and global rule are seeded only outside production; a fresh prod needs an operator-made real profile.
- The RBAC permission catalog MUST match the seed in `identity`; role sync is off, so edit both together. Every route needs an auth decorator or `@Public()` (the SDK's own `/api/auth/*` is exempt); bots are refused everywhere.
- Renaming a template's variables or `templateKey` breaks its producers: change both together, and add any new producer template to the baseline catalogue.
- A server contract change requires regenerating `pulse-web`'s `api-types.gen.ts` and fixing its callers.

## Non-goals

- No visual email builder, campaigns, audiences, A/B or scheduling; transactional only. No audit trail, four-eyes approval or test-send. No WhatsApp.

## Open work

- Retries never run: jobs execute once at send time, FAILED jobs get `nextAttemptAt` but no worker picks them up, and a crash leaves jobs PENDING. A gap, not a design.
- No real SMS or PUSH provider exists yet.
