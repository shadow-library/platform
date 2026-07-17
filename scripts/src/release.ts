/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { ShadowScriptsError, log, readPackageJson, run } from '@lib/utils';

/**
 * Defining types
 */
export type Bump = 'patch' | 'minor' | 'major' | 'prepatch' | 'preminor' | 'premajor';

export interface ReleaseOptions {
  bump: string;
  /** Target package directory. Defaults to `process.cwd()`. */
  path?: string;
}

/** The one external side effect this command has — injectable so tests can exercise the full flow without spawning `release-it`/`gh` for real. */
export interface ReleaseDependencies {
  run: typeof run;
}

interface ReleaseItConfig {
  git?: { push?: boolean };
}

/**
 * Declaring the constants
 */
const VALID_BUMPS: Bump[] = ['patch', 'minor', 'major', 'prepatch', 'preminor', 'premajor'];
const defaultDependencies: ReleaseDependencies = { run };

export function isValidBump(value: string): value is Bump {
  return (VALID_BUMPS as string[]).includes(value);
}

/**
 * Every existing `.release-it.json` in the ecosystem sets `git.push: false` — release-it bumps, commits,
 * and tags locally but deliberately does not push, because a GitHub Contents API commit (used for the
 * back-sync) is shown as "Verified" automatically, while a raw authenticated `git push` is not unless the
 * repo also has commit signing configured, which none of these repos do. We investigated dropping the
 * back-sync in favor of `git.push: true` (see README "Deviations from ../common") and kept it, since
 * eliminating it would silently downgrade release commits from Verified to unverified. If a package
 * opts into `git.push: true` — e.g. once signing is configured — the back-sync becomes redundant and is
 * skipped, so this centralizes today's behavior without locking in the old model forever.
 */
export function shouldBackSync(releaseItConfig: ReleaseItConfig): boolean {
  return releaseItConfig.git?.push === false;
}

/** Extracts `owner/repo` from a GitHub remote URL — `git@github.com:owner/repo.git` or `https://github.com/owner/repo.git`. */
export function parseGitHubRepoSlug(remoteUrl: string): string {
  const match = /github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/.exec(remoteUrl.trim());
  if (!match) throw new ShadowScriptsError(`Could not parse a GitHub owner/repo from remote URL: ${remoteUrl}`);
  return match[1] as string;
}

function readReleaseItConfig(targetDir: string): ReleaseItConfig {
  const configPath = path.join(targetDir, '.release-it.json');
  if (!fs.existsSync(configPath))
    throw new ShadowScriptsError(`No .release-it.json found at ${configPath} — this command runs the target's existing release-it config, it does not create one`);
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ReleaseItConfig;
  } catch (cause) {
    throw new ShadowScriptsError(`Failed to parse ${configPath}: not valid JSON`, { cause });
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ShadowScriptsError(`Missing required environment variable: ${name}`);
  return value;
}

function requireTool(command: string, deps: ReleaseDependencies): void {
  const result = deps.run(command, ['--version'], {
    cwd: process.cwd(),
    stream: false,
  });
  if (result.status !== 0) throw new ShadowScriptsError(`Required tool "${command}" was not found on PATH`);
}

/**
 * Re-syncs `package.json` on `main` after a `git.push: false` release-it run, using the same GitHub
 * Contents API call every publish workflow in the ecosystem hand-rolls: read the post-bump file, look up
 * the previous commit's blob SHA for it (so the API call updates rather than creates), and PUT it back
 * with the release commit's own message. Requires `gh` and a token with repo-content write access —
 * `GITHUB_TOKEN` is expected to be a GitHub App installation token (see README), not a plain PAT.
 */
