# Chat Revamp — Scope-free, Streaming Refinement Chat

> Supersedes the scope-selection half of `docs/chat-hub-design.md` (§1.1 decision 4, §4.3) and
> `docs/interactive-refinement-design.md` §5.2's per-scope playbooks. Everything else in both documents —
> the op grammar, the apply engine, inverse capture, revert/rollback — stands unchanged.
> Mockup: https://claude.ai/artifact/HbBJS6NJwrbnTn1ap8Q7K1

## 1. Intent

The chat stops asking the author to classify their question before they ask it. There is one conversation,
it can see the whole novel, and it reads what it needs through read-only lookups instead of being handed a
pre-packed scope. Permission is asked at the only moment it means anything — when Forge wants to write to
canon — not up front in a dialog nobody can answer correctly.

Four product changes:

1. **No new-chat dialog.** "New" opens an empty conversation; the session is created on the first message.
2. **No scope.** Every chat is the hub. The model fetches artifacts through lookups.
3. **Auto-generated titles**, on the cheap `title` role, with the author able to rename at any time.
4. **Streamed replies**, with the lookups visible as they run.

## 2. Decisions

| #   | Decision                                                                                                       | Rationale                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Scopes are removed at the **application layer**; the `chat_scope` pgEnum keeps its 9 values                    | Postgres cannot drop enum values, and the row backfill cannot be expressed through `drizzle-kit generate`. No migration is needed for this change, and legacy scoped sessions keep opening. |
| D2  | Five artifact-read lookup tools are added before scope removal ships                                           | The hub pack carries bible-doc **first lines only**, yet the hub may `bible_document.upsert` a whole body. Without the tools, scope removal is a data-loss bug, not a UX change.            |
| D3  | The Manual / Auto toggle stays in the composer, unchanged                                                      | Per-turn approval is the default; removing the up-front dialog is the whole ask.                                                                                                            |
| D4  | Titles are generated **in parallel** with the first turn, from the user's opening message alone                | The name usually lands before the reply. Skipped when the opener is trivial; written only while `title IS NULL`, so a rename is permanent.                                                  |
| D5  | Replies stream over SSE on the existing `EventStream`, reusing the project-events transport pattern            | `packages/fastify/src/classes/event-stream.ts` already handles hijack, heartbeat, lifetime and graceful shutdown.                                                                           |
| D6  | The displayed stream is advisory; the accumulated string still goes through the existing parse + repair ladder | The repair ladder cannot un-show text. On a repair the client is sent a `reset` and re-renders from the authoritative reply.                                                                |
| D7  | `ForgeBar` opens a hub session seeded with `[context: <ref>]`                                                  | It loses its cheap scoped pack; the model fetches the record itself with the new tools.                                                                                                     |

### 2.1 Known cost of D2/D7

Every turn now pays the 20k-token hub pack (was 16k scoped) and up to four sequential model calls (was
one). `ForgeBar` presses are the worst case. Mitigated by keeping the hub's stable pack as an _index_ —
inventories and one-line summaries — and letting lookups pull detail. Accepted deliberately.

### 2.2 Migration policy

This plan needs **no migrations**. If one becomes necessary: edit `src/database/schemas/*.ts`, then
`bun scripts/db.ts novel-forge-server generate`, then `bun scripts/db.ts novel-forge-server migrate`.
Never hand-edit anything under `generated/drizzle`.

## 3. Lookup vocabulary

Existing (`allowedNodes` already includes `chat-hub`): `search_lore`, `get_entity`,
`get_chapter_summaries`, `search_prose`, `get_world_facts`, `get_plot_threads`.

New, all read-only, all on the `chat-hub` node:

```
get_bible_document { section, slug }   → full body + section/slug
get_volume         { volumeKey }       → full volume record
get_arc            { arcKey }          → full arc record + its brief chapter span
get_brief          { chapter }         → full brief incl. ending contract + knowledgeContract
get_draft          { chapter }         → draft title/body/summary/status/revision
```

The hub playbook gains a hard rule: a turn may not propose `bible_document.upsert`, `volume.upsert`,
`arc.upsert`, `brief.update` or `draft.update` for an artifact it has not fetched in that same turn.
`volume.upsert` and `arc.upsert` are in the list because they overwrite whole records too, and volumes
and arcs reach the model only as one-line summaries.

Because the turn schema forbids `lookups` and `changeSet` in one response, editing an artifact is
inherently two-step: a turn that needs more than the index spends itself on lookups and proposes the
change-set on the next round.

