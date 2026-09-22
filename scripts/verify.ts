/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ESLint } from 'eslint';

/**
 * Importing user defined packages
 */
import { findScript, log, reportError, reportTestBudget, resolveBin, run, ShadowError } from './utils/index.ts';
import { findWorkspace, findWorkspaces, REPO_ROOT, type Workspace } from './workspaces.ts';

/**
 * Defining types
 */
interface VerifyOptions {
  /** Apply fixes in place (prettier `--write`, eslint `--fix`) instead of only reporting. */
  fix: boolean;
  /** Stop after format + lint, skipping type-check/test — the pre-commit hook's speed budget. */
  fast: boolean;
  /** Run only the test step, always as `bun test` directly — the fast unit-test dev loop. */
  unit: boolean;
  /** For an `apps/*` workspace, fail the test step on any test over the 50ms hard cap instead of only warning. */
  ci: boolean;
}

/**
 * What a single verify pass runs against. Every workspace maps to one, and so does the root tooling
 * (`scripts/` plus the root-level configs), which is not a workspace but still has to be held to the
 * same format and lint rules as the code it checks.
 */
interface VerifyTarget {
  /** Label, and the identifier accepted on the command line. */
  dir: string;
  /** ESLint's cwd — decides which flat config applies via its own upward lookup. */
  path: string;
  /** Repo-relative paths or globs handed to prettier. */
  formatPaths: string[];
  /** Paths or globs handed to ESLint, relative to {@link path}. */
  lintPaths: string[];
  /** Absolute path to the tsconfig the type-check step points `tsc` at. */
  tsconfigPath: string;
  /** The package.json `test` script, when the workspace defines one — preferred over the `bun test` fallback. */
  scripts: Record<string, string> | undefined;
  verifyTest: boolean;
  /** Whether `--ci` may fail this target's test step on the 50ms budget — `apps/*` only; everything else stays warn-only. */
  ciScoped: boolean;
}

/**
 * Declaring the constants
 */
const USAGE = `Usage: bun scripts/verify.ts [workspace | scripts | --all] [--fix] [--fast] [--unit] [--ci]

  workspace   repo-relative directory (packages/common) or package name (@shadow-library/common)
  scripts     the root tooling itself — scripts/ and the root-level configs
  --all       verify the root tooling and every workspace, and report a combined result
  --fix       apply prettier and eslint fixes in place instead of only reporting
  --fast      stop after format + lint, skipping type-check and test
  --unit      run only the test step, always as "bun test" (ignores any package.json "test" script) —
              skips format/lint/type-check; combine with --all to run every opted-in workspace;
              incompatible with --fix and --fast
  --ci        for an apps/* workspace, fail the test step when a test exceeds the 50ms hard cap, listing
              offenders — without it, a test over budget only warns; applies to --unit and to the normal
              test step alike. packages/* and other non-app workspaces stay warn-only regardless`;

/**
 * Ignore files prettier is pointed at, repo-relative. Passed explicitly (rather than relying on prettier's
 * cwd-relative defaults) because verify runs prettier from the repo root against a workspace subdirectory,
 * where a workspace-local ignore file would never be discovered.
 */
const IGNORE_FILES = ['.gitignore', '.prettierignore'];

/**
 * The root tooling: `scripts/` and the root-level configs. Not a workspace, so `--all` would otherwise
 * leave the tooling that verifies everything else as the one thing nothing verifies.
 */
const TOOLING_TARGET: VerifyTarget = {
  dir: 'scripts',
  path: REPO_ROOT,
  formatPaths: ['scripts', '*.ts', '*.json', '*.md'],
  lintPaths: ['scripts', '*.config.ts'],
  tsconfigPath: path.join(REPO_ROOT, 'tsconfig.json'),
  scripts: undefined,
  verifyTest: false,
  ciScoped: false,
};

/** Adapts a workspace to a verify target: prettier gets the whole directory, ESLint runs inside it. */
function toTarget(workspace: Workspace): VerifyTarget {
  return {
    dir: workspace.dir,
    path: workspace.path,
    formatPaths: [workspace.dir],
    lintPaths: ['.'],
    tsconfigPath: path.join(workspace.path, 'tsconfig.json'),
    scripts: workspace.packageJson.scripts,
    verifyTest: workspace.verifyTest,
    ciScoped: workspace.dir.startsWith('apps/'),
  };
}

/**
 * Formats a workspace with prettier, which resolves the root `.prettierrc.json` itself — so `verify` and a
 * bare `prettier` run (editor format-on-save, `bunx prettier`) format identically, with no second ruleset
 * to drift. The CLI (not the Node API) owns file discovery, so the ignore files are the single definition
 * of what is off limits.
 */
