# Chat Hub Design — Novel Forge Server & Web

> Drives checklist tasks H1–H6. Builds on `docs/interactive-refinement-design.md` (R1–R10, all shipped);
> amends `docs/ai-system-design.md` Appendix A rule 2 (see §2). Decided with the product owner on 2026-07-11.

## 1. Overview & product intent

The chat becomes the **central hub of the product** — the ChatGPT/Claude-style conversation through which the
author can inspect, modify, and drive *everything*: premise, bible, entities, volumes, arcs, briefs, draft
prose, and the generation pipeline itself. It is the app's central selling point.

Two modes, switchable per session at any time:

- **`manual`** (default) — every turn that converges on changes stages a proposal; the author reviews the
  change-set **op by op**, accepting or declining each, and applies the accepted subset. The conversation
  continues around the review.
- **`auto`** — the change-set the model produces is applied immediately in the same turn. Every applied
  change is recorded with enough information to **revert it individually** or to **roll the project back to
  any point in the change history**.

The hub can also **act**: generate chapters, plan arcs, run the bible audit, judge/revise/approve drafts,
approve plans, run validation. Actions ride the same change-set pipe as content ops, so manual mode stages
them for confirmation and auto mode executes them in-turn.

### 1.1 Decisions (product owner, 2026-07-11)

1. **Hub powers:** content edits + mid-turn read-only lookups + pipeline actions. The full hub.
2. **Prose:** the chat edits **draft** prose only. `chapters.locked` finalized prose stays immutable
   (migration-doc §1.1 decision stands); briefs at/below `storyCurrentChapter` stay rejected.
3. **Revert model:** per-change revert **and** rollback-to-point. Both are built on inverse ops captured at
   apply time.
4. **Hub vs scopes:** a new `project` (hub) chat scope joins the existing seven; scoped chats stay.
5. **Mode:** a per-session `mode` column, switchable mid-conversation; new sessions default to `manual`.
6. **Manual grain:** per-op cherry-pick — each op in a change-set is individually accepted or declined.
7. **Auto actions:** in auto mode actions execute immediately, like content ops. Exception: `action.finalize`
   is **never** auto-executed (it crosses the immutability line — finalized prose can no longer be reverted),
   it always stages for manual apply. This is the one deliberate deviation from "actions auto-execute",
   recorded here because silently finalizing would destroy the revert guarantee of decision 3.
8. **Delivery:** server and web UI in one effort (H1–H5 server, H6 web).

### 1.2 What already exists (and is reused, not rebuilt)

- Seven scoped chat sessions with turn pipeline, history compaction, per-session model override (R7).
- `refinement_proposals` + deterministic apply engine: baseline conflict 409, staleness propagation,
  supersession, hand-edit PATCH (R2).
- The op grammar (`change-set.ts`) covering premise/bible/volume/arc/brief/entity.
- Read-only tool registry (6 tools) with budget-audited loop (A6).
- `WorkflowRunService.runChain`, repair ladder, prompt caching contract (R6), `draft_revisions` history.

## 2. Amendments to existing documents

- **ai-system-design Appendix A rule 2** — amended: *"Authoring nodes have zero tools; no write tools exist,
  ever"* becomes *"…; **chat turns may consult the read-only tool registry through the declared-lookup
  protocol (chat-hub design §7)**; no write tools exist, ever."* The lookup protocol keeps the model on the
  structured-output path (no native tool binding required), every lookup is audited in `tool_calls`, and the
  vocabulary is exactly the existing six read-only tools.
- **Appendix A rule 13** — *unchanged and load-bearing*: auto mode does **not** write domain tables from the
  chat; it stages a `refinement_proposals` row and applies it through the same engine in the same turn.
  `autoApplied = true` marks provenance.
- **New hard rule 14:** *Every proposal apply records the inverse ops and post-apply artifact states needed
  to undo it; revert executes those inverse ops through the same apply engine under the same conflict guard.
  No apply path may skip inverse capture.*
