# Creative-Writing Model Evaluation

Evaluation of OpenRouter models for this harness's novel-generation pipeline, and the rationale behind the
production model routing in `src/modules/ai/defaults.ts`. Pricing, availability, and benchmark placements were
gathered live on **2026-08-22** from the OpenRouter models API, EQ-Bench (Creative Writing v3 + Longform
Writing), LMArena's creative-writing category, the Lech Mazur short-story benchmark, and Artificial Analysis.
~100 OpenRouter candidates were screened; the top 10 for this harness are recorded here. Re-run the evaluation
before trusting these numbers past a model generation.

## 1. What the harness requires of a model

Steady-state generation makes **4–5 LLM calls per chapter**, only one of which needs excellent prose:

- **Draft** (writing group): context pack up to 24k tokens in, 1,800–2,600 words of scene prose out as
  structured JSON (title/body/summary/continuation state).
- **Judge** (review group, 1–3 rounds): tool-calling loop over canon/ending/knowledge — needs reliable tool
  calling, not voice.
- **Continuity extraction, outline, helpers** (planning/helper groups): large structured JSON, instruction
  following, no prose flair.

Constraints that shaped the ranking:

1. Structured output is enforced via JSON-schema response format and the judge needs tool calling — this
   excludes community RP finetunes (Cydonia, Euryale, MythoMax, Hermes-4) despite prose reputation.
2. Reasoning tokens are billed as output on every call, so models whose reasoning cannot be disabled pay a
   hidden surcharge on mechanical roles. The router now caps effort per group (`REASONING_POLICY`), which
   mitigates but does not eliminate this for mandatory-reasoning models.
3. The judge checks continuity, not style — there is **no downstream prose repair**, so the drafting model's
   raw prose quality and editing burden dominate the writer-role choice.

## 2. Top 10 models

Weighting: 30% prose quality, 20% long-form consistency, 15% style/prompt adherence, 10% editing burden,
20% price/performance, 5% operational suitability.

| Rank | Model                       | Prose /10 | Value /10 | Novel Score /100 | Input $/M | Output $/M | Best role                           | Evidence confidence      |
| ---- | --------------------------- | --------: | --------: | ---------------: | --------: | ---------: | ----------------------------------- | ------------------------ |
| 1    | `moonshotai/kimi-k3`        |       9.3 |       8.3 |               90 |      3.00 |      15.00 | Primary chapter drafting            | High (3 benchmarks)      |
| 2    | `anthropic/claude-sonnet-5` |       8.4 |       8.2 |               88 |      2.00 |      10.00 | Judge, planning, safe all-rounder   | High                     |
| 3    | `z-ai/glm-5.2`              |       8.2 |       9.3 |               87 |      0.97 |       3.04 | Budget primary writer, planning     | High                     |
| 4    | `openai/gpt-5.6-luna`       |       8.3 |       9.7 |               86 |      0.20 |       1.20 | Value writer, helper/extraction     | Medium-high              |
| 5    | `anthropic/claude-opus-5`   |       9.8 |       6.0 |               85 |      5.00 |      25.00 | Escalation / rewrite / key chapters | High                     |
| 6    | `openai/gpt-5.6-sol`        |       9.0 |       7.3 |               84 |      2.00 |      10.00 | Alternative primary writer          | High                     |
| 7    | `moonshotai/kimi-k2.6`      |       7.9 |       9.0 |               82 |      0.54 |       2.28 | Cheap drafting, revision            | High                     |
| 8    | `deepseek/deepseek-v4-pro`  |       7.3 |       9.4 |               80 |      0.41 |       0.83 | Extraction, continuity, judge       | High                     |
| 9    | `z-ai/glm-5.3`              |       8.8 |       7.8 |               79 |      1.40 |       4.40 | Watch-list writer                   | Medium (new, 1 provider) |
| 10   | `google/gemini-3.7-flash`   |       7.0 |       8.7 |               77 |     0.375 |      1.875 | Planning / structured stages        | High (split evidence)    |

## 3. Why the ranking came out this way

