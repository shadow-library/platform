# Rail, Stop, and Admin — Novel Forge

> Three unrelated changes bundled into one run because they all touch the project shell.
> Mockup: https://claude.ai/artifact/4KQbyeVV6fX97tHhMttL67
> Decided with the product owner on 2026-09-19.

## 1. Intent

1. **The rail is too wide.** `--nf-rail-width: 380px` is set once in `apps/novel-forge-web/src/styles.css` and applies to all seven split-pane pages. It is wider than the 254px main sidebar. On most pages it holds a filter and a short list; on an empty project it holds a filter and the words "No entities yet". Its rows are wasteful too — a stacked card per item, ~76px to show one chat's name.
2. **Nothing can be stopped.** There is no way to cancel a chat turn, a workflow run, or a queued generation job. `workflow_run_status` already carries a `cancelled` value that only `checkpoint.janitor.ts` reads — nothing sets it.
3. **Workflow Runs is a debugger in the author's sidebar.** Prompt anatomy, token shares, per-call latency and raw model output are for diagnosing the pipeline, not for writing a novel.

## 2. Decisions

| #   | Decision                                                                                           | Rationale                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Rail narrows to **240px**; each page's explanatory blurb moves into the detail pane's empty state  | Measured: the main sidebar is 254px (`Sidebar.module.css:11`), so at 380px the second panel was 126px WIDER than the app's own navigation — the hierarchy read backwards. 240 puts the rail deliberately below the nav. The blurb is onboarding copy competing for vertical space in a narrow column while an empty pane sits beside it. |
| D1b | `.nf-selrow-stack` flattens from a stacked card to a single line                                   | A chat row spends ~76px to show one name: 12px padding, a 5px gap, a line holding only a timestamp and three hover icons, then the title below. One line — title left, time right, actions replacing the time on hover — is ~32px.                                                                                                       |
| D2  | Rejected a collapsible rail and rejected removing the rail on single-select pages                  | A collapse toggle is a second state to keep honest on seven pages; removing the rail rewrites six navigations and leaves Refinement Chat inconsistent with them.                                                                                                                                                                         |
| D3  | Stop covers **live runs and queued jobs**                                                          | Stopping only the chat turn leaves the expensive thing — a queued chapter generation — unstoppable, which is the case an author actually needs.                                                                                                                                                                                          |
| D4  | A run is cancelled through an in-process `AbortController` registry keyed by `runId`               | `streamStructured` already threads an `AbortSignal` into `llm.stream()`. Same single-replica caveat as `ProjectEventService`; recorded, not solved here.                                                                                                                                                                                 |
| D5  | Cancelling an `in_progress` job sets `cancelRequestedAt`, not `status`                             | The worker calls `succeed()`/`fail()` when `runJob` returns and would overwrite a status written underneath it. The worker must observe the request and convert it.                                                                                                                                                                      |
| D6  | A cancelled run/job is a **terminal, non-retrying** state that keeps whatever it already persisted | Cancelling must not silently undo committed work; the author is told what was kept. Distinct from `failed`, which a retry ladder may re-attempt.                                                                                                                                                                                         |
| D7  | Admin is a new `novel-forge:admin` scope, gating the API as well as the nav                        | Reusing `novel-forge:curate` would conflate "can curate content" with "can read debug internals". Hiding the nav alone leaves the endpoints open.                                                                                                                                                                                        |

### 2.1 Known limits

- **Cancellation is process-local.** The abort registry lives in memory, so a cancel only reaches a run owned by the replica that received the request. This matches `ProjectEventService`'s existing in-process fan-out and its comment; the fix for both is the same (Postgres LISTEN/NOTIFY) and is out of scope.
- **A job is cancelled at a step boundary, not mid-model-call.** An `in_progress` job inside a long LLM call finishes that call before it notices. Aborting mid-call would mean threading cancellation through every generation graph, not just the chat one — deliberately excluded (the product owner was offered it and chose not to).
- **Granting the scope is a manual step.** Workflow Runs disappears for everyone until `novel-forge:admin` is granted in the identity provider.

## 3. Migration

This run **does** need one: `job_status` gains `cancelled`, and `jobs` gains `cancel_requested_at`.

