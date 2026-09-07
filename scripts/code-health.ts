/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { formatDuration, log, reportError, resolveBin, run, ShadowError } from './utils/index.ts';
import { REPO_ROOT } from './workspaces.ts';

/**
 * Defining types
 */
interface Check {
  /** Label, and the identifier accepted on the command line. */
  name: string;
  description: string;
  bin: string;
  args: string[];
}

interface CheckResult {
  name: string;
  status: number;
  durationMs: number;
}

/**
 * Declaring the constants
 */
const USAGE = `Usage: bun scripts/code-health.ts [check ...]

  knip         unreferenced files, exports, types and dependencies
  duplicates   copy-paste detection across every workspace
  cycles       circular imports within each package's own source

Runs every check when given no arguments. Each check runs to completion and reports independently —
a failing one never hides the others — and the exit code is non-zero if any of them failed.`;

/**
 * Every package resolves its workspace dependencies to their built `dist`, where madge would re-report
 * each source cycle a second time as its compiled `.d.ts` echo — {@link CYCLE_EXCLUDE} drops those.
 */
const CYCLE_ROOTS = [
  'packages/app/src',
  'packages/auth/src',
  'packages/class-schema/src',
  'packages/common/src',
  'packages/fastify/src',
  'packages/modules/src',
  'packages/ui/src',
  'packages/web/src',
];

const CYCLE_EXCLUDE = '(^|/)dist/';

const DUPLICATION_IGNORE = ['**/node_modules/**', '**/dist/**', '**/*.gen.ts', '**/generated/**', '**/coverage/**', '**/logs/**', '**/scratch-pad/**'].join(',');

const CHECKS: Check[] = [
  { name: 'knip', description: 'unreferenced files, exports, types and dependencies', bin: 'knip', args: ['--no-progress'] },
  {
    name: 'duplicates',
    description: 'copy-paste detection across every workspace',
    bin: 'jscpd',
    args: [
      '--reporters',
      'consoleFull',
      '--min-lines',
      '12',
      '--min-tokens',
      '80',
      '--format',
      'typescript,tsx',
      '--ignore',
      DUPLICATION_IGNORE,
      'apps',
      'packages',
      'scripts',
      'e2e',
    ],
  },
  {
    name: 'cycles',
    description: "circular imports within each package's own source",
    bin: 'madge',
    args: ['--circular', '--extensions', 'ts,tsx', '--exclude', CYCLE_EXCLUDE, ...CYCLE_ROOTS],
  },
];

function runCheck(check: Check): CheckResult {
  log.info(`\ncode-health: ${check.name} — ${check.description}`);
  const start = performance.now();
  const { status } = run(resolveBin(check.bin, [REPO_ROOT]), check.args, { cwd: REPO_ROOT });
  return { name: check.name, status, durationMs: performance.now() - start };
}

function parseArgs(argv: string[]): Check[] {
  if (argv.includes('--help') || argv.includes('-h')) {
    log.info(USAGE);
    process.exit(0);
  }
  if (argv.length === 0) return CHECKS;

  const selected = argv.map(name => {
    const check = CHECKS.find(candidate => candidate.name === name);
    if (!check) throw new ShadowError(`Unknown check '${name}'\n\n${USAGE}`);
    return check;
  });
  return selected;
}

function main(): void {
  const results = parseArgs(process.argv.slice(2)).map(runCheck);

  log.info('\ncode-health summary');
  for (const { name, status, durationMs } of results) {
    const outcome = status === 0 ? 'ok' : `failed (exit ${status})`;
    (status === 0 ? log.success : log.error)(`  ${name.padEnd(12)} ${outcome} — ${formatDuration(durationMs)}`);
  }

  const failed = results.filter(result => result.status !== 0);
  if (failed.length) throw new ShadowError(`\ncode-health failed: ${failed.map(result => result.name).join(', ')}`);
  log.success('\ncode-health passed');
}

try {
  main();
} catch (error) {
  process.exit(reportError(error));
}