- **interactive-refinement-design §5.2/§6.1** — the op grammar and playbooks grow as specified here (§4–§5);
  the seven scoped playbooks are unchanged except where noted.
- Migration-doc §1.1 immutability decisions are **not** relaxed.

## 3. Schema (H1)

All changes fold into the single-baseline migration.

### 3.1 Column/enum additions

| Table / enum | Change |
|---|---|
| `chat_scope` | + `'project'` (the hub scope; `scopeRef` stays `NULL`) |
| new enum `chat_mode` | `('manual', 'auto')` |
| `chat_sessions` | + `mode chat_mode NOT NULL DEFAULT 'manual'` |
| `refinement_proposal_status` | + `'reverted'` |
| `refinement_proposals` | + `autoApplied boolean NOT NULL DEFAULT false` — applied by an auto-mode turn |
| `refinement_proposals` | + `opResults jsonb` — per-op array `[{ index, status: 'applied'\|'declined'\|'failed', error?, result? }]`; `result` carries action outputs (`jobId`, `runId`, `proposalId`) |
| `refinement_proposals` | + `inverseOps jsonb` — the `ChangeOp[]` that undoes the applied content ops, captured inside the apply transaction |
| `refinement_proposals` | + `postState jsonb` — `Record<artifactRef, ArtifactState>` immediately after apply; the revert conflict guard |
| `refinement_proposals` | + `revertedAt timestamp` |
| `draft_revision_source` | + `'chat_edited'` — prose revisions written by `draft.update` |
| `refinement_kind` | + `'hub'` — proposals staged by hub-scope sessions (scoped sessions keep `'chat'`) |

### 3.2 Error codes

| Code | Meaning |
|---|---|
| `CHT_004` | Lookup budget exhausted — the turn's declared-lookup rounds hit the cap |
| `CHT_005` | Invalid session mode value |
| `RFN_006` | Revert conflict — an artifact changed since this proposal was applied (409) |
| `RFN_007` | Proposal is not revertible (not `applied`, contains no content ops, or already reverted) |
| `RFN_008` | Action execution failed (partial results in `opResults`) |
| `RFN_009` | `action.finalize` cannot be auto-applied — apply it manually |
| `RFN_010` | Draft is final/locked — prose op rejected |
| `RFN_011` | Invalid op selection (cherry-pick indexes out of range or empty) |

## 4. Op grammar extension (H2)

### 4.1 New content ops

```
draft.update  { chapter, title?, body?, summary? }
  — upserts the draft prose for a chapter; rejected when the draft is status='final' or the chapter
    is <= storyCurrentChapter (RFN_010). Bumps drafts.revision, resets reviewStatus to 'needs_review',
    writes a draft_revisions row with source 'chat_edited'. artifactRef: `draft:<chapter>`.
brief.remove  { chapter }
  — deletes a brief; only when chapter > storyCurrentChapter. Exists primarily as the inverse of a
    brief.update that created the brief; exposed to the hub playbook but no scoped playbook.
```

`artifact-state.ts` learns `draft:<n>` refs: `{ exists, revision, contentHash }` with the hash computed over
`{ title, body, summary }` (drafts have no stored contentHash; computed at read time like entities).

### 4.2 Action ops

Actions are ops with no baseline and no inverse — they drive existing service code. They validate like
content ops (typed specs, unknown-field rejection) and are listed in `changeSetRefs` as **no** refs.