Adding an enum value is `ALTER TYPE … ADD VALUE`, which Postgres supports — unlike the value _removal_ that made the chat revamp application-layer only. Procedure, per the standing rule: edit `src/database/schemas/jobs.ts`, then `bun scripts/db.ts novel-forge-server generate`, then `bun scripts/db.ts novel-forge-server migrate`. **Never hand-edit anything under `generated/drizzle`.**

Risk to check when generating: `ALTER TYPE … ADD VALUE` historically could not run inside a transaction block, and drizzle wraps migrations in one. Postgres 12+ permits it provided the new value is not _used_ in the same transaction. Verify the generated migration applies cleanly against the template database before moving on.

## 4. Cancellation model

```
                     cancel requested
                            │
   run (in flight) ─────────┼──> AbortController.abort() ──> status 'cancelled'
                            │
   job (pending)   ─────────┼──> status 'cancelled' immediately, never dispatched
                            │
   job (in_progress) ───────┴──> cancel_requested_at = now()
                                   worker checks at the next step boundary,
                                   aborts its current run, writes 'cancelled'
```

A job that owns a workflow run cancels that run too — otherwise the model call keeps burning tokens after the author has stopped the job.

---

# Task breakdown

Tiers per `plan-orchestrator`. Groups are serial. Within a group, ∥ marks tasks touching disjoint files.

## Group R — the rail

| id  | Task                                                                                                                                                                                                                                                                                                                                                                                                      | Tier   | ∥   | Files                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- | ------------------------------------------------------------------------ |
| R1  | `--nf-rail-width` 380px → **240px**. Then audit **all seven** split-pane pages at the new width for truncation, wrapping and overflow — rail heads with buttons, filter rows, stacked list rows, timestamps. Fix what breaks. Do not change any page's content in this task, only fit.                                                                                                                    | Medium | ⇢   | `apps/novel-forge-web/src/styles.css`, per-page `*.module.css` as needed |
| R4  | Flatten `.nf-selrow-stack` to a single line: title left and truncating, relative time right, row actions replacing the time on hover and on keyboard focus. Target ~32px. **It is a shared class** — find every rail using it and check each, do not assume it is only the chat's. A row that genuinely needs a second line (a session summary, a status chip) must be handled deliberately, not clipped. | Medium | ⇢   | `apps/novel-forge-web/src/styles.css`, consumers of `nf-selrow-stack`    |
| R2  | Move each page's explanatory blurb from the rail into that page's detail-pane empty state: Canon Facts ("The spoiler ledger…"), Illustrations ("Forge composes each prompt…"), and any other page carrying one — find them all. The blurb must not appear twice, and must still be reachable when the detail pane has a selection.                                                                        | Medium | ⇢   | `apps/novel-forge-web/src/routes/novels/$novelId/*.tsx`                  |
| R3  | Story Bible's entity-type filter becomes chips rather than the 58px `SHOWING / All types` card. Keep it keyboard-navigable and keep whatever the current control does about types with zero entities.                                                                                                                                                                                                     | Low    | ⇢   | `apps/novel-forge-web/src/routes/novels/$novelId/story-bible.tsx` + css  |

| R5 | Replace the favicon. It is currently the Shadow Library "S" on a non-square `-30 -30 350 470` viewBox, carrying a `@keyframes glow-pulse` animation and two drop-shadow filters — squished, muddy and animated at 16px. Use the app's own book mark on a square viewBox, following `web-novel-web`'s rounded-square-plus-white-glyph pattern with Novel Forge's indigo. Also fix `manifest.json`: it references a `logo.png` that does not exist, and its `theme_color` is the old purple rather than `#4f46e5`. | Low | ∥ | `apps/novel-forge-web/public/favicon.svg`, `public/manifest.json` |

## Group S — stopping work

