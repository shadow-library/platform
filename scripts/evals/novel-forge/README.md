# Novel Forge model-backed evals

Runnable suites for the chat-first evaluation plan (rows c1–c5 and e). Each one drives a reachable Novel Forge server through its public API, the way the web does, and writes `result.json` and `summary.md` to `<out>/<suite>/<timestamp>/`.

These make real model calls and cost money. They are not tests: `bun scripts/verify.ts scripts` type-checks, lints and formats them but never runs them, and `bun test` does not pick them up (no `*.spec.ts` / `*.test.ts` files).

## Setup

Run everything from the repo root.

| What        | How                                                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target      | `--base-url`, else `NF_EVAL_BASE_URL`, else `E2E_NOVEL_FORGE_URL`, else `https://novelforge.shadow-apps.test` (the k3d dev ingress; its self-signed certificate is accepted for `*.test` hosts)             |
| Credentials | `NF_EVAL_TOKEN` (a bearer token for audience `api://novel-forge`), or `NF_EVAL_STORAGE_STATE` (a Playwright storage state such as `e2e/.auth/user1.json` from the e2e `setup` project), or `NF_EVAL_COOKIE` |
| Output      | `--out <dir>` or `NF_EVAL_OUT_DIR`; default `<os tmpdir>/novel-forge-evals`. A path inside the repo is refused unless git ignores it.                                                                       |
| Tier        | `--tier economy\|balanced\|performant` sets the project's cost tier and every turn's; omitted, the project default applies                                                                                  |

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

Every suite appends its timings and each run's model calls to `<out>/samples/*.jsonl`; (e) aggregates them, so run it last against the same `--out`. `--sample` adds one chat turn per tier on a fresh project. `--gateway` takes a JSONL export of the host gateway stream (`{environment="host",app="gateway",component="requests"}`); only `served_by`, `model`, `status`, `ms`, `stream`, `tools`, `fallback`, `error` and `exit_code` are read, and prompt and answer never reach the output.

## The owner's notes (c2)

The owner's notes are never copied into the repo, a prompt, a log line or a commit. The script reads them at runtime and writes results only to `--out`.

1. Choose a private output dir outside the repo, for example your session scratchpad.
2. Write the gold file there as `owner-gold.json`, before the run, in the same format as `fixtures/notes/*.gold.json`: `facts` and `decisions` (`id`, `statement`, `critical`, `match: { all?, any? }`, `undecided?`), `timing` (`event`, `after?`, `earliestVolume?`, `notInOpening?`) and `forbidden` (`match`, `unlessAlso?`). Terms match whole words, allow a plural `s`, and accept `a|b` alternatives. The run refuses gold that its own notes cannot satisfy.
3. Run `bun scripts/evals/novel-forge/c2-notes-fidelity.ts --owner-notes <path> --out <dir>` (add `--inputs none` to skip the invented inputs). The terminal shows counts only; the detail is in `<dir>`.

## Fixtures

All invented and original: `fixtures/story/` (a progression story with milestone-gated secrets, 30 chapter plans, a 20-chapter baseline and continuity checks), `fixtures/notes/` (a vague idea, about 3,000 words of notes, and notes with conflicting versions, each with gold written before any run), and `fixtures/provenance-turns.json`. The story's plans and baseline are checked on every run against its own secrets, so a fixture edit that reveals a secret early stops the run.

## Reading results

Repeated runs of one story or input are correlated and are not independent evidence. Report n and the per-input distribution. Pattern checks (c3, c5) find candidates for a person to confirm. They do not give verdicts.
