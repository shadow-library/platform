# Character-Knowledge Design — epistemic filtering for chapter generation

Chapters must only contain information the POV characters actually possess. The lore bible knows who committed the crime; a chapter drafted before the detective learns it must not — neither stated outright nor acted upon. This document specifies the canon-fact ledger, the per-brief knowledge contract, context-assembly filtering, and the judge-side leak gate that together enforce this.

Drives checklist tasks **CK1–CK4** (and follow-up CK5).

## 1. Principle: asymmetric visibility

The single load-bearing rule: **the drafting model cannot leak what it never sees.** Prompt-level "do not reveal X" instructions against a full-canon pack are unreliable — naming a fact raises its salience. So:

- **Drafter** — sees only facts the chapter's POV cast has ledgered as of this chapter, plus this chapter's planned reveals, plus POV-safe _behavioral constraints_ compiled from still-hidden facts ("Elias deflects questions about Tuesday night"), never the facts themselves.
- **Judge** — omniscient: sees the full forbidden list and assesses the draft for leaks, exactly as it already assesses ending contracts.
- **Deterministic pre-scan** — each fact carries a term list; a free lexical scan (the `scanResidue` pattern) catches blatant leaks before any judge tokens are spent.

Spoilers therefore must live in `canon_facts`, **not** in bible-document prose or entity sheets. That is an authoring rule (§2 amendment); the bible holds what any reader of chapter 1 may know, facts hold everything gated behind the reveal schedule.

## 2. Amendments to earlier documents