```
action.generate_chapters   { count }                       → GenerationService.generate (enqueue batch)
action.plan_volumes        { volumeCount?, chaptersPerVolume? } → GenerationService.plan
action.plan_arcs           { volumeKey, arcCount? }        → RefineService arc-plan chain → arc_plan proposal
action.outline_arc         { arcKey }                      → arc-scoped outline
action.audit_bible         { }                             → bible-audit chain → bible_audit proposal
action.enhance_premise     { overview? }                   → premise-enhance chain → premise_enhance proposal
action.judge_draft         { chapter }                     → continuity judge on the draft
action.revise_draft        { chapter, note }               → revision loop with the note as feedback
action.approve_draft       { chapter }                     → draft review approval
action.approve_volume_plan { }                             → volume plan approve (gates apply as usual)
action.approve_arcs        { volumeKey }                   → arc approval for a volume
action.validate            { scope: 'novel' | 'chapter', chapter? } → validation run
action.finalize            { upTo? }                       → finalize chapters — NEVER auto-executed (§1.1.7)
```

Chain-producing actions (`plan_arcs`, `audit_bible`, `enhance_premise`) yield a *new* proposal; in an
auto-mode session that resulting proposal is **also auto-applied** (consistent with the mode; it is fully
revertible). The chaining depth is 1 by construction — applied proposals never trigger further actions
unless the model proposes them in a later turn.

### 4.3 Hub playbook

`SCOPE_PLAYBOOKS.project`: senior-showrunner guidance (whole-novel judgement, pipeline awareness: what is
drafted, judged, approved, stale) + the full content-op vocabulary (including `draft.update`/`brief.remove`)
+ the action vocabulary rendered with exact JSON shapes (`renderActionVocabulary`, mirroring
`renderOpVocabulary` — weak models need shapes shown, not named). `SCOPE_CHAT_ROLE.project = 'chat'`.

## 5. Apply engine v2 (H3)

### 5.1 Cherry-pick apply

