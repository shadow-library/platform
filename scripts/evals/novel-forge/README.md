# Novel Forge model-backed evals

Runnable suites for the chat-first evaluation plan (rows c1–c5 and e) and the DeepEval genre-craft suite (g). Each one drives a reachable Novel Forge server through its public API, the way the web does, and writes `result.json` and `summary.md` to `<out>/<suite>/<timestamp>/`.

These make real model calls and cost money. They are not tests: `bun scripts/verify.ts scripts` type-checks, lints and formats them but never runs them, and `bun test` does not pick them up (no `*.spec.ts` / `*.test.ts` files).

## Setup

Run everything from the repo root.

| What        | How                                                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target      | `--base-url`, else `NF_EVAL_BASE_URL`, else `E2E_NOVEL_FORGE_URL`, else `https://novelforge.shadow-apps.test` (the k3d dev ingress; its self-signed certificate is accepted for `*.test` hosts)             |
| Credentials | `NF_EVAL_TOKEN` (a bearer token for audience `api://novel-forge`), or `NF_EVAL_STORAGE_STATE` (a Playwright storage state such as `e2e/.auth/user1.json` from the e2e `setup` project), or `NF_EVAL_COOKIE` |
| Output      | `--out <dir>` or `NF_EVAL_OUT_DIR`; default `<os tmpdir>/novel-forge-evals`. A path inside the repo is refused unless git ignores it.                                                                       |
| Tier        | `--tier economy\|balanced\|performant` sets the project's cost tier and every turn's; omitted, the project default applies                                                                                  |

Eval briefs carry the planner's knowledge contract (`pov` is the brief's POV entity, `learns` the secrets its chapter's milestone unlocks), so writer and judge run with the same epistemic bounds as real use.

Every suite deletes the projects it creates; `--keep-projects` leaves them for inspection. `--runs <n>` repeats on a fresh project. `--dry-run` runs the whole suite against an in-process fake Forge (no network, no cost); add `--fake-faults` and the fake breaks every gated rule, so c1, c2 and c4 must report FAIL and c3 and c5 must flag chapters.

Exit codes: 0 pass or advisory, 1 a gate failed, 2 setup or run error.

## Suites

| Suite                       | Command                                                                                                       | Gate                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (c1) Provenance             | `bun scripts/evals/novel-forge/c1-provenance.ts` (20 turns × 2 runs)                                          | zero unauthorised auto-writes, mode changes, approvals or finalizes; card-vs-apply confusion matrix                                                                   |
| (c2) Notes fidelity         | `bun scripts/evals/novel-forge/c2-notes-fidelity.ts` (3 invented inputs × 3 runs)                             | per run: ≥95% explicit facts and decisions in the Bible or "Not used yet", 100% critical, zero invented or superseded content auto-applied, zero timing moved earlier |
| (c3) Secret leak in prose   | `bun scripts/evals/novel-forge/c3-secret-leak.ts` (10 chapters)                                               | advisory: flag rate with n; confirm each flag with the spot-check table                                                                                               |
| (c4) Isolation              | `bun scripts/evals/novel-forge/c4-isolation.ts` (sequence `SISIISSSSS`; one sequence alone: `--sequence SIS`) | zero isolated raw prose in standard writer snapshots, standard calls routed standard, approved bridge present in N+1 and N+5                                          |
| (c5) Continuation           | `bun scripts/evals/novel-forge/c5-continuation.ts` (20-chapter baseline + 10)                                 | advisory: contradiction candidates by criticality; `owner-rating.md` template for craft ≥3/5                                                                          |
| (e) Latency, quota and cost | `bun scripts/evals/novel-forge/e-latency-cost.ts [--sample] [--gateway <jsonl>]`                              | reported, not gating: turn p50 ≤30 s, plan p95 ≤120 s, organise p95 ≤300 s                                                                                            |
| (g) Genre craft             | `bun scripts/evals/novel-forge/g-genre-craft.ts`, then the DeepEval runner (see below)                        | every DeepEval metric at or above its threshold on every case                                                                                                         |

Every suite appends its timings and each run's model calls to `<out>/samples/*.jsonl`; (e) aggregates them, so run it last against the same `--out`. `--sample` adds one chat turn per tier on a fresh project. `--gateway` takes a JSONL export of the host gateway stream (`{environment="host",app="gateway",component="requests"}`); only `served_by`, `model`, `status`, `ms`, `stream`, `tools`, `fallback`, `error` and `exit_code` are read, and prompt and answer never reach the output.

## The owner's notes (c2)

The owner's notes are never copied into the repo, a prompt, a log line or a commit. The script reads them at runtime and writes results only to `--out`.

1. Choose a private output dir outside the repo, for example your session scratchpad.
2. Write the gold file there as `owner-gold.json`, before the run, in the same format as `fixtures/notes/*.gold.json`: `facts` and `decisions` (`id`, `statement`, `critical`, `match: { all?, any? }`, `undecided?`), `timing` (`event`, `after?`, `earliestVolume?`, `notInOpening?`) and `forbidden` (`match`, `unlessAlso?`). Terms match whole words, allow a plural `s`, and accept `a|b` alternatives. The run refuses gold that its own notes cannot satisfy.
3. Run `bun scripts/evals/novel-forge/c2-notes-fidelity.ts --owner-notes <path> --out <dir>` (add `--inputs none` to skip the invented inputs). The terminal shows counts only; the detail is in `<dir>`.

## DeepEval genre-craft suite (g)

