/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

import { Octokit } from '@octokit/rest';

/**
 * Importing user defined packages
 */
import { build } from '@lib/build';
import { loadConfig, type ReleaseConfig } from '@lib/config';
import { findScript, log, type PackageJson, readPackageJson, run, ShadowError } from '@lib/utils';

/**
 * Defining types
 */
export type BumpLevel = 'major' | 'minor' | 'patch';
export type ReleaseChannel = 'alpha' | 'beta';
export type ReleaseType = BumpLevel | ReleaseChannel;

export interface ReleaseOptions {
  /** `major`/`minor`/`patch` for a stable release at that level, or `alpha`/`beta` for a prerelease. */
  release: string;
  /** For a level release, proceed (with a warning) even when the commits require a higher bump. */
  force?: boolean;
  /** Target package directory. Defaults to `process.cwd()`. */
  path?: string;
}

export interface ParsedCommit {
  type: string;
  breaking: boolean;
  subject: string;
}

interface SemVer {
  major: number;
  minor: number;
  patch: number;
  preid?: string;
  prenum?: number;
}

/** The subset of Octokit used here — narrowed so tests can pass a fake client without the full SDK. */
export interface GitHubClient {
  rest: {
    repos: {
      getContent(params: { owner: string; repo: string; path: string; ref: string }): Promise<{ data: unknown }>;
      createOrUpdateFileContents(params: {
        owner: string;
        repo: string;
        path: string;
        message: string;
        content: string;
        branch: string;
        sha?: string;
      }): Promise<{ data: { commit: { sha?: string } } }>;
      createRelease(params: { owner: string; repo: string; tag_name: string; name: string; body: string; prerelease: boolean }): Promise<{ data: { html_url: string } }>;
    };
    git: {
      createRef(params: { owner: string; repo: string; ref: string; sha: string }): Promise<unknown>;
    };
  };
}

/** External effects, injectable so tests can exercise the full flow without git/GitHub/npm side effects. */
export interface ReleaseDependencies {
  run: typeof run;
  build: typeof build;
  createClient: (token: string) => GitHubClient;
}

/**
 * Declaring the constants
 */
const VALID_LEVELS: BumpLevel[] = ['major', 'minor', 'patch'];
const VALID_CHANNELS: ReleaseChannel[] = ['alpha', 'beta'];
const LEVEL_RANK: Record<BumpLevel, number> = { patch: 0, minor: 1, major: 2 };
const defaultDependencies: ReleaseDependencies = { run, build, createClient: token => new Octokit({ auth: token }) };

export function isValidLevel(value: string): value is BumpLevel {
  return (VALID_LEVELS as string[]).includes(value);
}

export function isReleaseChannel(value: string): value is ReleaseChannel {
  return (VALID_CHANNELS as string[]).includes(value);
}

export function isValidRelease(value: string): value is ReleaseType {
  return isValidLevel(value) || isReleaseChannel(value);
}

/** Extracts `owner/repo` from a GitHub remote URL — `git@github.com:owner/repo.git` or `https://github.com/owner/repo.git`. */
export function parseGitHubRepoSlug(remoteUrl: string): { owner: string; repo: string } {
  const match = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remoteUrl.trim());
  if (!match) throw new ShadowError(`Could not parse a GitHub owner/repo from remote URL: ${remoteUrl}`);
  return { owner: match[1] as string, repo: match[2] as string };
}

/** Parses a single commit's raw message (`git log %B`) into its conventional-commit type, breaking flag, and subject. */
export function parseConventionalCommit(message: string): ParsedCommit {
  const [header = '', ...bodyLines] = message.split('\n');
  const headerMatch = /^(\w+)(?:\([^)]*\))?(!)?:\s*(.*)$/.exec(header.trim());
  const body = bodyLines.join('\n');
  const breaking = Boolean(headerMatch?.[2]) || /^BREAKING[ -]CHANGE:/m.test(body);
  return { type: headerMatch?.[1]?.toLowerCase() ?? '', breaking, subject: headerMatch?.[3]?.trim() ?? header.trim() };
}

/**
 * Derives the raw Conventional-Commits bump level from the commits since the last release: any breaking
 * change → major, any `feat` → minor, otherwise → patch. Used to validate the chosen level against what the
 * commits require. {@link applySemverPolicy} then adjusts it for 0.x versions.
 */
export function computeBumpLevel(commits: ParsedCommit[]): BumpLevel {
  let level: BumpLevel = 'patch';
  for (const commit of commits) {
    if (commit.breaking) return 'major';
    if (commit.type === 'feat') level = 'minor';
  }
  return level;
}

function parseSemVer(version: string): SemVer {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/.exec(version);
  if (!match) throw new ShadowError(`Cannot parse a semver version from "${version}"`);
  const [, major, minor, patch, preid, prenum] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), preid, prenum: prenum === undefined ? undefined : Number(prenum) };
}

