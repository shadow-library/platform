import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ESLint } from 'eslint';

import { findScript, log, reportError, reportTestBudget, resolveBin, run, ShadowError } from './utils/index.ts';
import { findWorkspace, findWorkspaces, REPO_ROOT, type Workspace } from './workspaces.ts';

interface VerifyOptions {
  fix: boolean;
  /** Stops after format and lint, the pre-commit speed budget. */
  fast: boolean;
  /** Runs the test step only. */
  unit: boolean;
  /** Fails an `apps/*` test over the 50ms hard cap instead of only warning. */
  ci: boolean;
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

const USAGE = `Usage: bun scripts/verify.ts [workspace | scripts | --all] [--fix] [--fast] [--unit] [--ci]

  workspace   repo-relative directory (packages/common) or package name (@shadow-library/common)
  scripts     the root tooling itself — scripts/ and the root-level configs
  --all       verify the root tooling and every workspace, and report a combined result
  --fix       apply prettier and eslint fixes in place instead of only reporting
  --fast      stop after format + lint, skipping type-check and test
  --unit      run only the test step — "bun test" directly for apps/* (ignoring any package.json "test"
              script), the workspace's own "test" script elsewhere when it defines one (packages that
              need "bun test --isolate" or vitest) — skips format/lint/type-check; combine with --all to
              run every opted-in workspace; incompatible with --fix and --fast
  --ci        for an apps/* workspace, fail the test step when a test exceeds the 50ms hard cap, listing
              offenders — without it, a test over budget only warns; applies to --unit and to the normal
              test step alike. packages/* and other non-app workspaces stay warn-only regardless`;

// Passed explicitly: prettier runs from the repo root, so a workspace-local ignore file would never be discovered.
const IGNORE_FILES = ['.gitignore', '.prettierignore'];

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
  const result = run(resolveBin('tsc', [target.path, REPO_ROOT]), ['-p', target.tsconfigPath, '--noEmit'], { cwd: target.path });
  if (result.status !== 0) {
    log.error('failed type-check');
    return false;
  }

  log.success('type-check ok');
  return true;
}

// `--timeout 1000` is only a hang guard, kept well above the 50ms `--ci` cap so the budget split is enforced by reportTestBudget, not bun's timeout.
// A workspace with no test files exits non-zero without writing the junit report.
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

// Only the `bun test` fallback gets the junit budget reporter and the `--ci` gate.
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

// Non-app workspaces keep their own `test` script: packages/fastify needs `--isolate` against leaking `mock.module`, and packages/ui is vitest.
function runUnitTarget(target: VerifyTarget, ci: boolean): boolean {
  log.info(`\nverifying ${target.dir} (unit)`);

  if (!target.verifyTest) {
    log.info('tests skipped — workspace has not opted into verify running tests');
    return true;
  }

  return target.dir.startsWith('apps/') ? runBunTestWithBudget(target, ci) : runTest(target, ci);
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
  if (target.verifyTest && !runTest(target, options.ci)) return false;

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
