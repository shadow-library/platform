# Root tooling and CI wiring

Authored 2026-07-31 during the AI-tooling consolidation pass (see provenance note in
`monorepo-workspace-map.md` — no per-repo Serena memories existed to migrate this from; verified
directly against `scripts/`, `.github/workflows/ci.yml`, and `.husky/*` in this repo).

## The `shadow` CLI (`scripts/`)

- Root tooling, not a package: `scripts/` is not a Bun workspace, never installed as a dependency.
  Entry point `scripts/src/bin/shadow.ts`. Commands: `init`, `prepare`, `build`, `verify [--fix]
  [--fast]`, `commit-msg <file>`, `gen-api-types <url>`, `check-migrations`. **There is no `release`
  command** — release/publish tooling was retired with the monorepo migration; every `packages/*` is
  private and consumed via `workspace:*`.
- `shadow verify` order: Prettier (root `.prettierrc.json`) → ESLint (shipped flat config +
  `.shadowrc.json` `verify.lint` overrides) → the workspace's own `type-check` script → the workspace's
  own `test` script (skippable via `.shadowrc.json` `verify.test: false` or the `--fast` flag, which
  stops after lint — that's the pre-commit hook's speed budget).
- `.shadowrc.json` `verify.test: false` is set on `identity-web`, `novel-forge-web`, `pulse-web` (their
  `test` script is a Playwright e2e suite needing a live backend, out of `verify`'s scope). It is
  **not** set on `web-novel-web` (its `test` is `vitest run`, a real jsdom unit suite that runs in
  `verify`) or on `packages/ui` (its `test` = `vitest run --project unit` runs in `verify`; only the
  separate `test:stories` script — the Storybook interaction/a11y project — is never invoked by
  `verify`).

## Husky — root only

`"prepare": "husky"` in the root `package.json` is the only hook activation in the repo. `.husky/pre-commit`
maps staged files to the workspace(s) they touch (via path patterns: `apps/<x>/**` → `apps/<x>`;
`packages/<x>/**` → `packages/<x>`; `scripts/**` → the `scripts` pseudo-workspace, verified via
`scripts/scripts/verify.ts` since it has no `package.json` for `shadow verify` to read) and runs `shadow
verify --fast` scoped to each. `.husky/commit-msg` runs `shadow commit-msg "$1"`. No workspace wires its
own husky hooks — don't add one when scaffolding a new workspace.

## CI (`.github/workflows/ci.yml`) — single workflow, no separate publish job

1. A `changes` job diffs against the merge-base and expands the changed files into affected workspace
   names: `apps/<x>/**` → that app only; `e2e/**` → `e2e` only; anything under `packages/**`,
   `scripts/**`, or root config (`package.json`, `bun.lock`, `tsconfig.base.json`, `.prettierrc.json`,
   the workflow file itself) → **every** workspace. Workspaces are enumerated from the filesystem at run
   time, not hardcoded — a new `apps/*`/`packages/*` needs no workflow edit.
2. One `verify` matrix job per affected workspace (`fail-fast: false`, capped parallelism). Each job:
   builds `packages/*` first (`bun run --filter './packages/*' build` — Bun's `--filter` has no
   pnpm-style dependency-closure selector, but it does respect package dependency order for whatever it
   matches), optionally checks migrations / creates a template DB for backends that need Postgres, then
   runs `bun run verify` and `bun run build` inside that workspace.
3. Postgres + Redis services run unconditionally on the `verify` job (can't be made conditional per
   matrix leg) — a workspace that doesn't need them just never talks to those ports.
4. `bun run --filter '*' verify` at the repo root (root `package.json`'s `verify` script) is the
   whole-platform equivalent — it also respects dependency order per Bun's own `--filter` semantics.

## No release tooling, anywhere

Confirmed absent from the CLI's own `--help` output and from every `.shadowrc.json`: no `release` block,
no `shadow release` command, no publish workflow file. A breaking change to a `packages/*` export is
handled by fixing every first-party `apps/*` consumer in the *same* change (see root `AGENTS.md`
§"Working across workspaces") — not by cutting a new package version for consumers to adopt later.