- **Adds `docs/ai-system-design.md` Appendix A rule 15:** _Generation-purpose context never contains an unrevealed canon fact: spoilers live in `canon_facts` (never in bible prose or entity sheets), the drafter sees only the ledgered knowledge of the brief's POV cast, and only the judge sees the forbidden list._
- The feature is **opt-in per brief**: a brief without a `knowledgeContract` behaves exactly as before. No existing behavior changes for projects that don't use facts.
- Canon facts are **never indexed** — they are injected as pack sections only, so LlamaIndex retrieval cannot become a leak backdoor (extends Appendix A rule 8's spirit).

## 3. Schema (CK1)

New tables in `src/database/schemas/knowledge.ts`; jsonb columns use the custom `jsonb` type.

```
fact_source enum: 'brief' | 'manual' | 'import'

canon_facts
  id              bigserial PK
  project_id      bigint FK → projects (cascade)
  fact_key        varchar NOT NULL          -- unique (project_id, fact_key)
  text            text NOT NULL             -- the spoiler statement, full truth
  subjects        jsonb (string[])          -- entity keys the fact concerns
  constraint_note text                      -- POV-safe behavior injected while hidden
  terms           jsonb (string[])          -- lexical leak-scan terms ("ledger", "service corridor")
  reveal_chapter  integer                   -- planned reveal (authoring aid; ledger is truth)
  created_at / updated_at

character_knowledge                          -- the ledger: who knows what, since when
  project_id         bigint FK → projects (cascade)
  fact_id            bigint FK → canon_facts (cascade)
  entity_id          bigint FK → entities (cascade)
  learned_in_chapter integer NOT NULL
  source             fact_source NOT NULL DEFAULT 'manual'
  note               text
  created_at
  PK (fact_id, entity_id)
```

`briefs` gains `knowledge_contract jsonb`:

```jsonc
{
  "pov": ["detective_amara", "sergeant_boone"], // entity keys whose knowledge bounds the chapter
  "learns": [{ "entityKey": "detective_amara", "factKey": "ledger_forgery" }], // revealed on-page this chapter
}
```

Error codes: `FCT_001` (NOT_FOUND, fact not found), `FCT_002` (CLIENT_ERROR, unknown entity key in a knowledge operation).

Single-baseline migration is regenerated (dev workflow: squash into `0000_initial_schema`, re-add the vector extension + HNSW statements, refresh the template DB).

## 4. Ledger semantics (CK2)

- **Known entering chapter N** = a ledger row with `learned_in_chapter < N` for any POV-cast member. Reveals of chapter N itself are "learned this chapter" — they may appear only as on-page discoveries.
- **Hidden** = every other canon fact. Hidden facts are the judge's forbidden list.
- **Reveal application is deterministic, not extracted:** when a draft is approved (`approveDraft`), the brief's `learns` entries are inserted into the ledger (`source: 'brief'`, `learned_in_chapter = chapter`, idempotent upsert) inside the same transaction. Unknown entity/fact keys are logged and skipped — approval is a human gate and a missed row is recoverable via the manual reveal endpoint; blocking approval on a sloppy plan is worse.
- Manual corrections: `POST /facts/:factKey/reveal` and `DELETE /facts/:factKey/knowledge/:entityKey`.

Module layout: `src/modules/bible/fact/` (`fact.controller.ts`, `fact.dto.ts`, `fact.service.ts`, `knowledge-view.ts`) inside `BibleModule`. `knowledge-view.ts` holds the pure/shared helpers (`parseKnowledgeContract`, `loadKnowledgeView`, `renderKnownFacts`, `renderHiddenConstraints`, `renderForbiddenFacts`, `scanKnowledgeLeaks`) so the assembler and the generation graph import one implementation (precedent: `rebrand/residue-scan.ts`).

## 5. Context assembly (CK3)

`forChapter` only (generation purpose). When the brief carries a contract, three sections are added immediately after `volume_objective`:

| key                  | label                       | tier            | content                                                                               |
| -------------------- | --------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| `known_facts`        | `## KNOWN FACTS (POV CAST)` | canonical       | ledgered facts of the POV cast entering this chapter; `(none established)` when empty |
| `chapter_reveals`    | `## REVEALED THIS CHAPTER`  | approved_intent | facts from `learns` — must be discovered on-page, not pre-known (omitted when empty)  |
| `hidden_constraints` | `## BEHAVIORAL CONSTRAINTS` | approved_intent | `constraint_note` of hidden facts — behavior without the why (omitted when empty)     |

Fact `text` never enters the pack unless known or revealed. Author-facing purposes (outline, arc_plan, chat, audit, premise) are deliberately **not** filtered — the author plans with full canon. `forRevision` keeps full-canon behavior in v1 (revision drafts still pass the judge gate); noted as a CK5 follow-up.

The generation prompt (v2.2.0) gains the epistemic rule: characters may only act on, state, or visibly orient around facts in `## KNOWN FACTS` / `## REVEALED THIS CHAPTER`; reveals happen on-page; behavioral constraints are followed without explaining them; information absent from those sections does not exist for the cast, even when the prose could infer it.

## 6. Judge gate & leak scan (CK4)

In the `judge` node (generation graph), when the brief has a contract:

1. `loadKnowledgeView` recomputes known/reveals/hidden from the ledger (deterministic — never trusted from model output).
2. **Pre-scan:** `scanKnowledgeLeaks(prose, hidden)` — word-boundary, case-insensitive match of each hidden fact's `terms`; one issue per fact with an excerpt. Any hit forces non-compliance regardless of what the model says.
3. The judge human message gains a `## FORBIDDEN KNOWLEDGE` block (factKey + text of hidden facts) and instructions to return `knowledgeCompliance: { compliant, issues[] }` — mirroring the ending-contract block. `JudgeSchema` gains the optional field; judge prompt version bumps.
4. Findings merge: non-compliance issues become **soft** findings (`knowledge leak: …`) and set `knowledgeCompliant = false` in graph state; like ending contracts they ride the repair ladder (`routeAfterJudge`) but never harden the continuity verdict.

The pre-scan is free and runs every attempt; the judge catches paraphrased leaks the term list misses; implicit leaks (a character acting on unstated knowledge) are judge-only and best-effort — the §5 filtering removes the drafter's incentive to produce them at all.

## 7. API (CK2)

Mounted on `FactController` at `/projects/:projectId`:

| method & path                                 | behavior                                                    |
| --------------------------------------------- | ----------------------------------------------------------- |
| `GET /facts`                                  | list facts incl. ledger entries                             |
| `GET /facts/:factKey`                         | single fact incl. ledger entries                            |
| `PUT /facts/:factKey`                         | upsert (arc-style merge)                                    |
| `DELETE /facts/:factKey`                      | delete fact (ledger cascades)                               |
| `POST /facts/:factKey/reveal`                 | add ledger row `{ entityKey, chapter, note? }` (idempotent) |
| `DELETE /facts/:factKey/knowledge/:entityKey` | retract a ledger row                                        |

## 8. Follow-ups (CK5, not in the initial cut)

- Plan-import bundle: optional `facts` collection + `knowledgeContract` on brief items; `novel-plan-forge` skill templates + pack.mjs.
- Web UI: facts panel with per-character reveal timeline; knowledge-contract editor on briefs.
- `forRevision` knowledge sections; arc-planner authoring of reveal schedules (`arc-plan` prompt emitting contracts); bible-audit check that flags spoiler prose living outside `canon_facts`.
