/**
 * Importing npm packages
 */
import { ESLint, type Linter } from 'eslint';
import prettier from 'prettier';

/**
 * Importing user defined packages
 */
import { loadConfig, PRETTIER_BASE, type VerifyConfig } from '@lib/config';
import { createLintConfig } from '@lib/eslint-config';
import { findScript, log, type PackageJson, readPackageJson, run } from '@lib/utils';

/**
 * Defining types
 */
export interface VerifyOptions {
  /** Root directory of the consuming repo. */
  cwd: string;
  /** Apply fixes in place (prettier `--write`, eslint `--fix`) instead of only reporting. */
  fix?: boolean;
}

interface DelegatedStep {
  label: string;
  /** Script names to look for, in priority order — absorbs repo naming drift (`type-check` vs `typecheck`). */
  scriptNames: string[];
}

/**
 * Declaring the constants
 */
const DELEGATED_STEPS: DelegatedStep[] = [
  { label: 'type-check', scriptNames: ['type-check', 'typecheck'] },
  { label: 'test', scriptNames: ['test'] },
];

/**
 * True when `command` (a package.json script value) would itself invoke `shadow verify`, which would
 * recurse forever if we ran it. Matches both the bin name directly and `bunx`/`npx`-prefixed invocations.
 */
export function isRecursiveVerifyCall(command: string): boolean {
  return /(^|[\s&|;])(bunx|npx)?\s*shadow\s+verify\b/.test(command);
}

/** Formats the repo's TypeScript with prettier — the base ruleset merged with `verify.format` overrides. */
async function runFormat(cwd: string, verifyConfig: VerifyConfig, fix: boolean): Promise<boolean> {
  const options = { ...PRETTIER_BASE, ...verifyConfig.format };
  const files = Array.from(new Bun.Glob(verifyConfig.files).scanSync({ cwd, onlyFiles: true }));

  if (files.length === 0) {
    log.info('skip   format (no files matched)');
    return true;
  }

  const unformatted: string[] = [];
  for (const relativePath of files) {
    const file = Bun.file(`${cwd}/${relativePath}`);
    const source = await file.text();
    const prettierOptions = { ...options, filepath: relativePath };
    if (fix) {
      const formatted = await prettier.format(source, prettierOptions);
      if (formatted !== source) await Bun.write(file, formatted);
    } else if (!(await prettier.check(source, prettierOptions))) {
      unformatted.push(relativePath);
    }
  }

  if (unformatted.length > 0) {
    log.error(`failed format — ${unformatted.length} file(s) need formatting:\n${unformatted.join('\n')}`);
    log.error('run "shadow verify --fix" to format them');
    return false;
  }

  log.success(fix ? 'format applied' : 'format ok');
  return true;
}

/** Lints the repo with the shipped flat config (plus `verify.lint` overrides), fixing in place when requested. */
async function runLint(cwd: string, verifyConfig: VerifyConfig, fix: boolean): Promise<boolean> {
  // typescript-eslint's ConfigArray is structurally compatible with ESLint's flat config but nominally distinct.
  const overrideConfig = createLintConfig(verifyConfig.lint) as unknown as Linter.Config[];
  // errorOnUnmatchedPattern is off because the file glob spans src/tests/scripts and not every repo has all three.
  const eslint = new ESLint({ cwd, fix, overrideConfigFile: true, overrideConfig, errorOnUnmatchedPattern: false });
  const results = await eslint.lintFiles([verifyConfig.files]);
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

/** Runs a delegated package.json script (type-check/test), skipping absent scripts and recursion back into verify. */
function runDelegatedStep(step: DelegatedStep, packageJson: PackageJson, cwd: string): number {
  const script = findScript(packageJson.scripts, step.scriptNames);
  if (!script) {
    log.info(`skip   ${step.label} (no script found)`);
    return 0;
  }
  if (isRecursiveVerifyCall(script.command)) {
    log.warn(`skip   ${step.label} ("${script.name}" maps back to "shadow verify")`);
    return 0;
  }

  log.info(`run    ${step.label} (bun run ${script.name})`);
  const result = run('bun', ['run', script.name], { cwd });
  if (result.status !== 0) log.error(`failed ${step.label} — "${script.name}" exited with code ${result.status}`);
  return result.status;
}

/**
 * Runs format → lint → type-check → test, stopping at the first failure. Formatting and linting are owned
 * by `shadow` (prettier + the shipped ESLint flat config, both overridable via `.shadowrc.json`); type-check
 * and test are delegated to the repo's own package.json scripts. A local pre-commit convenience, not a CI
 * replacement — CI should keep its steps granular for per-step visibility.
 */
export async function verify(options: VerifyOptions): Promise<number> {
  const fix = options.fix ?? false;
  const { data: packageJson } = readPackageJson(options.cwd);
  const config = loadConfig(options.cwd, packageJson.name);

  if (!(await runFormat(options.cwd, config.verify, fix))) return 1;
  if (!(await runLint(options.cwd, config.verify, fix))) return 1;

  for (const step of DELEGATED_STEPS) {
    const status = runDelegatedStep(step, packageJson, options.cwd);
    if (status !== 0) return status;
  }

  log.success('verify passed');
  return 0;
}
