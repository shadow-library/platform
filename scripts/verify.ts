import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ESLint } from 'eslint';

import { findScript, log, reportError, reportTestBudget, run, ShadowError } from './utils/index.ts';
import { findWorkspace, findWorkspaces, REPO_ROOT, type Workspace } from './workspaces.ts';

interface VerifyOptions {
  fix: boolean;
  /** Stops after format and lint, the pre-commit speed budget. */
  fast: boolean;
  /** Runs the test step only. */
  unit: boolean;
  /** Runs the type-check step only. */
  types: boolean;
  /** Fails an `apps/*` test over the 50ms hard cap instead of only warning, and implies {@link isolate}. */
  ci: boolean;
  /** Gives each test file a fresh global, so one passing only because another leaked state fails. */
  isolate: boolean;
  /** `--watch`, `--coverage`, `--changed`: forwarded to `bun test`, so a workspace with its own `test` script is skipped. */
  testModes: string[];
}

interface VerifyTarget {
  dir: string;
  /** ESLint's cwd; decides which flat config applies. */
  path: string;
  formatPaths: string[];
  /** Relative to {@link path}. */
  lintPaths: string[];
  tsconfigPath: string;
  scripts: Record<string, string> | undefined;
  verifyTest: boolean;
  /** `apps/*` only: `--ci` can fail its test step; elsewhere the budget is warn-only. */
  ciScoped: boolean;
}

const USAGE = `Usage: bun scripts/verify.ts [workspace | scripts | --all] [--fix] [--fast] [--unit] [--types] [--ci] [--isolate]
                            [--watch] [--coverage] [--changed[=ref]]

  workspace   repo-relative directory (packages/common) or package name (@shadow-library/common)
  scripts     the root tooling itself — scripts/ and the root-level configs
  --all       verify the root tooling and every workspace, and report a combined result
  --fix       apply bun fmt and eslint fixes in place instead of only reporting
  --fast      stop after format + lint, skipping type-check and test
  --unit      run only the test step — "bun test" directly for apps/* (ignoring any package.json "test"
              script), the workspace's own "test" script elsewhere when it defines one (packages that
              need "bun test --isolate" or vitest) — skips format/lint/type-check; combine with --all to
              run every opted-in workspace; incompatible with --fix and --fast
  --types     run only the type-check step; incompatible with --fix, --fast and --unit
  --ci        for an apps/* workspace, fail the test step when a test exceeds the 50ms hard cap, listing
              offenders — without it, a test over budget only warns; applies to --unit and to the normal
              test step alike. packages/* and other non-app workspaces stay warn-only regardless.
              Implies --isolate
  --isolate   run "bun test" with a fresh global per test file — catches a test that passes only because
              another file leaked state into it; several times slower on a large suite
  --watch     with --unit: rerun on change; a single workspace only
  --coverage  with --unit: report coverage
  --changed   with --unit: run only the tests whose import graph reaches a change, optionally against a ref.
              Blind across workspaces — apps import packages through dist/, so never a substitute for a full run`;

const TEST_MODE_PATTERN = /^--(watch|coverage|changed(=.+)?)$/;

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

// `--no-script`: a workspace or root `fmt`/`check` script would otherwise replace the tool outright and could turn this gate into a no-op.
function runFormat(target: VerifyTarget, fix: boolean): boolean {
  const args = ['fmt', '--no-script', fix ? '--write' : '--check', '--log-level', 'warn', ...target.formatPaths];
  const result = run('bun', args, { cwd: REPO_ROOT });

  if (result.status !== 0) {
    log.error(`failed format — run "bun scripts/verify.ts ${target.dir} --fix" to format them`);
    return false;
  }

  log.success(fix ? 'format applied' : 'format ok');
  return true;
}

// ESLint's flat-config upward lookup from the workspace cwd finds the single root config.
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

function runTypeCheck(target: VerifyTarget): boolean {
  const result = run('bun', ['check', '--no-script', '-p', target.tsconfigPath], { cwd: target.path });
  if (result.status !== 0) {
    log.error('failed type-check');
    return false;
  }

  log.success('type-check ok');
  return true;
}