## 4. Stream protocol

Two calls, decided 2026-09-19. `POST` starts the turn and returns its `runId` at once; the client then
opens the stream for that run. A `GET` carrying the message in its query string was rejected: the turn is a
mutation that persists a row, and a long opening message does not belong in a URL.

```
POST /api/v1/projects/:projectId/chats/:sessionId/turn/stream   -> { runId }
GET  /api/v1/projects/:projectId/turns/:runId/stream            -> text/event-stream
```

The gap between the POST returning and the GET connecting is real, so **the server buffers every event it
emits for a run** and replays the backlog to the first subscriber on connect. Without that, the opening
deltas of a fast turn are lost. The buffer is keyed by `runId`, bounded, and dropped when the turn ends and
its stream closes — or by a TTL, so a client that never connects cannot leak one.

| Event    | Payload                                                       | When                                                          |
| -------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `ready`  | `{}`                                                          | subscription taken, backlog about to replay                   |
| `user`   | `ChatMessageResponse`                                         | the user message is persisted                                 |
| `lookup` | `{ round, tool, args, status: 'running' \| 'ok' \| 'error' }` | each declared lookup                                          |
| `delta`  | `{ text }`                                                    | a chunk of the `reply` field, scanned out of the partial JSON |
| `reset`  | `{}`                                                          | the deltas so far are void — discard them and start again     |
| `done`   | `ChatTurnResult`                                              | transcript, proposal and apply result, exactly today's shape  |
| `error`  | `{ code, message }`                                           | the turn failed; the existing failed-turn card takes over     |

A `llm_cache` hit emits one `delta` carrying the whole reply.

`reset` has two causes, and the client handles both the same way — drop everything streamed so far and render what
follows. The repair ladder replaced the reply it had already streamed (D6), or a declared-lookup round superseded it:
each round re-invokes the model, so the reply streamed before the lookups ran is not the reply the turn persists. In
the lookup case the reset is deliberately withheld until the replacement's first `delta`, so the interim reply — the
model narrating what it is fetching — stays on screen while the lookups run instead of blanking the composer, and a
round that streams nothing at all (§4.1) never blanks it either.

### 4.1 When the model defeats the stream

Key order is the model's choice: the schema shows `reply` first and grammar-constrained decoding on Ollama
guarantees it, but a hosted model may emit `changeSet` first. The D1 scanner is key-order agnostic — it
picks up a top-level `reply` wherever in the object it arrives — so key order costs **latency only**: the
deltas start once the preceding keys have gone by, and the author waits meanwhile on a composer that shows
nothing.

The degradation this section covers is the harder case: a response carrying no top-level `reply` string at
all, so no delta is ever produced and the client renders the finished reply from `done` —
indistinguishable from today's behaviour. That is what `ReplyStreamScanner.replyFound === false` detects
once the whole response has arrived.

It is silent to the author and **must be logged**: a structured warn naming the resolved provider, the
model and the prompt key, so how often a given model defeats the stream is measurable from logs rather
than guessed at. The turn itself never fails for this reason.

---

# Task breakdown

Tiers per `plan-orchestrator`: **Low** = boilerplate/well-specified, **Medium** = several files or some
judgment, **High** = new abstraction, ambiguity, or a large single-file rewrite.

Groups are serial with respect to each other. Within a group, tasks marked ∥ touch disjoint files and are
parallel-eligible; tasks marked ⇢ share a file with their group siblings and must run serially.

## Group A — server: scope removal

| id  | Task                                                                                                                                                                                                                                                                                      | Tier   | ∥   | Files                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- | ---------------------------------------------------------------------------------------------------------- |
| A1  | `CreateChatSessionBody` drops `scopeType`/`scopeRef`/`title`; `ChatService.createSession` always writes `scopeType:'project'`, `scopeRef:null`, `title:null`, honouring only `mode`. `validateScopeRef` stays for legacy rows on the `turn` path. Update `tests/refinement/chat.spec.ts`. | Medium | ⇢   | `modules/refinement/chat.dto.ts`, `chat.service.ts`, `chat.controller.ts`, `tests/refinement/chat.spec.ts` |
| A2  | `SCOPE_PLAYBOOKS` keeps only `project` and `ideation`. `renderScopeInstructions`/`scopeAllowedOps` map every non-`ideation` scope to the `project` playbook so legacy rows still answer. Delete `SCOPE_CHAT_ROLE`; `resolveSessionModel` uses role `'chat'` for everything but ideation.  | Medium | ⇢   | `modules/ai/prompts/scope-playbooks.ts`, `modules/refinement/chat.service.ts`                              |
| A3  | Remove the `isHub` gate at `chat.service.ts:361` and `:381` — the lookup vocabulary and the declared-lookup loop run for every non-ideation turn.                                                                                                                                         | Low    | ⇢   | `modules/refinement/chat.service.ts`, `tests/refinement/chat.spec.ts`                                      |
| A4  | `ContextAssembler.forChatTurn` collapses to `project` + `ideation`; delete the six dead scope cases. Keep the hub's stable segment as an **index** (premise, doc inventory first-lines, volume lines, arc inventory, catalog) so 20k still holds with lookups doing the rest.             | High   | ⇢   | `modules/ai/context/context-assembler.service.ts`, `tests/ai/context-refinement.spec.ts`                   |

