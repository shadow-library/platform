/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { findScript, log, readPackageJson, run } from '@lib/utils';

/**
 * Defining types
 */
export interface VerifyOptions {
  /** Root directory of the consuming repo whose package.json scripts should be run. */
  cwd: string;
}

interface VerifyStep {
  label: string;
  /** Script names to look for, in priority order — absorbs repo-specific naming drift (`type-check` vs `typecheck`). */
  scriptNames: string[];
}

/**
 * Declaring the constants
 */
const STEPS: VerifyStep[] = [
  { label: 'lint', scriptNames: ['lint'] },
  { label: 'type-check', scriptNames: ['type-check', 'typecheck'] },
  { label: 'test', scriptNames: ['test'] },
];

/**
 * True when `command` (a package.json script value) would itself invoke `shadow-scripts verify`,
 * which would recurse forever if we ran it. Matches both the bin name directly and `bunx`/`npx`-prefixed
 * invocations of it.
 */
export function isRecursiveVerifyCall(command: string): boolean {
  return /(^|[\s&|;])(bunx|npx)?\s*shadow-scripts\s+verify\b/.test(command);
}

/**
 * Runs lint → type-check → test from the consuming repo's package.json, in order, stopping at the
 * first failure. Only steps whose script actually exists are run; everything else is reported as
 * skipped. This is a local pre-commit convenience, not a CI replacement — CI should keep its steps
 * granular for per-step visibility (see README).
 */
export async function verify(options: VerifyOptions): Promise<number> {
  const { data: packageJson } = readPackageJson(options.cwd);

  for (const step of STEPS) {
    const script = findScript(packageJson.scripts, step.scriptNames);

    if (!script) {
      log.info(`skip   ${step.label} (no script found)`);
      continue;
    }

    if (isRecursiveVerifyCall(script.command)) {
      log.warn(`skip   ${step.label} ("${script.name}" maps back to "shadow-scripts verify")`);
      continue;
    }

    log.info(`run    ${step.label} (bun run ${script.name})`);
    const result = run('bun', ['run', script.name], { cwd: options.cwd });
    if (result.status !== 0) {
      log.error(`failed ${step.label} — "${script.name}" exited with code ${result.status}`);
      return result.status;
    }
  }

  log.success('verify passed');
  return 0;
}