function runFormat(target: VerifyTarget, fix: boolean): boolean {
  const ignoreArgs = IGNORE_FILES.filter(file => fs.existsSync(path.join(REPO_ROOT, file))).flatMap(file => ['--ignore-path', file]);
  const args = [fix ? '--write' : '--check', '--log-level', 'warn', ...ignoreArgs, ...target.formatPaths];
  const result = run(resolveBin('prettier', [REPO_ROOT]), args, { cwd: REPO_ROOT });

  if (result.status !== 0) {
    log.error(`failed format — run "bun scripts/verify.ts ${target.dir} --fix" to format them`);
    return false;
  }

  log.success(fix ? 'format applied' : 'format ok');
  return true;
}

/**
 * Lints a workspace with no explicit config: ESLint runs with the workspace as its cwd, so flat config's
 * own upward lookup picks the workspace's `eslint.config.ts` when it has one and the root config otherwise.
 * Rules, ignores and overrides therefore live entirely in ESLint's own files.
 */
async function runLint(target: VerifyTarget, fix: boolean): Promise<boolean> {
  const eslint = new ESLint({ cwd: target.path, fix, errorOnUnmatchedPattern: false });
  const results = await eslint.lintFiles(target.lintPaths);
  if (fix) await ESLint.outputFixes(results);

  const output = await (await eslint.loadFormatter('stylish')).format(results);
  if (output.trim()) log.info(output);

  const errorCount = results.reduce((sum, result) => sum + result.errorCount, 0);
  if (errorCount > 0) {
    log.error(`failed lint — ${errorCount} error(s)`);
    return false;
  }

  log.success(fix ? 'lint applied' : 'lint ok');
  return true;
}

/**
 * Type-checks a workspace by running `tsc` directly against its own `tsconfig.json` — every workspace
 * tsconfig extends `tsconfig.base.json`, which sets `noEmit: true`, so this is identical to what each
 * workspace's old, since-deleted `"type-check"` package.json script did (`tsc`, `tsc -p tsconfig.json`,
 * or `tsc --noEmit` were all the same command in disguise). Driving it here — like format and lint —
 * means every workspace is type-checked unconditionally, with no per-workspace script to keep in sync.
 */
function runTypeCheck(target: VerifyTarget): boolean {
  const result = run(resolveBin('tsc', [target.path, REPO_ROOT]), ['-p', target.tsconfigPath, '--noEmit'], { cwd: target.path });
  if (result.status !== 0) {
    log.error('failed type-check');
    return false;
  }

  log.success('type-check ok');
  return true;
}

/**
 * Runs `bun test` directly against `target`, with the junit reporter feeding the 10ms budget report.
 * `--timeout 1000` is a hang safety net only — genuinely stuck tests still get killed rather than hanging
 * for the default 5s — and is deliberately well above the 50ms `--ci` cap, so the budget's warn-vs-fail
 * split is enforced solely by {@link reportTestBudget} rather than by bun's own timeout pre-empting it.
 * `--ci` can only fail a `ciScoped` (apps/*) target; elsewhere the report stays a warning. A workspace
 * with zero matching test files exits non-zero without writing the report, so the budget is only read
 * when it exists.
 */
function runBunTestWithBudget(target: VerifyTarget, ci: boolean): boolean {
  const ciGate = ci && target.ciScoped;
  const outfile = path.join(os.tmpdir(), `shadow-verify-junit-${randomUUID()}.xml`);
  const result = run('bun', ['test', '--timeout', '1000', '--reporter=junit', `--reporter-outfile=${outfile}`], { cwd: target.path });
  const withinBudget = fs.existsSync(outfile) ? reportTestBudget(outfile, { ci: ciGate }) : true;
  fs.rmSync(outfile, { force: true });

  if (result.status !== 0) {
    log.error(`failed test — "bun test" exited with code ${result.status}`);
    return false;
  }
  if (ciGate && !withinBudget) {
    log.error('failed test — one or more tests exceeded the 50ms ci budget');
    return false;
  }

  log.success('test ok');
  return true;
}

/**
 * Runs the workspace's own `test` package.json script when it declares one (a Playwright/vitest suite,
 * or a composed sequence like `packages/app`'s `test:unit && test:integration` — none of these are
 * restatements of a default, so they stay workspace-owned scripts). Otherwise falls back to `bun test`
 * directly, the one path the junit budget reporter and `--ci` gate can apply to.
 */
function runTest(target: VerifyTarget, ci: boolean): boolean {
  const script = findScript(target.scripts, ['test']);
  if (!script) return runBunTestWithBudget(target, ci);

  const result = run('bun', ['run', script.name], { cwd: target.path });
  if (result.status !== 0) {
    log.error(`failed test — "bun run ${script.name}" exited with code ${result.status}`);
    return false;
  }

  log.success('test ok');
  return true;
}

