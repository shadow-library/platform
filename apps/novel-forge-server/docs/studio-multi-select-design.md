# Multi-Select Studio Questions

> Reported 2026-09-20: a studio question reading _"Take as many as you actually mean"_ rendered radio
> buttons. Decided with the product owner the same day.

## 1. What is actually wrong

Multi-select was never implemented. It is not a rendering bug — the chain is single-select at every layer:

| Layer                                                               | State                                       |
| ------------------------------------------------------------------- | ------------------------------------------- |
| `StudioQuestion` (`modules/ideation/question-bank.ts`)              | no multi flag exists                        |
| `IdeationQuestionOut` (`modules/ai/schemas/ideation.schema.ts`)     | `options: string[]`, no flag                |
| `StudioQuestionResponse` (`modules/ideation/studio-payload.dto.ts`) | no flag                                     |
| `StudioAnswer` (`apps/novel-forge-web/src/lib/studio-answers.ts`)   | `{ kind: 'option'; index: number }` — one   |
| `recoverAnswers`                                                    | matches a reply against a **single** option |

The "take as many" instruction is prose the **model** wrote into the question wording. The ideation playbook
tells it to offer concrete, tappable answers; it judged this question wanted several; nothing beneath it can
represent that. The author gets radios and the sheet records one answer.

This is the same shape as the structured-output incident in `ollama-removal-design.md`: a model reaching for
behaviour the schema does not model.

## 2. Decisions

| #   | Decision                                                                                                         | Rationale                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | The **question bank** declares `select: 'one' \| 'many'`; the model does not                                     | Deterministic, reviewable, version-controlled. The router already hands the model each question, so the flag rides along. A model improvising structure is what caused this bug. |
| M2  | On a multi-select question, **"You decide" is mutually exclusive** with the options                              | It means "you choose for me", which cannot coexist with a partial selection. Ticking it clears the picks and vice versa.                                                         |
| M3  | The flag travels bank → model → payload → web, and the model is told to word options as independently selectable | A single-select option list reads as mutually exclusive prose ("either X or Y"); a multi list must not.                                                                          |

## 3. Task breakdown

## Group M — multi-select

| id  | Task                                                                                                                                                                                                                                                                                                                                                                     | Tier   | Files                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------- |
| M1  | `StudioQuestion` gains `select: 'one' \| 'many'`. Set it on every question in the bank — this is a judgement pass over the whole bank, not a default: read each question and decide. Audit which ones the model has been writing "pick several" prose for.                                                                                                               | Medium | `modules/ideation/question-bank.ts`                                                                      |
| M2  | Carry the flag through the model contract: `IdeationQuestionOut` gains it, the round input hands it to the model, and the ideation playbook says a `many` question's options must be independently selectable rather than alternatives. Render goldens.                                                                                                                  | Medium | `modules/ai/schemas/ideation.schema.ts`, `prompts/ideation-turn.prompt.ts`, `prompts/scope-playbooks.ts` |
| M3  | Carry it to the web: `StudioQuestionResponse` gains the flag; `question-router`/`ideation.service` pass it through.                                                                                                                                                                                                                                                      | Low    | `modules/ideation/studio-payload.dto.ts`, `ideation.service.ts`                                          |
| M4  | Widen the answer model: `StudioAnswer` gains a multi variant (`{ kind: 'options'; indexes: number[] }` or similar). `answerText`, `composeAnswers` and `recoverAnswers` must compose several selections into one reply and parse them back — `recoverAnswers` currently matches one option against the lead line, so round-trip recovery needs rethinking, not patching. | High   | `apps/novel-forge-web/src/lib/studio-answers.ts` + its spec                                              |
| M5  | Render checkboxes for `many`, radios for `one`; "You decide" mutually exclusive per M2; keyboard and screen-reader correct for both (a checkbox group needs a group label, not just repeated inputs). Selected state not colour-only.                                                                                                                                    | Medium | `apps/novel-forge-web/src/routes/ideas/$seedId.tsx` + css                                                |
| M6  | Regenerate `api-types.gen.ts`, fix callers, verify both workspaces.                                                                                                                                                                                                                                                                                                      | Medium | generated + callers                                                                                      |

## 4. Ordering

```
M1 → M2 → M3        (server: bank, model contract, payload)
M6 regen
M4 → M5             (web: answer model, then rendering)
```

The regen sits mid-sequence because M4/M5 compile against the widened payload type.

## 5. Open risk

`recoverAnswers` reads a past reply back into structured answers so a closed round can be re-displayed.
Multi-select breaks its "match the lead line against one option" assumption. If a clean round-trip is not
achievable, a multi-answer round may have to record as `unrecorded` (the existing state for "the author
replied in their own words") rather than silently recovering the wrong subset. M4 must decide this
explicitly rather than let it degrade.