// `--timeout 1000` is only a hang guard, kept well above the 50ms `--ci` cap so the budget split is enforced by reportTestBudget, not bun's timeout.
// A workspace with no test files exits non-zero without writing the junit report.
// Not `--parallel`: contention pushes tests over the 50ms cap and the fastify integration specs share a fixed port; sequential is also faster here, the per-file isolation cost dominating.
function runBunTestWithBudget(target: VerifyTarget, options: VerifyOptions): boolean {
  const ciGate = options.ci && target.ciScoped;
  const outfile = path.join(os.tmpdir(), `shadow-verify-junit-${randomUUID()}.xml`);
  const isolation = options.ci || options.isolate ? ['--isolate'] : [];
  const result = run('bun', ['test', '--timeout', '1000', '--reporter=junit', `--reporter-outfile=${outfile}`, ...isolation, ...options.testModes], { cwd: target.path });
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

// Only the `bun test` fallback gets the junit budget reporter and the `--ci` gate.
function runTest(target: VerifyTarget, options: VerifyOptions): boolean {
  const script = findScript(target.scripts, ['test']);
  if (!script) return runBunTestWithBudget(target, options);

  const result = run('bun', ['run', script.name], { cwd: target.path });
  if (result.status !== 0) {
    log.error(`failed test — "bun run ${script.name}" exited with code ${result.status}`);
    return false;
  }

  log.success('test ok');
  return true;
}

// Non-app workspaces keep their own `test` script: packages/fastify needs `--isolate` against leaking `mock.module`, and packages/ui is vitest.
function runUnitTarget(target: VerifyTarget, options: VerifyOptions): boolean {
  log.info(`\nverifying ${target.dir} (unit)`);

  if (!target.verifyTest) {
    log.info('tests skipped — workspace has not opted into verify running tests');
    return true;
  }

  const isApp = target.dir.startsWith('apps/');
  if (options.testModes.length > 0 && !isApp && findScript(target.scripts, ['test'])) {
    log.info(`tests skipped — ${options.testModes.join(' ')} applies to "bun test", and this workspace has its own "test" script`);
    return true;
  }

  return isApp ? runBunTestWithBudget(target, options) : runTest(target, options);
}

export async function verifyTarget(target: VerifyTarget, options: VerifyOptions): Promise<boolean> {
  log.info(`\nverifying ${target.dir}`);

  if (!runFormat(target, options.fix)) return false;
  if (!(await runLint(target, options.fix))) return false;

  if (options.fast) {
    log.success('verify passed (fast — type-check/test skipped)');
    return true;
  }

  if (!runTypeCheck(target)) return false;
  if (target.verifyTest && !runTest(target, options)) return false;

  log.success('verify passed');
  return true;
}

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

function verifyTypesAll(): number {
  const failures: string[] = [];
  for (const target of [TOOLING_TARGET, ...findWorkspaces().map(toTarget)]) {
    log.info(`\nverifying ${target.dir} (types)`);
    if (!runTypeCheck(target)) failures.push(target.dir);
  }

  if (failures.length > 0) {
    log.error(`\ntype-check failed for ${failures.length} target(s):\n${failures.map(dir => `  ${dir}`).join('\n')}`);
    return 1;
  }

  log.success('\nAll targets type-checked successfully');
  return 0;
}

function verifyUnitAll(options: VerifyOptions): number {
  const failures: string[] = [];
  for (const target of [TOOLING_TARGET, ...findWorkspaces().map(toTarget)]) {
    if (!runUnitTarget(target, options)) failures.push(target.dir);
  }

  if (failures.length > 0) {
    log.error(`\nunit verify failed for ${failures.length} workspace(s):\n${failures.map(dir => `  ${dir}`).join('\n')}`);
    return 1;
  }

  log.success('\nAll opted-in workspaces passed unit tests');
  return 0;
}

function resolveTarget(args: string[]): VerifyTarget {
  const identifier = args.find(arg => !arg.startsWith('-'));
  if (!identifier) throw new ShadowError(`A workspace, "scripts", or --all is required.\n\n${USAGE}`);
  return identifier === TOOLING_TARGET.dir ? TOOLING_TARGET : toTarget(findWorkspace(identifier));
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    log.info(USAGE);
    return 0;
  }

  const options: VerifyOptions = {
    fix: args.includes('--fix'),
    fast: args.includes('--fast'),
    unit: args.includes('--unit'),
    types: args.includes('--types'),
    ci: args.includes('--ci'),
    isolate: args.includes('--isolate'),
    testModes: args.filter(arg => TEST_MODE_PATTERN.test(arg)),
  };
  if (options.unit && options.fix) throw new ShadowError(`--unit cannot be combined with --fix — a tests-only run has nothing to fix.\n\n${USAGE}`);
  if (options.unit && options.fast) throw new ShadowError(`--unit cannot be combined with --fast — --unit already skips format/lint/type-check.\n\n${USAGE}`);
  if (options.types && (options.fix || options.fast || options.unit)) throw new ShadowError(`--types cannot be combined with --fix, --fast or --unit.\n\n${USAGE}`);
  if (options.testModes.length > 0 && !options.unit) throw new ShadowError(`${options.testModes.join(' ')} requires --unit.\n\n${USAGE}`);
  if (options.testModes.includes('--watch') && args.includes('--all')) throw new ShadowError(`--watch needs a single workspace, not --all.\n\n${USAGE}`);

  if (options.types) {
    if (args.includes('--all')) return verifyTypesAll();
    return runTypeCheck(resolveTarget(args)) ? 0 : 1;
  }

  if (options.unit) {
    if (args.includes('--all')) return verifyUnitAll(options);
    return runUnitTarget(resolveTarget(args), options) ? 0 : 1;
  }

  if (args.includes('--all')) return verifyAll(options);
  return (await verifyTarget(resolveTarget(args), options)) ? 0 : 1;
}

process.exitCode = await main().catch(reportError);