/**
 * The `--unit` dev loop: only the test step, always as `bun test` directly — a workspace's own `test`
 * script (e.g. a composed `test:unit && test:integration`) is bypassed on purpose, since those aren't
 * the fast, DB-free unit run this flag exists for.
 */
function runUnitTarget(target: VerifyTarget, ci: boolean): boolean {
  log.info(`\nverifying ${target.dir} (unit)`);

  if (!target.verifyTest) {
    log.info('tests skipped — workspace has not opted into verify running tests');
    return true;
  }

  return runBunTestWithBudget(target, ci);
}

/**
 * Runs format → lint → type-check → test for one workspace, stopping at the first failure. Format and
 * lint are driven here (prettier and ESLint, each resolving its own config); type-check always runs
 * directly against the workspace's tsconfig; test runs the workspace's own script when it has one,
 * otherwise `bun test` directly — and only for workspaces that opt into `verify` running tests at all.
 * A local pre-commit convenience, not a CI replacement — CI keeps its steps granular for per-step visibility.
 */
export async function verifyTarget(target: VerifyTarget, options: VerifyOptions): Promise<boolean> {
  log.info(`\nverifying ${target.dir}`);

  if (!runFormat(target, options.fix)) return false;
  if (!(await runLint(target, options.fix))) return false;

  if (options.fast) {
    log.success('verify passed (fast — type-check/test skipped)');
    return true;
  }

  if (!runTypeCheck(target)) return false;
  if (target.verifyTest && !runTest(target, options.ci)) return false;

  log.success('verify passed');
  return true;
}

/**
 * Verifies every workspace and reports a combined result. Unlike `build --all` there is no dependency
 * ordering to respect, so workspaces run in declaration order and each one's failure is collected rather
 * than aborting the run — a single pass tells you everything that needs fixing.
 */
async function verifyAll(options: VerifyOptions): Promise<number> {
  const failures: string[] = [];
  for (const target of [TOOLING_TARGET, ...findWorkspaces().map(toTarget)]) {
    if (!(await verifyTarget(target, options))) failures.push(target.dir);
  }

  if (failures.length > 0) {
    log.error(`\nverify failed for ${failures.length} target(s):\n${failures.map(dir => `  ${dir}`).join('\n')}`);
    return 1;
  }

  log.success('\nAll targets verified successfully');
  return 0;
}

/** `--unit --all`: the test step alone for every target, skipping any that hasn't opted into `verifyTest`. */
function verifyUnitAll(ci: boolean): number {
  const failures: string[] = [];
  for (const target of [TOOLING_TARGET, ...findWorkspaces().map(toTarget)]) {
    if (!runUnitTarget(target, ci)) failures.push(target.dir);
  }

  if (failures.length > 0) {
    log.error(`\nunit verify failed for ${failures.length} workspace(s):\n${failures.map(dir => `  ${dir}`).join('\n')}`);
    return 1;
  }

  log.success('\nAll opted-in workspaces passed unit tests');
  return 0;
}

/** Resolves the workspace, or `scripts`, an identifier on the command line names — the shared lookup behind every mode. */
function resolveTarget(args: string[]): VerifyTarget {
  const identifier = args.find(arg => !arg.startsWith('-'));
  if (!identifier) throw new ShadowError(`A workspace, "scripts", or --all is required.\n\n${USAGE}`);
  return identifier === TOOLING_TARGET.dir ? TOOLING_TARGET : toTarget(findWorkspace(identifier));
}

/** Parses argv, verifies either one workspace or all of them, and returns the process exit code. */
async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    log.info(USAGE);
    return 0;
  }

  const options: VerifyOptions = { fix: args.includes('--fix'), fast: args.includes('--fast'), unit: args.includes('--unit'), ci: args.includes('--ci') };
  if (options.unit && options.fix) throw new ShadowError(`--unit cannot be combined with --fix — a tests-only run has nothing to fix.\n\n${USAGE}`);
  if (options.unit && options.fast) throw new ShadowError(`--unit cannot be combined with --fast — --unit already skips format/lint/type-check.\n\n${USAGE}`);

  if (options.unit) {
    if (args.includes('--all')) return verifyUnitAll(options.ci);
    return runUnitTarget(resolveTarget(args), options.ci) ? 0 : 1;
  }

  if (args.includes('--all')) return verifyAll(options);
  return (await verifyTarget(resolveTarget(args), options)) ? 0 : 1;
}

process.exitCode = await main().catch(reportError);
