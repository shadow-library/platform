# @shadow-library/scripts

A shared CLI for the Shadow Library ecosystem. It centralizes the workflows that were duplicated — and
had drifted — across the `shadow-library/*` repositories: the library build, local verification
(format + lint + type-check + test), OpenAPI type generation, release, and the migration-drift check.

Everything is driven from a single **`.shadowrc.json`** at the repo root, and every command runs on
[Bun](https://bun.sh). The binary is named **`shadow`**.

## Installation

```bash
bun add -D @shadow-library/scripts
```

## Commands

```text
shadow build
shadow verify [--fix]
shadow gen-api-types <url> [--out <path>]
shadow release <stable|alpha|beta> [--path <path>]
shadow check-migrations [--dir <path>]
```

Run `shadow --help` for a summary. This document is the full reference.

## Configuration — `.shadowrc.json`

A single file at the repo root configures every command. All fields are optional; the defaults below
apply when the file (or a field) is absent.

```jsonc
{
  "build": {
    "exports": { ".": "index" },       // public subpath → source-relative base (no extension)
    "bin": { "my-cli": "bin/my-cli" }, // optional; string shorthand also accepted
    "outDir": "dist"
  },
  "verify": {
    "files": "{src,tests,scripts}/**/*.ts",  // what lint + format cover
    "lint": {
      "rules": {},                     // merged over the shipped ESLint flat config
      "ignores": []                    // appended to the shipped ignore globs
    },
    "format": {}                       // prettier options merged over the base ruleset
  },
  "release": {
    "npm": true,                       // publish to npm after tagging
    "publishDir": "dist",
    "changelog": true                  // generate the GitHub release body from commits
  },
  "genApiTypes": {
    "outputPath": "src/lib/apis/api-types.gen.ts"
  },
  "checkMigrations": {
    "dir": "generated/drizzle"
  }
}
```

### `build`

Cleans `outDir`, compiles the package with `tsc` + `tsc-alias`, synthesizes `dist/package.json`
(`main`/`module`/`types`/`exports`/`typesVersions`, rewritten `sideEffects` and `bin` paths), and copies
`README.md`/`LICENSE` into the output if present.

Produces a single, flat **ESM** tree (no `esm/`/`cjs/` subdirectories, no CommonJS) with type
declarations and correct subpath exports. The `exports` map is keyed by public subpath and valued by the
source-relative base:

```jsonc
{ "build": { "exports": { ".": "index", "./errors": "errors/index", "./utils": "utils/index" } } }
```

A `bin` entry (string shorthand or `name → base` map) is rewritten into `dist/package.json` pointing at
the compiled `./…js`, gets a `bun` shebang injected if missing, and is `chmod 755`'d.

**Prerequisites:** a `tsconfig.build.json` extending your `tsconfig.json` (`noEmit: false`,
`declaration: true`). `typescript` and `tsc-alias` ship as dependencies of this package.

### `verify [--fix]`

Runs, in order, stopping at the first failure:

1. **format** — Prettier over `verify.files`. The base ruleset (`singleQuote`, `trailingComma: all`,
   `printWidth: 180`, `arrowParens: avoid`) is merged with `verify.format` overrides.
2. **lint** — ESLint using the **shipped flat config** (`typescript-eslint` strict + stylistic, with
   **`eslint-plugin-perfectionist`** handling import sorting). `verify.lint.rules` / `verify.lint.ignores`
   are layered on top. No `eslint.config.js` is needed in the consuming repo.
3. **type-check** — the repo's `type-check` (or `typecheck`) package.json script, if present.
4. **test** — the repo's `test` package.json script, if present.

`--fix` applies Prettier and ESLint fixes in place. Steps 3–4 are delegated to the repo's own scripts;
a step that maps back to `shadow verify` is skipped instead of recursing. This is a local pre-commit
convenience, not a CI replacement.

### `gen-api-types <url>`

Fetches an OpenAPI document, rewrites every `operationId` to `${method}_${path}` (unique by
construction), widens non-string GET query parameter types to also accept `string`, runs
`openapi-typescript`, appends per-schema and `<Name>QueryParams`/`<Name>PathParams` aliases, formats with
Prettier (the same base ruleset as `verify`), and writes it out atomically.

Output path defaults to `genApiTypes.outputPath`; override per-invocation with `--out <path>`.

### `release <stable|alpha|beta>`

You choose only the **channel**; the CLI infers the rest:

1. Reads the commits since the last `v*` tag and derives the semver bump from Conventional Commits —
   any breaking change → **major**, any `feat` → **minor**, otherwise → **patch**.
2. Computes the next version for the chosen channel (`stable` finalizes; `alpha`/`beta` cut or advance a
   prerelease).
3. Runs the test gate, builds, then performs **every remote git operation through Octokit**: a Verified
   `package.json` commit on `main` (Contents API), the `v<version>` tag, and the GitHub release (marked
   pre-release for `alpha`/`beta`).
4. Publishes `publishDir` to npm when `release.npm` is `true`.

**Prerequisites:** `GITHUB_TOKEN` in the environment (a GitHub App installation token, so the commit is
Verified), `NODE_AUTH_TOKEN` for npm publish, and a checkout with full history and tags
(`fetch-depth: 0`). `--path` defaults to `process.cwd()`.

### `check-migrations [--dir <path>]`

Runs the repo's `db:generate` script, then fails if it leaves the migrations directory dirty — checking
both modified **and** untracked files (`git status --porcelain`), since a new migration is a new file
`git diff` alone would never flag. `--dir` defaults to `checkMigrations.dir` and must resolve inside the
repo.

## Example — a library repo

`.shadowrc.json`:

```json
{ "build": { "exports": { ".": "index" } } }
```

`package.json`:

```json
{
  "scripts": {
    "build": "shadow build",
    "verify": "shadow verify",
    "type-check": "tsc"
  }
}
```

## Failure and exit-code behavior

Every command throws a `ShadowError` on failure; the CLI catches it, prints the message (no stack trace)
to stderr, and sets the exit code — `error.exitCode` when set, otherwise `1`. `verify` propagates a
delegated step's own exit code. Unexpected (non-`ShadowError`) failures print a full stack trace so a bug
in this package isn't silently swallowed.