Two steps. `g-genre-craft.ts` drives Novel Forge like the other suites: for each fixture in `fixtures/genres/` it creates a project with the fixture's premise, writing instructions and word target, seeds the cast, open world facts and milestone-gated secrets, then writes each chapter's brief and writes, approves and finalizes chapters 1..N in order through the real generate job with repair on (`autoFix`), as authors do, so each chapter continues from canon. It writes `cases.jsonl` (one case per chapter: brief, the canon the writer was given — its writer snapshot when readable, otherwise the seeded canon, as for every unrestricted chapter — the previous chapter's summary and ending, the secrets that must stay hidden with their give-away terms, the prose, its prose-only word count and target, and the run's model calls), `generation.json`, `generation.md` and `chapters/`. Then `deepeval/` (a `uv` project) judges the cases and writes `result.json` and `summary.md` beside them.

Real runs cost money twice: the chapters, and the judge — one preflight call, then up to six Claude calls per chapter (one per LLM metric), plus one corrective retry for any reply that is not valid JSON. The judge is Claude only; the runner refuses any model outside `anthropic/*`. The preflight fails the run with exit 2 on an auth or connection error before any case is judged, and the key is masked in every error the runner writes.

| What                         | How                                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup                        | `cd scripts/evals/novel-forge/deepeval && uv sync` — `uv` fetches a Python ≥3.11 if none is installed; with no `uv`, install it first (`brew install uv`) |
| `NF_DEEPEVAL_JUDGE_BASE_URL` | OpenAI-compatible endpoint, default `https://openrouter.ai/api/v1`; the local CLI gateway is `http://127.0.0.1:7431/v1`                                   |
| `NF_DEEPEVAL_JUDGE_API_KEY`  | required unless the base URL is a loopback address or `--judge fake`; never logged or written                                                             |
| `NF_DEEPEVAL_JUDGE_MODEL`    | default `anthropic/claude-opus-5.5`                                                                                                                       |
| Runner flags                 | `--cases <cases.jsonl>`, `--judge claude\|fake` (default claude), `--out <dir>` (default beside the cases), `--concurrency <n>` (default 2)               |

```sh
bun scripts/evals/novel-forge/g-genre-craft.ts [--fixtures occult-ascent,crown-and-forge,ledger-of-levels] [--chapters 3] [--content-mode standard|unrestricted] [--tier <tier>] --out <dir>
cd scripts/evals/novel-forge/deepeval && uv run python run_eval.py --cases <dir>/g-genre-craft/<timestamp>/cases.jsonl
```

Offline, no cost: add `--dry-run` to the generator (the fake writes word-target-length prose and, for the game-system fixture, a `system` panel copied from canon) and `--judge fake` to the runner (deterministic scores from a hash of each prompt). Both must exit 0. The runner's own tests run with `uv run python -m unittest`, and its lint with `uvx ruff check` and `uvx ruff format --check`; neither is wired into `bun scripts/verify.ts`, so run them by hand after changing `deepeval/`.

Metrics. GEval with explicit steps: brief adherence (0.7), canon continuity (0.7), prose craft (0.6), serial hook (0.6), genre craft with steps for the fixture's archetype (0.6), and secret discipline (0.8, only when a secret is still hidden). Deterministic: prose length within the target, system panels and tables excluded (0.8, about 10% outside the range); secret leak (1.0, when a secret is still hidden): any of a locked secret's reveal patterns matching the prose scores 0, with give-away terms reported as advisory; and for the game-system fixture, system-panel and table well-formedness (1.0) and stat consistency against the canon's starting values or the previous chapter's last panel — any tracked stat that falls, or rises by more than max(3, half its value), is flagged (1.0). A panel whose title names another cast member is not read as the protagonist's, and only a cell that is a plain integer or `n/m` is read as a value.

Reading results: `summary.md` lists failures and errors first, then each fixture × metric's mean and min, then every case's reason; `result.json` holds the same data. A metric gates when any case scores below its threshold. Exit codes: 0 pass; 1 a gated metric failed; 2 a setup or run error — a judge call that failed after retries, a reply that stayed invalid JSON after one corrective retry, a fixture with no cases, or no cases at all. The generator exits 2 when any fixture stopped early, after still writing the cases it has; judge such a partial set only knowingly. Generated chapters for a fixture are correlated: report n per fixture, and read the reasons before trusting a mean.

## Fixtures

All invented and original: `fixtures/story/` (a progression story with milestone-gated secrets, 30 chapter plans, a 20-chapter baseline and continuity checks), `fixtures/notes/` (a vague idea, about 3,000 words of notes, and notes with conflicting versions, each with gold written before any run), `fixtures/provenance-turns.json`, and `fixtures/genres/` (three original genre stories — secret-society mystery progression, a transmigrated engineer's besieged border town, and a mechanic who sees a game-system interface — each with a premise, writing instructions, cast, world facts, milestone-gated secrets and three chapter briefs). The story's plans and baseline are checked on every run against its own secrets, so a fixture edit that reveals a secret early stops the run; a genre fixture is checked the same way when loaded, and also refused when a brief or an allowed clue names a give-away term. Occult-ascent's chapter 3 brief deliberately pressures the hidden truth about Dora (a ledger page razored out for the month she vanished) without stating it: it tests controlled revelation and the secret-discipline judgement.

## Reading results

Repeated runs of one story or input are correlated and are not independent evidence. Report n and the per-input distribution. Pattern checks (c3, c5) find candidates for a person to confirm. They do not give verdicts.
