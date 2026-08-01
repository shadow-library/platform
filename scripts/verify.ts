/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

import { ESLint } from 'eslint';

/**
 * Importing user defined packages
 */
import { findScript, log, readPackageJson, reportError, resolveBin, run, ShadowError } from './utils/index.ts';
import { findWorkspace, findWorkspaces, REPO_ROOT, type Workspace } from './workspaces.ts';

/**
 * Defining types
 */
interface VerifyOptions {
  /** Apply fixes in place (prettier `--write`, eslint `--fix`) instead of only reporting. */
  fix: boolean;
  /** Stop after format + lint, skipping the delegated type-check/test steps — the pre-commit hook's speed budget. */
  fast: boolean;
}

interface DelegatedStep {
  label: string;
  /** Script names to look for, in priority order — absorbs naming drift (`type-check` vs `typecheck`). */
  scriptNames: string[];
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
  /** The package.json scripts the delegated steps dispatch to; the tooling target has none. */
  scripts: Record<string, string> | undefined;
  verifyTest: boolean;
}

/**
 * Declaring the constants
 */
const USAGE = `Usage: bun scripts/verify.ts [workspace | scripts | --all] [--fix] [--fast]

  workspace   repo-relative directory (packages/common) or package name (@shadow-library/common)
  scripts     the root tooling itself — scripts/ and the root-level configs
  --all       verify the root tooling and every workspace, and report a combined result
  --fix       apply prettier and eslint fixes in place instead of only reporting
  --fast      stop after format + lint, skipping type-check and test`;

const DELEGATED_STEPS: DelegatedStep[] = [
  { label: 'type-check', scriptNames: ['type-check', 'typecheck'] },
  { label: 'test', scriptNames: ['test'] },
];

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
  /** The root package.json is the tooling's own — its `type-check` script covers `scripts/` via the root tsconfig. */
  scripts: readPackageJson(REPO_ROOT).scripts,
  verifyTest: false,
};

/** Adapts a workspace to a verify target: prettier gets the whole directory, ESLint runs inside it. */
function toTarget(workspace: Workspace): VerifyTarget {
  return { dir: workspace.dir, path: workspace.path, formatPaths: [workspace.dir], lintPaths: ['.'], scripts: workspace.packageJson.scripts, verifyTest: workspace.verifyTest };
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

/** Runs a delegated package.json script (type-check/test), skipping the step when the workspace declares no such script. */
function runDelegatedStep(step: DelegatedStep, target: VerifyTarget): boolean {
  const script = findScript(target.scripts, step.scriptNames);
  if (!script) {
    log.info(`skip   ${step.label} (no script found)`);
    return true;
  }

  log.info(`run    ${step.label} (bun run ${script.name})`);
  const result = run('bun', ['run', script.name], { cwd: target.path });
  if (result.status === 0) return true;

  log.error(`failed ${step.label} — "${script.name}" exited with code ${result.status}`);
  return false;
}

/**
 * Runs format → lint → type-check → test for one workspace, stopping at the first failure. Format and lint
 * are driven here (prettier and ESLint, each resolving its own config); type-check and test delegate to the
 * workspace's own package.json scripts. A local pre-commit convenience, not a CI replacement — CI keeps its
 * steps granular for per-step visibility.
 */
export async function verifyTarget(target: VerifyTarget, options: VerifyOptions): Promise<boolean> {
  log.info(`\nverifying ${target.dir}`);

  if (!runFormat(target, options.fix)) return false;
  if (!(await runLint(target, options.fix))) return false;

  if (options.fast) {
    log.success('verify passed (fast — type-check/test skipped)');
    return true;
  }

  const steps = target.verifyTest ? DELEGATED_STEPS : DELEGATED_STEPS.filter(step => step.label !== 'test');
  for (const step of steps) {
    if (!runDelegatedStep(step, target)) return false;
  }

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

/** Parses argv, verifies either one workspace or all of them, and returns the process exit code. */
async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    log.info(USAGE);
    return 0;
  }

  const options: VerifyOptions = { fix: args.includes('--fix'), fast: args.includes('--fast') };
  if (args.includes('--all')) return verifyAll(options);

  const identifier = args.find(arg => !arg.startsWith('-'));
  if (!identifier) throw new ShadowError(`A workspace, "scripts", or --all is required.\n\n${USAGE}`);

  const target = identifier === TOOLING_TARGET.dir ? TOOLING_TARGET : toTarget(findWorkspace(identifier));
  return (await verifyTarget(target, options)) ? 0 : 1;
}

process.exitCode = await main().catch(reportError);
