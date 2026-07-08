# Interactive Refinement Design — Novel Forge Server

This document specifies the interactive-refinement subsystem: premise enhancement, bible structure audit, the chat refinement loop, the arc planning tier, ending-contract briefs, and provider prompt caching. It **amends** `python-cli-to-node-api-migration-plan.md` and `ai-system-design.md` where stated in §2; everywhere else those documents remain authoritative. Checklist tasks R1–R10 in `CLAUDE.md` implement this document.

---

## 1. Overview & product flow

The authoring pipeline becomes:

```
overview (rough premise)
  → premise-enhance          (AI upgrades it into a strong web-novel premise — staged proposal)
  → bible-builder            (existing graph; seeds bible from the approved premise)
  → bible-audit              (AI verifies the bible has exactly the sections a web novel needs — staged proposal)
  → volume plan              (existing planner; per-volume targetChapterCount set by the user)
  → arc planning             (NEW tier: AI proposes arcs that exactly fill each volume's chapter count)
  → chapter briefs           (arc-scoped outlining; every brief carries an ending contract)
  → chapter generation       (existing graph; ending contract enforced by generation + judge)
```

**Everything above generation is refinable through chat.** A chat session is scoped to the whole novel or to a single artifact (bible document, volume plan, one volume, a volume's arcs, one arc, one brief). Each user turn produces an assistant reply and, when the model wants to change something, a **staged proposal** — a structured change-set that touches nothing until the user applies it. The same chat loop is how volume count and volume details are generated and iterated.

Design invariants, in order of precedence:

1. The hard rules of `ai-system-design.md` Appendix A (extended by §2.2 below).
2. AI output reaches domain tables **only** through the proposal apply engine (§6).
3. Every AI feature here is a plain chain (one structured call orchestrated by a service) — no new LangGraph graphs, no checkpoints, no paused state.
4. Context per call is scoped, token-budgeted, and split into a **stable** prefix (provider-cacheable) and a **volatile** tail (§10).

---

## 2. Amendments to the existing documents

### 2.1 Migration doc §1.1.16 — arc sub-tier reinstated (new semantics)

§1.1.16 flattened the Python volume→arc hierarchy into a single `Volume` unit. That decision is **amended, not reverted**:

- `Volume` remains the top planning tier and the approval gate it is today (`draft → approved`), and remains the unit the volume-planner writes.
- A new **`Arc`** sub-tier is added *inside* volumes. It is not the Python "arc" (which was the generation unit); it is a narrative-structure unit that partitions a volume's chapters into escalation blocks, each with its own objective, escalation, payoff, and handoff hook.
- The deterministic chapter→volume mapping changes from a global `chapters_per_volume` constant to **cumulative per-volume `targetChapterCount`**: on `/volumes/approve`, volume ranges are computed as running sums in ordinal order (`vol1 = [1..n1]`, `vol2 = [n1+1..n1+n2]`, …). `generate.chapters_per_volume` remains only as the default seed for `targetChapterCount`.
- *Character arcs* keep their name and JSONB home (`projects.skeletonCharacterArcs`), unchanged.
- Projects without arcs keep today's behavior end-to-end (volume-scoped outlining, no arc gate). `POST /volumes/:volumeKey/arcs/backfill` deterministically creates one volume-spanning arc for legacy projects that want to adopt the tier.

### 2.2 ai-system-design Appendix A — rules 12 and 13

Appended to the one-page contract:

12. Chat is turn-based stateless chains: every turn is a fresh `workflow_runs` row; conversation state lives in `chat_sessions`/`chat_messages`, never in checkpoints.
13. Chat, audit, premise, and arc-plan output never writes domain tables directly — only through a `refinement_proposals` apply.

### 2.3 ai-system-design Appendix B — new tables

The four tables in §3 below (`arcs`, `chat_sessions`, `chat_messages`, `refinement_proposals`) join Appendix B, plus the column additions to `volumes` and `briefs`.

### 2.4 ai-system-design §3 — new purposes and the stable/volatile pack contract

`ContextPurpose` gains `chat`, `arc_plan`, `premise`, `audit`. Every `ContextSection` gains `segment: 'stable' | 'volatile'`; `AssembledPack` gains `renderedStable`/`renderedVolatile` with `rendered` remaining their concatenation (§10.1).

### 2.5 ai-system-design §5 — `cacheStrategy` convention

`PromptModule` gains `cacheStrategy?: { stableVars: string[] }` and the message-ordering convention of §10.2. Enforced by render goldens.

---

## 3. Schema

All Drizzle, one migration (task R1). Conventions match existing schemas (bigserial pks, `projectId` FK cascade, timestamps, snake_case columns).

### 3.1 `arcs` (added to `src/database/schemas/plan.ts`)

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial pk | |
| `projectId` | bigint FK projects cascade | |
| `arcKey` | varchar notNull | stable snake_case id, e.g. `vol_2_arc_1` |
| `volumeKey` | varchar notNull | loose key coupling, same convention as `briefs.volumeKey` |
| `ordinal` | integer notNull default 0 | order within the volume |
| `title` | varchar(500) | |
| `objective` | text | what the arc accomplishes |
| `escalation` | text | conflict/escalation description |
| `payoff` | text | how the arc resolves |
| `hook` | text | how the arc hands off to the next arc (or volume) |
| `chapterStart` / `chapterEnd` | integer | **absolute** chapter numbers; containment inside the parent volume's `[startChapter, endChapter]` is enforced in service code (keeps joins with `briefs.chapter`/`drafts.chapter` trivial) |
| `cast` | jsonb | array of entityKeys |
| `status` | `plan_status` (reused) | arcs use `draft`/`approved` only |
| `body` | text | authored arc prose (ideas, materials, notes) |
| `revision` | integer notNull default 1 | bumped on every write; conflict detection |
| `contentHash` | varchar | sha256 of canonical content serialization |
| `staleReason` | varchar | set when the parent volume changed after arc creation; cleared on re-approve/re-outline |
| `createdAt` / `updatedAt` | timestamp | |

Constraints: `unique(projectId, arcKey)`; `index(projectId, volumeKey, ordinal)`; CHECK `chapter_start <= chapter_end`.

### 3.2 `chat_sessions` (new file `src/database/schemas/refinement.ts`)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk defaultRandom | |
| `projectId` | bigint FK cascade | |
| `scopeType` | pgEnum `chat_scope`: `novel` \| `bible_document` \| `volume_plan` \| `volume` \| `arc_plan` \| `arc` \| `brief` | |
| `scopeRef` | varchar nullable | `doc:<section>/<slug>`, `volume:<volumeKey>`, `arc:<arcKey>`, `chapter:<n>`; null for `novel`/`volume_plan`; `arc_plan` uses `volume:<volumeKey>` |
| `title` | varchar(500) | |
| `status` | pgEnum `chat_session_status`: `active` \| `archived` | |
| `summary` | text nullable | rolling compacted history (§5.4) |
| `summaryThroughOrdinal` | integer notNull default 0 | compaction watermark |
| `lastTurnAt` | timestamp nullable | |
| `createdAt` / `updatedAt` | timestamp | |

Indexes: `(projectId, status)`, `(projectId, scopeType, scopeRef)`.

### 3.3 `chat_messages`

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial pk | |
| `sessionId` | uuid FK chat_sessions cascade | |
| `projectId` | bigint FK cascade | |
| `ordinal` | integer notNull | `unique(sessionId, ordinal)` |
| `role` | pgEnum `chat_message_role`: `user` \| `assistant` | |
| `content` | text notNull | |
| `proposalId` | bigint nullable | → refinement_proposals; set on assistant messages that carried a change-set |
| `runId` | varchar nullable | workflow_runs correlation (rule 11) |
| `tokens` | integer nullable | o200k_base count, cached for compaction math |
| `createdAt` | timestamp | |

### 3.4 `refinement_proposals`

`continuity_proposals` is `unique(projectId, chapter)` with `chapter notNull` — structurally wrong for heterogeneous artifacts, so this is a new table; `continuity_proposals` is untouched.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial pk | |
| `projectId` | bigint FK cascade | |
| `sessionId` | uuid nullable FK chat_sessions | null for premise/audit/arc-plan invoked outside chat |
| `messageId` | bigint nullable | the assistant message that produced it |
| `scopeType` / `scopeRef` | as chat_sessions | denormalized; `novel` for premise/audit |
| `kind` | pgEnum `refinement_kind`: `chat` \| `premise_enhance` \| `bible_audit` \| `arc_plan` | |
| `status` | pgEnum `refinement_proposal_status`: `pending` \| `applied` \| `discarded` \| `superseded` \| `conflicted` | |
| `summary` | text | human-readable one-liner |
| `changeSet` | jsonb notNull | ops array (§6.1) |
| `baseline` | jsonb notNull | `{ "<artifactRef>": { revision, contentHash } }` captured at proposal time |
| `model` / `runId` | varchar | attribution |
| `appliedAt` | timestamp nullable | |
| `error` | jsonb nullable | conflict detail on `conflicted` |
| `createdAt` / `updatedAt` | timestamp | |

Indexes: `(projectId, status)`, `(sessionId)`, `(projectId, scopeType, scopeRef, status)`.

### 3.5 Column additions

- `volumes`: `targetChapterCount integer` (required before approve; seeded from `generate.chapters_per_volume`), `revision integer notNull default 1`, `contentHash varchar`, `staleReason varchar`.
- `briefs`: `arcKey varchar` (+ `index(projectId, arcKey)`), `endingContract jsonb`, `revision integer notNull default 1`, `contentHash varchar`, `staleReason varchar`.
- `user_feedback.artifactType` enum gains `refinement_proposal`.

`endingContract` shape (class-schema validated, not a pg enum):

```json
{
  "hookType": "cliffhanger | revelation | quiet_dread | promise | turn",
  "emotionalBeat": "what the reader should feel on the last line",
  "openQuestion": "the question the ending must leave open",
  "handoffState": "situation the next chapter picks up from",
  "mustNotResolve": ["thread:heir_mystery"]
}
```

### 3.6 Error codes

New `AppErrorCode` groups (per migration-doc §7.6 conventions): `ARC_0xx` (not found, coverage mismatch, volume not approved, arcs not approved), `CHT_0xx` (session not found, archived, invalid scope/scopeRef), `RFN_0xx` (proposal not found, not pending, baseline conflict, op not allowed for scope, finalized-chapter immutable), `PRM_0xx` (premise enhance preconditions).

---

## 4. State machines & approval gates

**Arc:** `draft → approved`, flipped volume-wide by `POST /volumes/:volumeKey/arcs/approve`, which validates that the volume's arcs are contiguous, non-overlapping, and exactly cover `[volume.startChapter .. volume.endChapter]`. Applying a proposal to an approved arc keeps it `approved` (the user explicitly applied) but marks dependent briefs stale.

**Chat session:** `active ⇄ archived` (reversible; turns rejected while archived).

**Proposal:** `pending → applied | discarded | superseded | conflicted`; `conflicted → discarded` only — recovery is a new chat turn, which sees current artifact state and re-proposes.

**Gate chain:**

1. All volumes `approved` **and** every volume has `targetChapterCount` → arc planning allowed.
2. All arcs of a volume `approved` → arc-scoped outlining allowed for that volume.
3. Generation (existing brief gate) additionally requires the chapter's arc `approved` **when the volume has arcs**; volumes with zero arcs keep today's path (legacy).

Staleness (`staleReason`) never demotes an `approved` status; it is a signal surfaced by list endpoints and cleared by re-approving arcs or re-outlining briefs.

---

## 5. Chat refinement subsystem

### 5.1 Shape

Turn-based REST — no websockets, no streaming, no paused graphs (rule 12). A turn is:

```
ChatService.turn(sessionId, content)
  1. guard: session active, scopeRef still exists
  2. compact history if needed (§5.4)
  3. ContextAssembler.forChatTurn(session)            → pack (stable/volatile split)
  4. modelRouter.structured(chatRefinePrompt, input)  → { reply, changeSet? }   (repair ladder as usual)
  5. persist: user message, assistant message, proposal (if changeSet), supersession (§6.4)
  all wrapped in WorkflowRunService.runChain('chat-turn', …) → fresh runId
```

Services persist and orchestrate; the router calls the model; the prompt module has zero tools (rules 1/2). The turn is synchronous — one structured call, seconds not minutes.

### 5.2 One prompt module, seven scopes

`chat-refine` is a single parametrized `PromptModule` — not seven. Template variables:

- `{stableContext}` — the scope's canon (§10.3), rendered by the assembler.
- `{scopeInstructions}` — from a code map `SCOPE_PLAYBOOKS: Record<ChatScope, { guidance: string; allowedOps: OpType[] }>`: per-scope authoring guidance (what a good volume plan / arc / brief looks like for a serialized web novel) plus the allowed-op vocabulary.
- `MessagesPlaceholder('history')` — rolling summary + recent verbatim turns as real messages (§10.2).
- `{userMessage}`.

Output schema: `{ reply: string, changeSet?: ChangeOp[] }` where `ChangeOp` is the discriminated union of §6.1. `postValidate` (built per-session via a factory closure over the scope) rejects ops outside the scope's allowlist — the repair ladder then forces the model to correct itself, so out-of-scope ops never reach the DB (rule 5).

The playbooks are where the "senior web novelist" lives: the `novel` playbook pushes hook/stakes/serialization thinking; `volume_plan` pushes escalation ladders and payoff spacing; `arc`/`arc_plan` push chapter-count fitting, filler-avoidance, and material suggestions; `brief` pushes ending contracts and required-context declarations.

### 5.3 Endpoints

Module `src/modules/refinement/`, controller root `/projects/:projectId`:

| Method | Path | Notes |
|---|---|---|
| POST | `/chat/sessions` | `{scopeType, scopeRef?, title?}`; validates scopeRef exists |
| GET | `/chat/sessions?scopeType&status` | list |
| GET | `/chat/sessions/:sessionId` | detail |
| GET | `/chat/sessions/:sessionId/messages?before&limit` | paged transcript |
| POST | `/chat/sessions/:sessionId/messages` | `{content}` → `{userMessage, assistantMessage, proposal?, runId}` |
| POST | `/chat/sessions/:sessionId/archive` · `/unarchive` | |

### 5.4 History compaction

Owned by `ChatService`, not the assembler. Before each turn: if verbatim-history tokens exceed 6 000 (o200k_base, reusing `token-budget.ts`) **or** `latestOrdinal − summaryThroughOrdinal > 12`, call the `chat-compact` module (analytical, llm_cache-cacheable) to fold everything up to `latestOrdinal − 6` into `session.summary` and advance the watermark. Messages are never deleted — the summary is a read-time window; the full transcript stays in `chat_messages`.

---

## 6. Proposal apply engine

`src/modules/refinement/proposal-apply.service.ts`. Deterministic service code, zero AI.

### 6.1 Change-set op grammar

Discriminated union, class-schema validated at model-output time **and** again at `PATCH`/apply time (hand-edited change-sets get no trust):

```
premise.update        { premise?, brief?, themes?, instructions? }
bible_document.upsert { section, slug, frontmatter?, body }
bible_document.remove { section, slug }
volume.upsert         { volumeKey, title?, objective?, conflict?, payoff?, targetChapterCount?, cast?, body? }
volume.remove         { volumeKey }                        // draft volumes only
arc.upsert            { arcKey, volumeKey, ordinal, title?, objective?, escalation?, payoff?, hook?,
                        chapterStart?, chapterEnd?, cast?, body? }
arc.remove            { arcKey }                           // draft arcs only
brief.update          { chapter, title?, body?, contextRefs?, endingContract? }
```

Artifact refs in `baseline` use the same strings as `scopeRef` plus `premise` for the project row.

### 6.2 Apply algorithm

Single `db.transaction`, mirroring `applyContinuityProposal` (`generation.service.ts`):

1. Lock the proposal row `FOR UPDATE`; require `pending`.
2. **Baseline conflict check:** for every artifactRef in `baseline`, load current `revision`/`contentHash`; any mismatch → rollback, `status = 'conflicted'`, `error = { mismatches: [...] }`, HTTP 409.
3. Guard rails: `brief.update` rejected for `chapter <= project.storyCurrentChapter` (finalized chapters are immutable); `*.remove` only on `draft`-status rows.
4. Dispatch each op to its applier (`Record<OpType, (tx, projectId, op) => Promise<Touched>>`). Each applier upserts, bumps `revision`, recomputes `contentHash` (shared `content-hash.ts`: sha256 of canonical JSON of the content columns).
5. **Staleness propagation:** `volume.upsert` touching objective/conflict/payoff/targetChapterCount → `staleReason` on that volume's arcs; `arc.upsert` → `staleReason` on briefs in its chapter range; `targetChapterCount` change on an approved plan → recompute downstream volume ranges (cumulative sums) and mark their arcs stale.
6. Mark `applied`, `appliedAt = now()`; write a `user_feedback` row (`artifactType: 'refinement_proposal'`, `disposition: 'approved'`) for audit symmetry.

### 6.3 Proposal endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/proposals?status&sessionId&kind&scopeType` | list |
| GET | `/proposals/:id` | detail incl. changeSet + baseline |
| PATCH | `/proposals/:id` | `{changeSet}` hand-edit while pending; re-validated |
| POST | `/proposals/:id/apply` | → `{applied: [{artifactRef, newRevision}], staleMarked: [...]}`; 409 on conflict |
| POST | `/proposals/:id/discard` | |

### 6.4 Supersession

When a new turn in the same session produces a change-set touching an artifactRef that a prior `pending` proposal of that session also touches, the prior proposal flips to `superseded`. Cross-session pending proposals are left alone — the baseline check catches them at apply time.

---

## 7. Premise enhancement & bible structure audit

Both are standalone chains through the same proposal pipe — runnable on any project at any time, independent of chat.

**`POST /premise/enhance`** `{overview?}` (falls back to `projects.brief`/`premise`). The `premise-enhance` module (role `premise`, authoring) evaluates the overview as a web novel — hook strength, stakes, protagonist drive, progression/power system, serialization viability, genre conventions — and returns `{enhancedPremise, hook, stakes, protagonistDrive, progressionSystem, serializationNotes, genre, themes[], changeSet}`. The change-set (kind `premise_enhance`) carries `premise.update` plus `bible_document.upsert` ops for the project/premise doc. The response surfaces the rationale fields so the user sees *why* before applying; refinement continues in a `novel`-scoped chat.

**`POST /bible/audit`**. The `bible-audit` module (role `audit`, analytical, llm_cache-cacheable) receives the bible doc inventory (section/slug/first-lines) plus the code constant `REQUIRED_BIBLE_DOCS` — the manifest of what a serialized web novel's bible needs, all slugs under the **existing** `bible_section` enum (no enum change), e.g. `project/pacing-tone`, `project/reader-promise`, `power/progression-ladder`, `plot/escalation-map`. Output: `{findings[], changeSet}` — `bible_document.upsert` ops (drafted content for missing docs, grounded in the premise) and `bible_document.remove` ops for docs that serve nothing (findings explain each). Kind `bible_audit`, same apply/discard flow.

Whether to fold the audit into bible-builder as a stage was considered and rejected: as a standalone chain it also serves projects with hand-built or drifted bibles.

---

## 8. Arc tier

**`POST /volumes/:volumeKey/arcs/plan`** `{arcCount?}` — gated per §4. The `arc-plan` module (role `arc`, authoring) receives `ContextAssembler.forArcPlanning(projectId, volumeKey)` (§10.3) and returns:

```
{ arcs: [{ arcKey, title, objective, escalation, payoff, hook,
           chapterStart, chapterEnd, cast[], body, ideas[] }] }
```

- The model decides arc count (unless `arcCount` pins it) and **must fill exactly** the volume's chapter range — where material is thin it expands (subplots, character beats, world-building payoffs aligned with the premise and `skeletonCharacterArcs`) rather than padding; `ideas[]` carries the suggested materials, folded into `body`.
- `postValidate`: arcs contiguous, non-overlapping, exact coverage of `[startChapter..endChapter]` — violations re-enter the repair ladder.
- Per Appendix A rule 13 the plan is **staged as an `arc_plan` proposal** (arc.upsert ops, `ideas[]` folded into `body`); applying it writes the arcs as `status: draft` (re-planning stages a fresh proposal). Refinement continues in `arc_plan`/`arc`-scoped chat; `POST /volumes/:volumeKey/arcs/approve` closes the gate.

**Other endpoints** (module `src/modules/bible/arc/`): `GET /volumes/:volumeKey/arcs`, `GET /arcs/:arcKey`, `PUT /arcs/:arcKey` (manual edit; bumps revision/contentHash), `POST /volumes/:volumeKey/arcs/backfill` (deterministic single-arc adoption for legacy projects — no AI).

**Volume changes:** `PATCH /volumes/:volumeKey` accepts `targetChapterCount`; `POST /volumes/approve` requires every count present and computes `startChapter`/`endChapter` as cumulative sums in ordinal order (§2.1).

---

## 9. Enhanced chapter briefs

### 9.1 Required context: extended ref grammar

`briefs.contextRefs` stays the single declaration mechanism (rule 7 intact — the drafter sees serial core + declared refs, nothing else). The ref grammar is extended instead of adding a typed-requirements column:

- `relationship:<entityKeyA>~<entityKeyB>` — current relationship state between two entities
- `world_fact:<category>.<key>` — a specific fact rather than a whole category
- `doc:<section>/<slug>` — a bible document body

Resolved by the existing catalog/ref-resolution stage; invalid refs keep today's drop-and-log behavior (`context_packs.unresolvedRefs`).

### 9.2 Ending contract

Every brief carries `endingContract` (§3.5). Enforcement is three-point:

- **`outline` v2** (arc-scoped): output schema makes `endingContract` required per brief; the outliner receives the arc's objective/escalation/hook and the *next* chapter's intent, so contracts chain — each chapter ends where the next can pick up. The arc's final chapter inherits the arc's `hook` as its handoff.
- **`generation` v2**: the template renders `## ENDING CONTRACT` in the volatile tail; system text instructs that the closing scene must satisfy hookType/emotionalBeat/openQuestion/handoffState, must not resolve `mustNotResolve` items, and must never wrap up conclusively unless the contract says so.
- **`judge` v2**: input gains the contract; output gains `endingCompliance: { compliant, issues[] }`. The judge node in `chapter-generation.graph.ts` routes non-compliance into the existing `repairPatch` path with the issues as fix instructions (soft, patch-first — same ladder as continuity findings).

`POST /arcs/:arcKey/outline` writes briefs with `arcKey` + `endingContract`; the legacy `/outline` endpoint keeps working for arc-less projects (contract optional there).

---

## 10. Context management & prompt caching

### 10.1 Stable/volatile pack split

`ContextSection` gains `segment: 'stable' | 'volatile'` (default `'volatile'` for back-compat). `AssembledPack` gains `renderedStable`/`renderedVolatile`; `rendered` stays their concatenation so existing callers and pack persistence are unchanged.

- **Stable** = scope canon: bible docs, catalog, volume/arc bodies, premise — changes only when a proposal is applied or a manual edit lands.
- **Volatile** = per-turn/per-chapter: previous ending, continuation state, brief, history summary, changed-since-session-start deltas.

Budget fitting evicts volatile-first within tier rules, so the stable prefix stays **byte-identical across turns** → provider cache hits. An apply mid-session intentionally changes the stable segment (correctness > cache).

### 10.2 Message ordering & router injection

Convention for every module with `cacheStrategy` (enforced by render goldens):

```
[system]            static per version            ← breakpoint 1
[human]             {stableContext}               ← breakpoint 2
[history messages]  prior turns                   ← breakpoint 3 (chat only, last prior turn)
[human]             volatile tail + user message
```

Injection lives entirely in `ModelRouterService.structured()` — nodes and services stay provider-agnostic. When `provider === 'anthropic'` and the module declares `cacheStrategy`, the router formats the template to messages, converts string contents to content-block arrays, and sets `cache_control: { type: 'ephemeral' }` at the three breakpoints above (≤ Anthropic's 4-breakpoint limit; blocks under ~1 024 tokens are left unmarked). Provider matrix:

| Provider | Behavior |
|---|---|
| anthropic | explicit `cache_control` blocks |
| openai / xai | no-op in code; automatic prefix caching benefits from stable-first ordering |
| ollama | no-op (KV-cache reuse still benefits from the stable prefix) |
| subprocess providers | no-op |

Orthogonal to `llm_cache` (whole-response memo for deterministic roles), which is unchanged; `audit` and `compact` join `CACHEABLE_ROLES`; creative roles (chat, premise, arc, generation) stay out.

### 10.3 New assembler methods

- **`forChatTurn(projectId, session)`** — purpose `chat`. Stable segment by scope: `novel` → premise/themes/instructions + bible doc index + volume list (epitomes) + catalog; `bible_document` → the doc + sibling index + catalog; `volume_plan` → all volumes (full) + premise + skeleton arcs; `volume`/`arc_plan` → the volume + neighbor epitomes + its arcs + catalog; `arc` → the arc + parent volume + sibling hooks + its briefs list; `brief` → the brief + its arc + volume objective + resolved contextRefs. Volatile: artifacts whose `revision` changed since session start (cheap query on the new revision columns). History rides as messages (§10.2), not pack text.
- **`forArcPlanning(projectId, volumeKey)`** — purpose `arc_plan`: the volume (+ `targetChapterCount`), previous volume's last arc `hook`, next volume's objective, premise, `skeletonCharacterArcs`, catalog.
- **`forPremise(projectId)`** — purpose `premise`: brief/premise/themes/instructions + bible doc inventory (slugs + first lines). The audit reuses this with a fuller doc inventory.

### 10.4 Budgets

Constants beside `DEFAULT_BUDGET = 24_000`, counted with js-tiktoken `o200k_base` as everywhere else:

| Purpose | Total | Split |
|---|---|---|
| chat | 24 000 | stable ≤ 14k · history ≤ 6k (summary ≤ 1.5k + last 6 verbatim turns) · volatile delta ≤ 2k · remainder headroom |
| arc_plan | 16 000 | |
| premise | 8 000 | |
| audit | 12 000 | |

---

## 11. Prompt modules & model roles

| Key | Role | Kind | llm_cache | Output |
|---|---|---|---|---|
| `premise-enhance` | `premise` | authoring | no | enhanced premise + rationale + changeSet |
| `bible-audit` | `audit` | analytical | **yes** | findings + changeSet |
| `chat-refine` | `chat` | authoring | no | `{reply, changeSet?}` |
| `chat-compact` | `compact` | analytical | **yes** | `{summary}` |
| `arc-plan` | `arc` | authoring | no | `{arcs[]}` with coverage postValidate |
| `outline` **v2** | (existing) | authoring | no | + required `endingContract`, arc-aware |
| `generation` **v2** | (existing) | authoring | no | ending-contract instructions + volatile-tail render |
| `judge` **v2** | (existing) | analytical | yes (existing) | + `endingCompliance` |

New roles are added to both `AI_PROFILE` default maps (production + local-test). All five new features run as chains under a new public helper `WorkflowRunService.runChain(projectId, graph, target, fn)` (generalizing the private `createRun`/`completeRun`/`failRun` trio), with `graph` values `chat-turn`, `premise-enhance`, `bible-audit`, `arc-plan`. Version bumps (v2) intentionally invalidate render goldens and `llm_cache` keys.

---

## 12. API reference (consolidated)

Everything under `/projects/:projectId`:

| Area | Endpoints |
|---|---|
| Chat | `POST/GET /chat/sessions`, `GET /chat/sessions/:id`, `GET/POST /chat/sessions/:id/messages`, `POST /chat/sessions/:id/archive|unarchive` |
| Proposals | `GET /proposals`, `GET/PATCH /proposals/:id`, `POST /proposals/:id/apply|discard` |
| Premise | `POST /premise/enhance` |
| Bible audit | `POST /bible/audit` |
| Arcs | `POST /volumes/:volumeKey/arcs/plan`, `GET /volumes/:volumeKey/arcs`, `GET/PUT /arcs/:arcKey`, `POST /volumes/:volumeKey/arcs/approve`, `POST /arcs/:arcKey/outline`, `POST /volumes/:volumeKey/arcs/backfill` |
| Volumes (changed) | `PATCH /volumes/:volumeKey` accepts `targetChapterCount`; `POST /volumes/approve` computes cumulative ranges |
| Preview (new) | `GET /context/preview?purpose=generation|outline|chat|arc_plan|premise|audit` with `chapter`, `scopeType`/`scopeRef`, or `volumeKey` per purpose |

---

## 13. Testing strategy

- **Render goldens** for all new/bumped modules, asserting the stable/volatile message ordering (the cache contract).
- **Apply-engine transaction tests**: happy path per op type, baseline-mismatch 409 + `conflicted`, partial-failure rollback, staleness propagation, supersession, finalized-chapter guard.
- **Gate-matrix tests**: legacy (zero-arc) vs arc projects across plan/outline/generate.
- **Assembler tests**: stable segment byte-identical across two assemblies with unchanged canon; budget splits respected; compaction watermark math.
- **Router tests**: mocked Anthropic asserting injected `cache_control` blocks; xai/ollama unchanged.
- **Rung-3 Ollama smoke** (extends A10 suite): one chat turn per scope family, one arc plan with coverage check, one premise enhance — weak-model tolerance via scope playbooks shrinking the op vocabulary.

---

## 14. Risks & open questions

- **Weak local models vs the broad `chat-refine` schema** — mitigated by per-scope allowlists (smaller visible vocabulary) and the repair ladder; watched by rung-3 smoke.
- **Anthropic cache TTL (~5 min)** only pays during active chat cadence; stable-prefix ordering is still a pure win for xAI/OpenAI automatic caching.
- **Conflicted proposals are terminal-ish** (discard + re-chat). Automatic change-set rebase is explicitly out of scope v1.
- **Prompt-version bumps** invalidate goldens and `llm_cache` keys — intended and one-time.
- Open: whether `arc` chat scopes eventually get read-only tools (analytical lookups mid-conversation). Deferred; rule 2 keeps authoring toolless today.