1. **Kimi K3** — #2 on EQ-Bench Creative Writing (Elo 2060, slop 1.3, within 45 Elo of Opus 5), #7 Longform
   with near-zero degradation, #4 on Mazur, disableable reasoning, 1M context, 15 providers. Measured prose one
   thin tier below Opus 5 at 60% of the price. Known weaknesses: a rule-of-three tic and occasional logic
   slips (partly caught by the judge's canon checks). Ranked first because this harness cannot repair prose
   downstream, so the writer role justifies the best measured prose that isn't premium-priced.
2. **Claude Sonnet 5** — not the best stylist (EQ 1787, below both K3 and its own predecessor Sonnet 4.6), but
   the Anthropic family owns the Longform _degradation_ metric, adherence/tool calling is best-in-class,
   reasoning is disableable, 9 providers, and $0.20/M cache reads make repeated judging cheap. The judge and
   safe-default pick.
3. **GLM-5.2** — EQ 1749, Longform 77.9, "~90% of premium creative performance at ~3.5× lower cost" per
   reviewers, optional reasoning, and 32 providers — the best-supplied model on OpenRouter. Best writer under
   $3.04/M out; K3's premium over it is justified only for the writer role.
4. **GPT-5.6 Luna** — the price/performance anomaly: EQ Elo 1825 (above Sonnet 5 and GLM-5.2), slop 1.6,
   Longform 75.5, reasoning down to `none`, at $0.20/$1.20. Slightly generic voice, mild GPT over-writing.
   This is where quality-per-dollar peaks.
5. **Claude Opus 5** — #1 on every prose benchmark (EQ 2105, slop 0.9; Longform 86.3 with zero degradation;
   Mazur #1 "by a wide margin"). The only model whose premium buys a measured, consistent gap — but at $25/M
   out it belongs on escalation, not every chapter.
6. **GPT-5.6 Sol** — #3 EQ, #4 Longform at Sonnet 5's price, docked for the family fingerprint this harness
   fights: long, engineered-feeling output (8–13k chars where Claude writes ~6k) against a 1,800–2,600-word
   target.
7. **Kimi K2.6** — EQ 1723, Longform 78.5 with 0.011 degradation, 19 providers. Cheapest near-frontier
   short-form prose; long-form slop (18.9) is the weakness.
8. **DeepSeek V4 Pro** — Longform 75.6 at $0.83/M out, 17 providers, strong world-state tracking. Slop 21.8
   makes it a drafting compromise but the ideal engine for extraction/continuity/judging.
9. **GLM-5.3** — Mazur #2 and LMArena 1465 suggest possibly the best sub-$5 writer, but single-provider
   (Z.AI), weeks old, mandatory reasoning. Watch-list until supply broadens.
10. **Gemini 3.7 Flash** — split evidence: LMArena humans rank it #3 creative; EQ's slop analyzer (3.4) and
    the family's cliché density say otherwise. Mandatory reasoning. Trust the slop data for prose; excellent
    for cheap high-context planning/structured output.

**Screened out despite looking attractive:** `x-ai/grok-4.6` (no prose-benchmark presence anywhere, mandatory
reasoning billed on every call, single-vendor; the Grok family measures poorly on fiction — grok-4.5 EQ #38,
Mazur bottom), `claude-haiku-4.5` (Longform degradation 0.462 — collapses over a chapter), Sonnet 4.6 (better
prose than Sonnet 5 but dominated at $3/$15), `qwen3.8-max` and Meta Muse (single-provider + mandatory
reasoning), all Mistral (measured longform collapse), Llama 4 (bottom of every board), MiniMax M3 (mid
everywhere), and every community RP finetune (no tools/structured output).

**Evidence caveats:** EQ-Bench and Mazur are LLM-judged (a known bias toward Claude-style prose); LMArena is
human preference but rewards chat-length polish. The Longform _degradation_ column is the single most
novel-relevant measured signal. Prose claims for very new entrants (GLM-5.3, Luna long-tail) rest on fewer
data points.

## 4. Economics — 100,000-word novel

Assumptions: context pack ≈ 20k effective tokens; draft ≈ 5k output tokens including JSON overhead; judge
×1.5, fix ×0.3, continuity ×1, amortized outline ×0.2 → **≈80k input / 9k output tokens per chapter**; 40
chapters of 2,500 words → **≈3.2M input / 360k output tokens per novel**.

| Writer model              | Cost / chapter |                Cost / 100k-word novel |
| ------------------------- | -------------: | ------------------------------------: |
| DeepSeek V4 Pro           |          $0.04 |                                 $1.61 |
| GPT-5.6 Luna              |          $0.03 |                                 $1.07 |
| Gemini 3.7 Flash          |          $0.05 | $1.88 + mandatory-reasoning surcharge |
| Kimi K2.6                 |          $0.06 |                                 $2.55 |
| GLM-5.2                   |          $0.11 |                                 $4.20 |
| Grok 4.6 (former default) |         ~$0.25 |  $8.56 + reasoning surcharge ≈ $10–12 |
| Claude Sonnet 5           |          $0.25 |          $10.00 (≈ $6–7 with caching) |
| GPT-5.6 Sol               |          $0.25 |                                $10.00 |
| Kimi K3                   |          $0.38 |                                $15.00 |
| Claude Opus 5             |          $0.63 |                                $25.00 |

## 5. Worked example — a novel at _Lord of the Mysteries_ scale

LotM is ~1,430 chapters / ~2.9M English words (avg ~2,000 words per chapter — inside this harness's
1,800–2,600-word target), so the per-chapter economics apply directly: **≈114M input / 13M output tokens**
for the full run. Bible build and volume/arc planning for its 8 volumes add well under 1%.

### Single model for every role

| Model                     | $/chapter |                   Full LotM (~1,430 ch) |
| ------------------------- | --------: | --------------------------------------: |
| GPT-5.6 Luna              |    $0.027 |                                    ~$38 |
| DeepSeek V4 Pro           |    $0.040 |                                    ~$58 |
| Gemini 3.7 Flash          |    $0.047 |   ~$67 + reasoning surcharge → ~$85–110 |
| Kimi K2.6                 |    $0.064 |                                    ~$91 |
| GLM-5.2                   |    $0.105 |                                   ~$150 |
| GLM-5.3                   |    $0.152 |             ~$217 + reasoning surcharge |
| Grok 4.6 (former default) |   ~$0.21+ | ~$306 + reasoning surcharge → ~$350–430 |
| Claude Sonnet 5           |     $0.25 |         ~$358 (≈ $230–260 with caching) |
| GPT-5.6 Sol               |     $0.25 |                                   ~$358 |
| Kimi K3                   |    $0.375 |                                   ~$536 |
| Claude Opus 5             |    $0.625 |                                   ~$894 |

### The routed production configuration

| Role slice           | Model           |          Per chapter |
| -------------------- | --------------- | -------------------: |
| Draft + fix          | Kimi K3         |                $0.21 |
| Judge (×1.5)         | Claude Sonnet 5 | $0.08 ($0.05 cached) |
| Continuity + outline | GLM-5.2         |                $0.02 |
| Helpers              | GPT-5.6 Luna    |               <$0.01 |
| **Total**            |                 |     **≈ $0.28–0.31** |

**Full LotM: ≈ $400–440, or ≈ $360–390 with Anthropic cache passthrough** (verified working through
OpenRouter — see `tests/ai/prompt-caching.spec.ts` wire-shape test; cache reads are recorded in
`model_calls.cached_input_tokens`). Add 10–20% for judge retries, patch cycles, human-triggered revisions,
and re-outline reconciliation → **realistic budget ~$430–530**. The former all-Grok-4.6 setup cost roughly
the same (~$350–430) with the one flagship model that has no fiction evidence.

At this chapter count the dominant risk is not token cost but long-range continuity decay (see
`harness-final-recommendation.md` at the repo root); model spend and those pipeline fixes are complementary
budgets, and the fixes are the cheaper of the two.

## 6. Recommendations

1. **Best overall default writer: `moonshotai/kimi-k3`.** Top-2 measured prose across three independent
   benchmarks, near-zero long-form degradation, disableable reasoning, 15 providers. Its premium over GLM-5.2
   is pennies against the human review time each chapter already costs, and writer quality is unrecoverable
   downstream. Conservative alternative: Claude Sonnet 5 (better adherence, flatter prose).
2. **Cheapest model to actually trust: `openai/gpt-5.6-luna`.** Measurably above Sonnet 5 on judged prose at
   $0.20/$1.20. Lost vs. K3: long-form stability (75.5 vs 79.6), a more generic voice, mild over-writing.
3. **Premium worth paying for: `anthropic/claude-opus-5`** — the rare case where the price buys a measured
   gap (#1 on all four prose evaluations, zero degradation). Use surgically: repair/rewrite ladder, volume
   openers/finales, author-triggered escalation.
4. **Attractive but avoid as writer: `x-ai/grok-4.6`.** Flagship intelligence scores and mid price, but absent
   from every prose benchmark, mandatory reasoning billed on all ~5 calls per chapter, single-vendor. Also
   avoid `claude-haiku-4.5` (collapses over length) and `gemini-3.1-pro-preview` (human-vote darling,
   slop 4.2).
5. **Price/performance knee:** GPT-5.6 Luna (~$1.20/M out) is approximately the prose level where spending
   more stops paying by default. Between Luna and K3 you buy one real increment (long-form stability + voice),
   justified for the writer role only. Above K3, only Opus 5 shows a measured improvement, and only for
   escalation, not routine chapters.

## 7. Production routing (implemented in `defaults.ts`)

| Group                                             | Model                       | Why                                                                  |
| ------------------------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| writing (generation/revision/fix/rebrand/reforge) | `moonshotai/kimi-k3`        | The only group where prose matters; pay for it here                  |
| planning (+ chat)                                 | `z-ai/glm-5.2`              | Structured output, strong instruction following, 32 providers        |
| review (judge/validation/continuity/audit)        | `anthropic/claude-sonnet-5` | Best tool-calling reliability; cache reads make repeat judging cheap |
| helper (title/compact/epitome)                    | `openai/gpt-5.6-luna`       | Replaces the dead `grok-4.1-fast` slug                               |

Reasoning effort is capped per group by `REASONING_POLICY` (helper `none`, all other groups `low`); the
`grok_only` content mode pins every role to `GROK_ONLY_MODEL` (`x-ai/grok-4.6`). All four non-Anthropic
defaults get OpenRouter's automatic caching; only Anthropic needs the explicit `cache_control` breakpoints
the router injects.