| id  | Task                                                                                                                                                                                                                                                                                                                   | Tier   | ∥   | Files                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- | --------------------------------------------------------------------------------- |
| S1  | An abort registry on `WorkflowRunService`: register an `AbortController` per `runId` for the life of a run, expose `cancel(runId)`, and always deregister on settle. Thread the signal into the existing model-call path (`streamStructured` already takes one). Must not leak a controller for a crashed run.         | High   | ⇢   | `modules/ai/graphs/workflow-run.service.ts`, `modules/ai/model-router.service.ts` |
| S2  | `POST /api/v1/projects/:projectId/runs/:runId/cancel` — aborts through S1 and writes `status: 'cancelled'` with `endedAt`. Idempotent; a run that already settled answers cleanly rather than erroring. New error code if one is warranted. Same guards as the other run routes.                                       | Medium | ⇢   | `modules/generation/generation.controller.ts`, `generation.service.ts`, dto       |
| S3  | **Migration.** `job_status` gains `cancelled`; `jobs` gains `cancel_requested_at timestamp`. Edit the schema, then `bun scripts/db.ts novel-forge-server generate`, then `… migrate`. Never hand-edit `generated/drizzle`. Verify the generated SQL applies to the template DB (see §3's transaction caveat).          | High   | ⇢   | `src/database/schemas/jobs.ts`, `generated/drizzle` (generated only)              |
| S4  | `JobService.cancel(jobId)`: a `pending` job goes straight to `cancelled` and is never dispatched; an `in_progress` job gets `cancelRequestedAt`. Plus `POST /jobs/:jobId/cancel`.                                                                                                                                      | Medium | ⇢   | `modules/jobs/job.service.ts`, `jobs.controller.ts`, `jobs.dto.ts`                |
| S5  | The executor observes cancellation: check `cancelRequestedAt` at each step boundary in `runJob`, abort the job's current workflow run through S1, and write `cancelled` rather than letting `succeed()`/`fail()` win (D5). Also re-check after the concurrency lock is acquired — a job can be cancelled while queued. | High   | ⇢   | `modules/jobs/job.executor.ts`                                                    |
| S6  | Web: **Send becomes Stop** while a turn streams. Stopping closes the stream, calls S2, and leaves the partial text with a "stopped" marker — not an error card. Reuse the `error`-keeps-partial precedent from the chat revamp's §4 rather than inventing a third terminal state.                                      | Medium | ⇢   | `routes/novels/$novelId/chat.tsx`, `lib/apis/refinement.api.ts`                   |
| S7  | Web: a **Stop** control wherever a run or job is shown live — the Overview's running-run card and any job progress surface. A cancelled run/job renders as its own state (not failed), says what was kept, and offers a re-run.                                                                                        | Medium | ⇢   | `routes/novels/$novelId/overview.tsx`, run/job components                         |

## Group N — the admin gate

| id  | Task                                                                                                                                                                                                                             | Tier   | ∥   | Files                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- | ------------------------------------------------------------------ |
| N1  | `ADMIN_PERMISSION = 'novel-forge:admin'`, gating the run-inspection endpoints — `listRuns`, `getRun`, `getRunCall`, `getRunContext`. Decide deliberately whether the Overview's own run card needs a non-admin path, and say so. | Medium | ⇢   | `src/constants.ts`, `modules/generation/generation.controller.ts`  |
| N2  | Web: the Workflow Runs nav entry and its route are admin-only. The session already carries `scopes: string[]`. A non-admin reaching `/novels/$id/runs` by URL must be refused, not shown an empty page.                          | Medium | ⇢   | `components/Layout/screens.tsx`, `routes/novels/$novelId/runs.tsx` |

## Group X — contract and verification

| id  | Task                                                                                                                                                                | Tier   | ∥   | Files                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- | --------------------------- |
| X1  | Regenerate the web API types for the new cancel routes and the admin gating, and fix every caller. **Hard gate: must run after all of S and N, before S6/S7 land.** | Medium | ⇢   | `lib/apis/api-types.gen.ts` |
| X2  | `bun scripts/verify.ts apps/novel-forge-server`, `… apps/novel-forge-web`, and `bun scripts/gen-api-types.ts novel-forge-web --check`.                              | Medium | ⇢   | —                           |

## Ordering

```
R1 → R4 → R2 → R3 → R5           (rail; R1/R4 are both styles.css, R5 is assets only)
S1 → S2                          (run cancellation)
S3 → S4 → S5                     (job cancellation; S3 is the migration)
N1 → N2
X1                               (after S1-S5 and N1; before the web halves)
S6 → S7                          (web stop UI, needs X1's types)
X2                               (last)
```