`POST /proposals/:id/apply` body gains `{ opIndexes?: number[] }` (absent = all ops, today's behavior).

1. Lock proposal `FOR UPDATE`; require `pending`. Validate indexes (RFN_011).
2. Baseline conflict check runs **only over refs touched by the selected content ops**.
3. Selected content ops apply in order inside the transaction; unselected ops are recorded as `declined`
   in `opResults`. Declined ops also produce a `user_feedback` row (`disposition: 'rejected'`).
4. Proposal flips to `applied` (there is no partial status — the disposition of every op lives in
   `opResults`; declined ops are simply never applied, and the author can ask the chat to re-propose them).

### 5.2 Inverse capture

Inside the apply transaction, **before** each content op executes, the applier synthesizes its inverse from
the current row:

| Applied op | Inverse |
|---|---|
| `premise.update` | `premise.update` with the prior values of exactly the fields the op set |
| `bible_document.upsert` (existed) | `bible_document.upsert` with prior frontmatter/body |
| `bible_document.upsert` (created) | `bible_document.remove` |
| `bible_document.remove` | `bible_document.upsert` with the deleted content |
| `volume.upsert` / `arc.upsert` (existed) | upsert with all prior refinable fields |
| `volume.upsert` / `arc.upsert` (created) | `volume.remove` / `arc.remove` |
| `brief.update` (existed) | `brief.update` with prior fields |
| `brief.update` (created) | `brief.remove` |
| `draft.update` | `draft.update` with prior title/body/summary |
| `entity.upsert` (existed / created) | `entity.upsert` with prior fields / `entity.remove` |
| `entity.remove` / `volume.remove` / `arc.remove` / `brief.remove` | matching upsert/update with the deleted row's content |
| `action.*` | none — actions are not revertible; their products (proposals, drafts) are |

Inverses accumulate in **reverse order** into `inverseOps`. After the last op, `postState` is captured via
`loadArtifactStates` over all touched refs. Both persist on the proposal row in the same transaction.

### 5.3 Action execution phase

Actions run **after** the content transaction commits (they enqueue jobs / run AI chains — they cannot hold
a DB transaction). Sequentially, in op order:

1. Dispatch through `ActionExecutorRegistry` — an injectable registry defined in the refinement module with
   zero dependencies. A new **`HubActionsModule`** (imports Refinement + Generation + Bible + Jobs modules;
   registered in `AppModule`) populates it at bootstrap, avoiding the circular dependency
   (GenerationModule already imports RefinementModule, so refinement can never import generation directly).
2. Each executor returns `{ jobId? , runId?, proposalId?, summary }`, recorded into `opResults`.
3. A failed action records `status: 'failed'` + error in `opResults` and stops subsequent actions
   (already-applied content ops stay applied); HTTP response reports partials (RFN_008 semantics).
4. `action.finalize` in an auto-apply refuses with RFN_009; in a manual apply it requires its opIndex to be
   explicitly selected.

### 5.4 Revert

`POST /proposals/:id/revert` — deterministic, zero AI:

1. Transaction; lock row; require `applied` with non-empty `inverseOps` (else RFN_007).
2. **Revert conflict guard:** recompute `loadArtifactStates` over `postState` keys; any mismatch → 409
   RFN_006 with per-ref mismatches (the artifact moved on — reverting would destroy later work).
   No force flag in v1: the author reverts the newer change first (rollback handles the chain case).
3. Execute `inverseOps` through the same op appliers (same hashing, revision bumps, staleness propagation).
4. Flip status to `reverted`, set `revertedAt`; write `user_feedback` (`disposition: 'rejected'`,
   note `reverted`).

Revisions only ever move forward (a revert bumps revisions again); the revert guard is hash+revision strict,
so a pending proposal staged against pre-revert state conflicts normally at its own apply time.

### 5.5 Rollback-to-point

`POST /changes/rollback` `{ afterProposalId }` — revert **every** `applied` proposal in the project whose
`appliedAt` is strictly newer than the anchor's, newest-first, each via §5.4 in its own transaction.
Cross-session changes are included by design: the change history is project-wide, and skipping another
session's interleaved change would corrupt the older snapshots. Stops at the first conflict and returns
`{ reverted: [...], stoppedAt?, conflict? }`. The UI presents this as "Roll back to here" on the timeline.

### 5.6 Change history

`GET /changes?limit&before` — the project-wide feed the timeline renders: applied/reverted proposals ordered
by `appliedAt` desc, each with `id`, `kind`, `sessionId`, `summary`, `autoApplied`, `appliedAt`,
`revertedAt`, touched refs, action results, and a `revertible` flag (computed: `applied` + inverse present).

## 6. Chat turn v2 (H4)

```
ChatService.turn(sessionId, content)
  1. guards (unchanged) + hub-scope validation (scopeRef must be null)
  2. compact history if needed (unchanged)
  3. assemble: forChatTurn (scoped) | forHubTurn (hub) → stable/volatile pack
  4. structured call (repair ladder). Output schema v2:
       { reply: string, changeSet?: ChangeOp[], lookups?: { tool, args }[] }
     — `lookups` and the others are mutually exclusive. If `lookups` present:
       execute via ToolRegistry handlers (audited in tool_calls, budgets enforced),
       append results as conversation messages, re-invoke. Max 3 lookup rounds per
       turn (CHT_004 → final round forces an answer, mirroring runToolLoop).
  5. persist user+assistant messages, stage proposal (kind 'hub' for hub scope)
  6. mode = 'auto' and proposal exists →
       ProposalApplyService.apply(all ops) in the same request; autoApplied = true;
       conflicted apply (rare: canon moved mid-turn) leaves the proposal pending-conflicted
       and the response says so — the author retries from the proposal card.
  7. response: { userMessage, assistantMessage, proposal?, applied?, runId }
```

The **declared-lookup protocol** (step 4) replaces native tool binding deliberately: the primary chat models
are subprocess CLIs (Claude Code / Codex) with no `bindTools`, and the structured repair ladder must stay in
the loop. Lookups reuse the six read-only tools by name; the hub playbook lists their names/args/purposes.

### 6.1 Context: `forHubTurn` (purpose `chat_hub`)

Stable segment: premise + bible doc inventory (section/slug/first-lines) + volume/arc catalog with statuses
and chapter ranges + entity catalog (keys, types, one-liners) + REQUIRED_BIBLE_DOCS gaps.
Volatile segment: pipeline status (story cursor, drafts by reviewStatus, stale artifacts, pending proposals,
running jobs/runs) + artifacts changed since session start (existing volatile machinery).
Budget: new `chat_hub` purpose entry sized like `chat` + catalog headroom; same byte-identical-stable
guarantee (R5) so prompt caching keeps paying.

### 6.2 Sessions API

- `POST /chat/sessions` accepts `scopeType: 'project'` and optional `mode`.
- `PATCH /chat/sessions/:sessionId` `{ mode?, title? }` — mode switch mid-conversation; recorded so past
  changes keep the mode they were made under (provenance is per-proposal via `autoApplied`).

## 7. Web UI (H6, `novel-forge-web`)

- **Hub-first chat screen:** "Control hub" is the default new-chat option (scope `project`); scoped chats
  remain in the picker. Session rows show a mode badge.
- **Mode toggle** in the composer bar (Manual ⇄ Auto), calling the PATCH endpoint; auto mode gets a
  distinct accent + "changes apply immediately — everything is revertible" hint.
- **Proposal card v2 (manual):** rendered inline under the assistant message — one row per op with a
  human-readable summary + expandable before/after diff (current artifact fetched client-side), checkbox per
  op, "Apply selected" / "Decline all". Declined ops grey out; the card shows final per-op dispositions.
- **Applied card (auto):** per-op result rows (incl. action results linking to Runs/Jobs), with a
  **Revert** button per proposal; conflicts render the 409 mismatch payload meaningfully.
- **Action chips:** actions in a change-set render as labeled chips (⚙ generate 5 chapters) with live
  status; `action.finalize` shows the always-manual warning.
- **Change history panel:** a project-wide timeline (GET /changes) in a right-hand drawer on the chat
  screen: every applied/reverted change with source session, mode badge, touched refs, revert button, and
  "Roll back to here".
- API layer: regenerate `api-types.gen.ts` (`bun run generate:api-types` against the running server),
  extend `refinement.api.ts` / `proposal.api.ts` hooks.

## 8. Testing (server: part of each H task; 90% coverage stays enforced)

- **Grammar:** new ops + actions validate/reject correctly; vocabulary renders include shapes.
- **Apply v2:** cherry-pick applies exactly the selected ops and records dispositions; baseline check scopes
  to selected refs; declined-only selection rejected (RFN_011).
- **Inverse/revert:** property-style round-trip — apply then revert restores byte-identical content hashes
  for every op type (created/existing × upsert/remove matrix); revert guard 409s when the artifact moved;
  staleness propagates on revert.
- **Rollback:** ordering (newest-first), cross-session interleaving, stop-on-conflict reporting.
- **Actions:** registry dispatch with mocked services; failure stops the chain and records partials;
  finalize refuses auto-apply.
- **Turn v2:** mocked-model e2e — manual stages, auto applies in-turn; lookup rounds execute tools, cap at
  3, audit rows written; hub context assembler stable-segment determinism.
- **Goldens:** hub playbook + chat prompt v2 render goldens; existing scoped goldens updated only by the
  version bump.

## 9. Risks & called shots

- **Op-level diffs need current state client-side** — the proposal card fetches artifacts to diff against;
  acceptable chattiness for a single-operator tool.
- **Auto mode + weak local models** could apply nonsense quickly; mitigations: same repair ladder +
  validation as manual, everything revertible, mode defaults to manual, hub playbook demands conservative
  change-sets ("propose the smallest complete change").
- **Interleaved manual/auto sessions** on the same artifacts resolve exactly like today: baseline conflicts
  at apply, supersession within a session, revert guard on the way back.
- **Action side effects aren't atomic with content ops** (post-commit phase). Recorded per-op in
  `opResults`; the turn reply and the card surface partial failure honestly.
- **`chapter_extract` and continuity proposals** stay on their existing pipes; the hub does not absorb them
  in v1 (they already have judge/apply flows).