/** Applies a bump `level` to `currentVersion`, producing the next stable version (dropping any prerelease tag). */
export function bumpVersion(currentVersion: string, level: BumpLevel): string {
  const version = parseSemVer(currentVersion);
  if (level === 'major') return `${version.major + 1}.0.0`;
  if (level === 'minor') return `${version.major}.${version.minor + 1}.0`;
  return `${version.major}.${version.minor}.${version.patch + 1}`;
}

/**
 * Applies the 0.x semver convention on top of the raw conventional bump: while the current major is `0`
 * the public API is unstable, so a breaking change is only a `minor` bump and a feature only a `patch`
 * (every level is demoted one step). At `1.0.0` and above the raw level is used unchanged.
 */
export function applySemverPolicy(level: BumpLevel, currentVersion: string): BumpLevel {
  if (parseSemVer(currentVersion).major > 0) return level;
  return level === 'major' ? 'minor' : 'patch';
}

/**
 * Computes the next prerelease version for an `alpha`/`beta` channel, off the inferred bump `level`:
 *  - same channel as the current prerelease → bump its counter (`1.3.0-alpha.0` → `1.3.0-alpha.1`);
 *  - a different channel → switch it in place, keeping the core (`1.3.0-alpha.2` → `1.3.0-beta.0`);
 *  - from a stable version → apply the level, then start the channel at `.0` (`1.2.3` +minor → `1.3.0-alpha.0`).
 */
export function computeNextVersion(currentVersion: string, level: BumpLevel, channel: ReleaseChannel): string {
  const current = parseSemVer(currentVersion);
  const core = `${current.major}.${current.minor}.${current.patch}`;
  if (current.preid === channel) return `${core}-${channel}.${(current.prenum ?? 0) + 1}`;
  if (current.preid) return `${core}-${channel}.0`;
  return `${bumpVersion(currentVersion, level)}-${channel}.0`;
}

/** Builds a terse markdown changelog grouping features and fixes — used as the GitHub release body. */
export function buildChangelog(commits: ParsedCommit[]): string {
  const features = commits.filter(commit => commit.type === 'feat').map(commit => `- ${commit.subject}`);
  const fixes = commits.filter(commit => commit.type === 'fix').map(commit => `- ${commit.subject}`);
  const sections: string[] = [];
  if (features.length > 0) sections.push(`### Features\n${features.join('\n')}`);
  if (fixes.length > 0) sections.push(`### Bug Fixes\n${fixes.join('\n')}`);
  return sections.join('\n\n') || '_No notable changes._';
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ShadowError(`Missing required environment variable: ${name}`);
  return value;
}

/** Reads the raw commit messages since `lastTag` (or from the repo root when there is no prior tag). */
function readCommitsSince(cwd: string, lastTag: string | undefined, deps: ReleaseDependencies): ParsedCommit[] {
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  const result = deps.run('git', ['log', range, '--format=%B%x00'], { cwd, stream: false });
  if (result.status !== 0) throw new ShadowError('Could not read git history — is this a git repository with commits?');
  return result.stdout
    .split('\x00')
    .map(message => message.trim())
    .filter(Boolean)
    .map(parseConventionalCommit);
}

function readLastTag(cwd: string, deps: ReleaseDependencies): string | undefined {
  const result = deps.run('git', ['describe', '--tags', '--match', 'v*', '--abbrev=0'], { cwd, stream: false });
  return result.status === 0 ? result.stdout.trim() || undefined : undefined;
}

/** Commits the bumped package.json to `main` via the Contents API (a Verified commit) and returns the new commit SHA. */
async function commitVersionBump(client: GitHubClient, slug: { owner: string; repo: string }, relativePath: string, contents: string, version: string): Promise<string> {
  const existing = await client.rest.repos.getContent({ ...slug, path: relativePath, ref: 'main' });
  const sha = (existing.data as { sha?: string }).sha;

  const result = await client.rest.repos.createOrUpdateFileContents({
    ...slug,
    path: relativePath,
    message: `chore: release v${version}`,
    content: Buffer.from(contents, 'utf-8').toString('base64'),
    branch: 'main',
    sha,
  });

  const commitSha = result.data.commit.sha;
  if (!commitSha) throw new ShadowError('GitHub did not return a commit SHA for the version bump');
  return commitSha;
}

/**
 * Centralizes the release workflow. The caller picks a `release`: a stable level (`major`/`minor`/`patch`) or
 * a prerelease channel (`alpha`/`beta`). For a level, the level the commits require is inferred and — unless
 * `force` is set — choosing a lower level than required errors out (0.x aware: a breaking change requires only
 * `minor` while the major is 0); with `force` it warns and proceeds. A channel cuts/advances a prerelease at the
 * inferred level. It then builds and tests, performs every remote git operation through Octokit — a Verified
 * `package.json` commit on `main`, the `v<version>` tag, and the GitHub release — and publishes to npm.
 */
