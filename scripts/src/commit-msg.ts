/**
 * Importing npm packages
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

import format from '@commitlint/format';
import lint from '@commitlint/lint';
import load from '@commitlint/load';

/**
 * Importing user defined packages
 */
import { loadConfig } from '@lib/config';
import { log, ShadowError } from '@lib/utils';

/**
 * Defining types
 */
export interface CommitMsgOptions {
  cwd: string;
  /** Path to the commit-message file — git passes this as `$1` to the commit-msg hook. */
  file: string;
}

/**
 * Declaring the constants
 */
const SCISSORS = '# ------------------------ >8 ------------------------';
const require = createRequire(import.meta.url);

/**
 * Resolves the base `@commitlint/config-conventional` to shadow's own installed copy (an absolute path)
 * so commitlint never resolves it from the target repo's cwd — which crashes Bun when it isn't present
 * there. User-supplied extends are left untouched (they resolve from the consuming repo, as intended).
 */
function resolveBaseExtends(names: string[]): string[] {
  return names.map(name => {
    if (name !== '@commitlint/config-conventional') return name;
    try {
      return require.resolve(name);
    } catch {
      return name;
    }
  });
}

/**
 * Strips a commit-message file down to the actual message: drops git's verbose diff (everything below
 * the scissors line) and every `#` comment line. Done in-process rather than via `@commitlint/read`,
 * which requires a git root and so can't run in tests or non-git contexts.
 */
export function stripCommitComments(raw: string): string {
  const scissorsIndex = raw.indexOf(SCISSORS);
  const body = scissorsIndex === -1 ? raw : raw.slice(0, scissorsIndex);
  return body
    .split('\n')
    .filter(line => !line.startsWith('#'))
    .join('\n')
    .trim();
}

/**
 * Lints the commit message in `file` against the shipped commitlint config (`config-conventional` plus
 * any `.shadowrc.json` `verify.commit` overrides), run programmatically so the consuming repo needs no
 * `commitlint.config.js`. Drives the husky `commit-msg` hook: `shadow commit-msg "$1"`. Returns the
 * process exit code (1 on an invalid message).
 */
export async function commitMsg(options: CommitMsgOptions): Promise<number> {
  if (!options.file) throw new ShadowError('Usage: shadow commit-msg <commit-message-file>');
  if (!fs.existsSync(options.file)) throw new ShadowError(`Commit-message file not found: ${options.file}`);

  const commitConfig = loadConfig(options.cwd).verify.commit;
  // `.shadowrc.json` rules are loosely typed; commitlint's UserConfig narrows them, so cast at the boundary.
  const seed = { extends: resolveBaseExtends(commitConfig.extends), rules: commitConfig.rules } as unknown as Parameters<typeof load>[0];
  const loaded = await load(seed, { cwd: options.cwd });

  const message = stripCommitComments(fs.readFileSync(options.file, 'utf-8'));
  const outcome = await lint(message, loaded.rules, { parserOpts: loaded.parserPreset?.parserOpts as any });

  const output = format({ results: [outcome] }, { color: false });
  if (output.trim()) log.info(output);
  if (!outcome.valid) return 1;

  log.success('commit message ok');
  return 0;
}