## Group B — server: read tools

| id  | Task                                                                                                                                                                                                                                                                                                                                          | Tier   | ∥   | Files                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- | ------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Five new read-only tools — `get_bible_document`, `get_volume`, `get_arc`, `get_brief`, `get_draft` — each following the existing `RegisteredTool` shape (zod in/out schema, `tokensBudget`, `maxCallsPerRun`, `allowedNodes: ['chat-hub']`), registered in `ALL_TOOLS`. Handlers use `ctx.db.query` only (the `ReadonlyDb` type enforces it). | Medium | ⇢   | `modules/ai/tools/tools/*.tool.ts` (5 new), `modules/ai/tools/tool-registry.service.ts`, new `tests/ai/chat-read-tools.spec.ts` |
| B2  | Hub playbook gains the read-before-overwrite rule for `bible_document.upsert` / `brief.update` / `draft.update`, and the new tools are named in its guidance.                                                                                                                                                                                 | Low    | ∥   | `modules/ai/prompts/scope-playbooks.ts`                                                                                         |

## Group C — server: auto-title

| id  | Task                                                                                                                                                                                                                                                                                                                                                                | Tier   | ∥   | Files                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- | ------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | `chat-title` prompt on role `title`, schema `{ title: string }`, modelled on `idea-name.prompt.ts`: 2–6 words naming _this_ request, no quotes, no trailing punctuation.                                                                                                                                                                                            | Low    | ∥   | new `modules/ai/prompts/chat-title.prompt.ts`, new `modules/ai/schemas/chat-title.schema.ts`, `prompts/index.ts`, `schemas/index.ts` |
| C2  | `ChatService.nameSession(projectId, session, content)` — fired without `await` from `turn()` when `session.title === null`, the session has no prior messages, and `content.trim().length >= 15`. Writes only while the title is still null (guarded `UPDATE … WHERE title IS NULL`), then publishes `{ type:'chat', sessionId }`. A failure logs and is swallowed. | Medium | ⇢   | `modules/refinement/chat.service.ts`, new `tests/refinement/chat-title.spec.ts`                                                      |

## Group D — server: streaming

| id  | Task                                                                                                                                                                                                                                                                                                                                                               | Tier   | ∥   | Files                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --- | ------------------------------------------------------------------------------------- |
| D1  | `ReplyStreamScanner` — a pure incremental scanner fed raw chunks of a JSON object, emitting unescaped deltas of the `reply` string field and nothing else. Handles split escapes, `\u` sequences, chunk boundaries mid-key, and a `reply` key that never arrives. Unit-tested against chunkings of the same payload.                                               | Medium | ∥   | new `modules/ai/reply-stream-scanner.ts`, new `tests/ai/reply-stream-scanner.spec.ts` |
| D2  | `ModelRouterService.streamStructured` — sibling of `runStructured` taking an `onDelta(text)` callback. Uses `llm.stream()`, accumulates the full string, drives `D1`, and returns the same parsed+repaired `T` through the existing ladder. A `llm_cache` hit emits one delta and skips the model. Same quota, telemetry and timeout treatment as `runStructured`. | High   | ⇢   | `modules/ai/model-router.service.ts`                                                  |
| D3  | `ChatService.turnStreamed` — `turn()` refactored to take an optional emitter, calling it for each lookup's start/finish and each reply delta, and returning today's `ChatTurnResult` unchanged. The non-streaming `turn()` stays as the emitter-less call so `ForgeBar` and the tests keep working.                                                                | High   | ⇢   | `modules/refinement/chat.service.ts`, `tests/refinement/chat.spec.ts`                 |
| D4  | SSE route on `ChatController` opening an `EventStream` and driving `turnStreamed`, emitting the §4 protocol. Client disconnect must not abort the turn — the run completes and persists, exactly as a closed tab does today.                                                                                                                                       | High   | ⇢   | `modules/refinement/chat.controller.ts`, `chat.dto.ts`                                |