export async function release(options: ReleaseOptions, deps: ReleaseDependencies = defaultDependencies): Promise<void> {
  if (!isValidRelease(options.release)) throw new ShadowError(`Invalid release "${options.release}" — expected one of: ${[...VALID_LEVELS, ...VALID_CHANNELS].join(', ')}`);
  const selection = options.release;

  const targetDir = path.resolve(options.path ?? process.cwd());
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) throw new ShadowError(`Not a directory: ${targetDir}`);

  const { filePath: packageJsonPath, data: packageJson } = readPackageJson(targetDir);
  if (!packageJson.name) throw new ShadowError(`package.json at ${targetDir} has no "name" — refusing to release`);
  if (!packageJson.version) throw new ShadowError(`package.json at ${targetDir} has no "version" — refusing to release`);

  const shadowConfig = loadConfig(targetDir, packageJson.name);
  if (shadowConfig.type !== 'library') throw new ShadowError(`shadow release does not apply to a "${shadowConfig.type}" repo — only "library" repos are published`);
  const config = shadowConfig.release;
  const token = requireEnv('GITHUB_TOKEN');

  const remote = deps.run('git', ['remote', 'get-url', 'origin'], { cwd: targetDir, stream: false });
  if (remote.status !== 0) throw new ShadowError('Could not resolve git remote "origin"');
  const slug = parseGitHubRepoSlug(remote.stdout);

  const gitRoot = deps.run('git', ['rev-parse', '--show-toplevel'], { cwd: targetDir, stream: false });
  if (gitRoot.status !== 0) throw new ShadowError('Could not resolve the git repository root');
  const relativePackageJsonPath = path.relative(gitRoot.stdout.trim(), packageJsonPath).split(path.sep).join('/');

  const commits = readCommitsSince(targetDir, readLastTag(targetDir, deps), deps);
  if (commits.length === 0) throw new ShadowError('No commits since the last release — nothing to release');

  const required = applySemverPolicy(computeBumpLevel(commits), packageJson.version);

  let version: string;
  let prerelease: boolean;
  if (isReleaseChannel(selection)) {
    version = computeNextVersion(packageJson.version, required, selection);
    prerelease = true;
    log.info(`releasing ${packageJson.name}: ${packageJson.version} → ${version} (${selection} prerelease)`);
  } else {
    if (LEVEL_RANK[selection] < LEVEL_RANK[required]) {
      const message = `The commits since the last release require a "${required}" bump, but "${selection}" was requested.`;
      if (!options.force) throw new ShadowError(`${message} Re-run with --force to release "${selection}" anyway.`);
      log.warn(`${message} Proceeding anyway because --force was set.`);
    }
    version = bumpVersion(packageJson.version, selection);
    prerelease = false;
    log.info(`releasing ${packageJson.name}: ${packageJson.version} → ${version} (${selection})`);
  }
  const tag = `v${version}`;

  runPreReleaseChecks(targetDir, packageJson, deps);

  packageJson.version = version;
  const updatedContents = `${JSON.stringify(packageJson, null, 2)}\n`;
  fs.writeFileSync(packageJsonPath, updatedContents);

  await deps.build({ cwd: targetDir });

  const client = deps.createClient(token);
  const commitSha = await commitVersionBump(client, slug, relativePackageJsonPath, updatedContents, version);
  await client.rest.git.createRef({ ...slug, ref: `refs/tags/${tag}`, sha: commitSha });
  const gitHubRelease = await client.rest.repos.createRelease({
    ...slug,
    tag_name: tag,
    name: tag,
    body: config.changelog ? buildChangelog(commits) : '',
    prerelease,
  });
  log.info(`created release ${gitHubRelease.data.html_url}`);

  if (config.npm) publishToNpm(targetDir, config, version, deps);

  log.success(`Released ${packageJson.name}@${version}`);
}

/**
 * The npm dist-tag for a version: a prerelease (`2.0.0-alpha.0`) publishes under its channel (`alpha`) —
 * npm *requires* a non-`latest` tag for prereleases — while a stable version publishes under `latest`.
 */
export function npmDistTag(version: string): string {
  return /-([a-z]+)\.\d+$/.exec(version)?.[1] ?? 'latest';
}

/**
 * Runs the pre-release test gate so a broken build never reaches a tag or npm. Delegates to the repo's own
 * `test` script (`bun run test` — Vitest, etc.) so a non-Bun test runner is honored, falling back to `bun test`
 * only when the repo declares no `test` script.
 */
function runPreReleaseChecks(targetDir: string, packageJson: PackageJson, deps: ReleaseDependencies): void {
  const script = findScript(packageJson.scripts, ['test']);
  const args = script ? ['run', script.name] : ['test'];
  const test = deps.run('bun', args, { cwd: targetDir });
  if (test.status !== 0) throw new ShadowError(`Tests failed (exit code ${test.status}) — aborting before any release action`);
}

/** Publishes the built package directory to npm under the version's dist-tag. Runs after the tag/release so a publish failure leaves a recoverable state. */
function publishToNpm(targetDir: string, config: ReleaseConfig, version: string, deps: ReleaseDependencies): void {
  const publishDir = path.join(targetDir, config.publishDir);
  const result = deps.run('npm', ['publish', '--access', 'public', '--tag', npmDistTag(version)], { cwd: publishDir });
  if (result.status !== 0) throw new ShadowError(`npm publish failed (exit code ${result.status}) — the tag and GitHub release already exist; re-run publish manually`);
}
