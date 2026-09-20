# Ollama Removal, Model Naming, and the Structured-Output Fix

> Triggered by a production incident on 2026-09-20: an `ideation-turn` failed every parse rung and the
> author lost their turn (`AI_001`, run `916ccd18`). The root cause and the Ollama removal turn out to be
> the same change. Decided with the product owner on 2026-09-20.

## 1. The incident, and why it is the same work

`ModelRouterService` sends non-Ollama providers their schema in-band:

```ts
if (provider !== 'ollama') {
  messages = [...messages, new HumanMessage(`Respond with ONLY one valid JSON object matching this JSON schema…\n${JSON.stringify(toJsonSchemaFormat(promptModule.schema))}`)];
}
```

`toJsonSchemaFormat` strips every key in `CONSTRAINT_KEYWORDS`:

```
minLength, maxLength, minimum, maximum, minItems, maxItems, pattern, format, description
```

That stripping exists for exactly one reason, stated in its own comment: llama.cpp's schema→grammar
converter, used by Ollama's structured outputs, ignores or chokes on validation-only keywords. But it is
applied to the message shown to **hosted** models too, where no grammar converter is involved.

So a hosted model is shown a schema with no constraints and **no field descriptions**, and is then validated
by AJV against all of them. For the failing ideation turn the model never saw:

- `options` — `minItems: 2`
- _"the coaching line copied character for character from the round input"_
- _"never invent an id, never merge two questions into one"_
- _"the lead-in only … The questions are NOT in here"_

The captured reply is a long essay opening _"Two things before I hand you anything invented"_ — precisely the
behaviour those descriptions exist to prevent. The model was judged against a contract it was never shown.

**Removing Ollama from the LLM path deletes the reason for the stripping.** The fix and the removal are one
change; that is why they share a document.

## 2. Decisions

| #   | Decision                                                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Ollama is removed from every **LLM** path; `EmbeddingService` keeps it                            | `qwen3-embedding:8b` is the only embedding model in the registry, `EmbeddingService` calls the `ollama` package directly, and the vector columns are `vector(1024)`. Replacing it means a dimension migration and re-embedding every prose and lore chunk, with `search_lore`/`search_prose` degraded until the backfill finishes. Not worth it to delete one branch. |
| P2  | Hosted providers receive the **full** schema — descriptions and constraints intact                | The root cause of the incident. No hosted model needs them stripped; descriptions are the primary steering mechanism there.                                                                                                                                                                                                                                           |
| P3  | Model labels in the UI are the friendly name only — "GLM 5.2", not `z-ai/glm-5.2` or `openrouter` | An author has no reason to know the gateway or the slug. `ModelEntry` has no display field today, so the UI renders the raw slug.                                                                                                                                                                                                                                     |
| P4  | Schema-validation issues are logged at `warn`/`error`, not `debug`                                | `renderSchemaIssues` emits only `path: message` — structural field paths, zero author content. Keeping it at debug is what made this incident undiagnosable in prod.                                                                                                                                                                                                  |
| P5  | The local test harness goes with Ollama                                                           | `test:ai:local`, `ai:pull-models` and the rung-3 suite (checklist A10) exist only to exercise local models. Accepted loss.                                                                                                                                                                                                                                            |

### 2.1 Accepted consequences

- **Ollama remains a runtime dependency for retrieval.** Semantic search still needs a reachable Ollama host.
  This contradicts "remove Ollama completely" and was chosen deliberately over a re-embedding migration.
- **No offline model testing.** Every AI test either mocks the router or costs money.
- `ModelProvider` does not become a single-member union; it keeps `'ollama'` for the embedding entry.

## 3. Task breakdown

Tiers per `plan-orchestrator`. Groups are serial.

## Group P — the fix and the removal

| id  | Task                                                                                                                                                                                                                                                                                                                                                              | Tier   | Files                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| P1  | **Ship the incident fix first, before any removal.** Give hosted providers the unstripped schema, and promote schema-validation issues from `debug` to `warn`/`error` (both the attempt-1 and repair rungs, plus the prompt key and version). Keep the stripped form for Ollama's `format` — the two uses split rather than one changing.                         | High   | `modules/ai/schemas/validate.ts`, `modules/ai/model-router.service.ts`                         |
| P2  | Fix the recovery ladder: try tolerant extraction on **both** raw outputs, not only the repair's; make `extractJsonBlock` track string state so a brace inside prose cannot desynchronise its depth counter; de-duplicate the three copies (`model-router.service.ts`, `graphs/novel-validation.graph.ts`, `graphs/chapter-generation.graph.ts`).                  | Medium | the three files above + wherever the shared helper lands                                       |
| P3  | Remove Ollama from the LLM path: the `ChatOllama` branch in `buildClient`, the two `ollama` LLM registry entries, the `provider !== 'ollama'` branch in `buildMessages`, the Ollama arms of `quota.ts`/`telemetry.handler.ts`, and the now-dead constraint-stripping split if P1 left one. **Leave `EmbeddingService` and the `qwen3-embedding:8b` entry alone.** | High   | `modules/ai/{models,defaults,model-router.service,quota,telemetry.handler}.ts`, `bootstrap.ts` |
| P4  | Delete the local test harness: `tests/ai/local/`, `tests/ai/ai-pull-models.ts`, the `test:ai:local` and `ai:pull-models` scripts, and the Ollama arms of the remaining AI specs. Update `ai-smoke.ts` for a hosted-only world.                                                                                                                                    | Medium | `tests/ai/**`, `apps/novel-forge-server/package.json`                                          |
| P5  | Add `label` to `ModelEntry` for every LLM and image model, surface it through the models API, and render it in the UI in place of the slug — composer pill, model menu, and the message attribution tag. No provider or gateway text anywhere an author can see.                                                                                                  | Medium | `modules/ai/models.ts`, `modules/ai/ai.dto.ts`, then `apps/novel-forge-web` (after a regen)    |
| P6  | Regenerate `api-types.gen.ts` and fix callers; full verify of both workspaces.                                                                                                                                                                                                                                                                                    | Medium | generated + callers                                                                            |

## 4. Ordering

```
P1                     (the live bug — lands alone, first)
P2                     (recovery hardening)
P3 → P4                (removal, then its test fallout)
P5 → P6                (naming, then the contract regen)
```

P1 is deliberately separable: it fixes production without waiting on the removal, and it is the change that
would have turned this incident into a one-line log read.