## Group E — contract

| id  | Task                                                                                                                                                                                                                                    | Tier   | ∥   | Files                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- | ------------------------------------------------------------- |
| E1  | Regenerate the web API types against the changed server DTOs and fix every caller the change breaks. `bun scripts/gen-api-types.ts novel-forge-web`, then `--check` to confirm. **Must run after Group A and Group D, before Group F.** | Medium | ⇢   | `apps/novel-forge-web/src/lib/apis/api-types.gen.ts`, callers |

## Group F — web

| id  | Task                                                                                                                                                                                                                                                                     | Tier   | ∥   | Files                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --- | ---------------------------------------------------------------------------- |
| F1  | Delete `NewChatDialog` and `SCOPE_OPTIONS`. "New" navigates to `?session=new`, rendering a draft thread: centered hero, "What are we working on?", five suggestion chips, the normal composer. No session row, no server call.                                           | High   | ⇢   | `routes/novels/$novelId/chat.tsx`, `chat.module.css`                         |
| F2  | First send on a draft: `createSession({ mode })` → `navigate({ session: id })` → run the turn. A failed turn leaves the real session with its user message, which the existing `failedTurn` card already renders as retryable.                                           | Medium | ⇢   | `routes/novels/$novelId/chat.tsx`, `lib/apis/refinement.api.ts`              |
| F3  | `useChatTurnStream` — opens the SSE route, reduces `lookup`/`delta`/`reset`/`done`/`error` into local turn state, falls back to the existing `useChatTurnMutation` when `EventSource` is unavailable (SSR, old browsers).                                                | High   | ⇢   | `lib/apis/refinement.api.ts`                                                 |
| F4  | `LookupTrace` component — live list of tool + args while running, collapsing to a single grey summary line when the turn lands.                                                                                                                                          | Medium | ∥   | new `components/nf/LookupTrace.tsx`, `.module.css`, `components/nf/index.ts` |
| F5  | Inline rename: `⋯` row menu in the rail and a click on the thread-head title, both committing through the existing `useUpdateChatSessionMutation`. Escape cancels, Enter commits, empty is rejected.                                                                     | Medium | ⇢   | `routes/novels/$novelId/chat.tsx`, `chat.module.css`                         |
| F6  | Rail date buckets — Today / Previous 7 days / Previous 30 days / Older, on `lastTurnAt ?? updatedAt`, keeping the Active/Archived filter. Untitled sessions render as "New chat"; a session being named renders "Naming…".                                               | Low    | ⇢   | `routes/novels/$novelId/chat.tsx`, `chat.module.css`                         |
| F7  | Strip the remaining scope UI: the `scope:`/`hub` chips in the thread head and rail rows, the scope-dependent placeholder and empty-hint copy, and `ChatModelMenu`'s `scopeType` prop. Forge's avatar becomes `BookIcon` (the app brand mark) instead of `ProposalsIcon`. | Medium | ⇢   | `routes/novels/$novelId/chat.tsx`, `components/nf/ChatModel.tsx`             |
| F8  | `ForgeBar` opens a hub session (no scope) held in component state for the page visit, and prefixes the first message with `[context: <scope.ref or scope.title>]`. Its `scopeRef`+`title` session matching is removed.                                                   | Medium | ∥   | `components/nf/ForgeBar.tsx`                                                 |

## Group G — verification

| id  | Task                                                                                                                                                                     | Tier   | ∥   | Files |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --- | ----- |
| G1  | `bun scripts/verify.ts novel-forge-server`, `bun scripts/verify.ts novel-forge-web`, and `bun scripts/gen-api-types.ts novel-forge-web --check`. Fix whatever falls out. | Medium | ⇢   | —     |

## Ordering

```
A1 → A2 → A3 → A4        (serial, same files)
B1 ∥ B2                  (after A2 — B2 edits the playbook A2 rewrites)
C1 ∥ (C2 after A1)
D1 → D2 → D3 → D4        (serial; D3 after A3)
E1                       (after A, D)
F1 → F2 → F5 → F6 → F7   (serial, all chat.tsx)
F3, F4, F8               (∥ with the F chain)
G1                       (last)
```