function backSyncPackageJson(targetDir: string, deps: ReleaseDependencies): void {
  requireTool('gh', deps);
  const token = requireEnv('GITHUB_TOKEN');

  const remote = deps.run('git', ['remote', 'get-url', 'origin'], {
    cwd: targetDir,
    stream: false,
  });
  if (remote.status !== 0) throw new ShadowScriptsError('Could not resolve git remote "origin" for the back-sync step');
  const repoSlug = parseGitHubRepoSlug(remote.stdout);

  const gitRoot = deps.run('git', ['rev-parse', '--show-toplevel'], {
    cwd: targetDir,
    stream: false,
  });
  if (gitRoot.status !== 0) throw new ShadowScriptsError('Could not resolve the git repository root for the back-sync step');
  const relativePackageJsonPath = path.relative(gitRoot.stdout.trim(), path.join(targetDir, 'package.json')).split(path.sep).join('/');

  const previousBlobSha = deps.run('git', ['rev-parse', `HEAD~1:${relativePackageJsonPath}`], { cwd: targetDir, stream: false });
  if (previousBlobSha.status !== 0) throw new ShadowScriptsError('Could not resolve the previous package.json blob SHA — was a release commit actually created?');

  const commitMessage = deps.run('git', ['show', '-s', '--format=%s'], {
    cwd: targetDir,
    stream: false,
  });
  if (commitMessage.status !== 0) throw new ShadowScriptsError('Could not read the release commit message for the back-sync step');

  const packageJsonContent = fs.readFileSync(path.join(targetDir, 'package.json'), 'utf-8');
  const base64Content = Buffer.from(packageJsonContent, 'utf-8').toString('base64');

  const result = deps.run(
    'gh',
    [
      'api',
      '--method',
      'PUT',
      `/repos/${repoSlug}/contents/${relativePackageJsonPath}`,
      '--field',
      'branch=main',
      '--field',
      'encoding=base64',
      '--field',
      `content=${base64Content}`,
      '--field',
      `message=${commitMessage.stdout.trim()}`,
      '--field',
      `sha=${previousBlobSha.stdout.trim()}`,
    ],
    { cwd: targetDir, env: { ...process.env, GH_TOKEN: token }, stream: false },
  );
  if (result.status !== 0)
    throw new ShadowScriptsError(
      `package.json back-sync failed (gh api exited with code ${result.status}) — release-it already bumped and tagged; main's package.json may now be stale`,
    );
}

/**
 * Centralizes the release workflow duplicated across every library repo's `publish-package.yml`:
 * validate the target, run its own `release-it` config for the requested bump, then re-sync
 * `package.json` to `main` if (and only if) the target's config still needs it (see {@link shouldBackSync}).
 */
export async function release(options: ReleaseOptions, deps: ReleaseDependencies = defaultDependencies): Promise<void> {
  if (!isValidBump(options.bump)) throw new ShadowScriptsError(`Invalid bump "${options.bump}" — expected one of: ${VALID_BUMPS.join(', ')}`);

  const targetDir = path.resolve(options.path ?? process.cwd());
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) throw new ShadowScriptsError(`Not a directory: ${targetDir}`);

  const { data: packageJson } = readPackageJson(targetDir);
  if (!packageJson.name) throw new ShadowScriptsError(`package.json at ${targetDir} has no "name" — refusing to release`);

  const releaseItConfig = readReleaseItConfig(targetDir);
  const needsBackSync = shouldBackSync(releaseItConfig);
  if (needsBackSync) {
    requireEnv('GITHUB_TOKEN');
    requireTool('gh', deps);
  }

  log.info(`releasing ${packageJson.name} (${options.bump}) from ${targetDir}`);

  const preRelease = options.bump.startsWith('pre') ? ['--preRelease=beta'] : [];
  const releaseItResult = deps.run('bunx', ['release-it', options.bump, ...preRelease, '--ci'], { cwd: targetDir });
  if (releaseItResult.status !== 0) throw new ShadowScriptsError(`release-it failed (exit code ${releaseItResult.status}) — no back-sync attempted`);

  if (!needsBackSync) {
    log.success(`Released ${packageJson.name} — release-it pushed directly (git.push !== false), no back-sync needed`);
    return;
  }

  backSyncPackageJson(targetDir, deps);
  log.success(`Released ${packageJson.name} and synced package.json to main`);
}
