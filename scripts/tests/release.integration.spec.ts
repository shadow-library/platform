/**
 * Importing npm packages
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { type GitHubClient, release, type ReleaseDependencies } from '@lib/release';
import { log } from '@lib/utils';
import { type RunResult } from '@lib/utils';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from './helpers/fixture';

/**
 * Defining types
 */
interface Recorder {
  commands: string[];
  client: GitHubClient;
  clientCalls: string[];
  createRefArgs: { ref: string; sha: string }[];
  createReleaseArgs: { tag_name: string; prerelease: boolean }[];
  buildCalls: string[];
  publishArgs: string[];
}

/**
 * Declaring the constants
 */
const ok = (stdout = ''): RunResult => ({ status: 0, stdout, stderr: '' });
const fail = (status = 1, stderr = ''): RunResult => ({ status, stdout: '', stderr });

/** Builds injectable release dependencies with canned git/npm responses and a recording fake Octokit client. */
function fakeDeps(overrides: Partial<Record<string, RunResult>> = {}): { deps: ReleaseDependencies; recorder: Recorder } {
  const recorder: Recorder = {
    commands: [],
    client: undefined as unknown as GitHubClient,
    clientCalls: [],
    createRefArgs: [],
    createReleaseArgs: [],
    buildCalls: [],
    publishArgs: [],
  };

  recorder.client = {
    rest: {
      repos: {
        getContent: async () => (recorder.clientCalls.push('getContent'), { data: { sha: 'oldsha' } }),
        createOrUpdateFileContents: async () => (recorder.clientCalls.push('createOrUpdateFileContents'), { data: { commit: { sha: 'newsha' } } }),
        createRelease: async params => (
          recorder.createReleaseArgs.push({ tag_name: params.tag_name, prerelease: params.prerelease }),
          { data: { html_url: 'https://github.test/r/1' } }
        ),
      },
      git: {
        createRef: async params => void recorder.createRefArgs.push({ ref: params.ref, sha: params.sha }),
      },
    },
  };

  const deps: ReleaseDependencies = {
    build: async ({ cwd }) => void recorder.buildCalls.push(cwd),
    createClient: () => recorder.client,
    run: (command, args) => {
      const key = `${command} ${args[0]}`;
      recorder.commands.push(key);
      if (overrides[key]) return overrides[key];
      if (command === 'git' && args[0] === 'remote') return ok('git@github.com:fixtures/pkg.git');
      if (command === 'git' && args[0] === 'rev-parse') return ok(overrides['__gitRoot']?.stdout ?? '');
      if (command === 'git' && args[0] === 'describe') return fail(); // no prior tag → release from repo root
      if (command === 'git' && args[0] === 'log') return ok('feat: add a thing\x00fix: patch a bug\x00');
      if (command === 'bun' && (args[0] === 'test' || args[0] === 'run')) return ok();
      if (command === 'npm' && args[0] === 'publish') return ((recorder.publishArgs = args), ok());
      throw new Error(`fakeDeps: unexpected command "${command} ${args.join(' ')}"`);
    },
  };

  return { deps, recorder };
}

function withGitRoot(gitRoot: string, overrides: Partial<Record<string, RunResult>> = {}): { deps: ReleaseDependencies; recorder: Recorder } {
  return fakeDeps({ ...overrides, __gitRoot: ok(gitRoot) });
}

describe('release (validation)', () => {
  let fixtureDir: string | undefined;
  let originalGithubToken: string | undefined;

  beforeEach(() => {
    originalGithubToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    if (originalGithubToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalGithubToken;
    if (fixtureDir) removeFixtureDir(fixtureDir);
    fixtureDir = undefined;
  });

  it('should reject an invalid release type before touching the filesystem', async () => {
    await expect(release({ release: 'stable', path: '/nonexistent' })).rejects.toThrow(/Invalid release/);
  });

  it('should reject a non-existent target directory', async () => {
    await expect(release({ release: 'patch', path: '/definitely/not/a/real/path' })).rejects.toThrow(/Not a directory/);
  });

  it('should reject a target with no package.json', async () => {
    fixtureDir = createFixtureDir('shadow-release-no-pkg-');
    await expect(release({ release: 'patch', path: fixtureDir })).rejects.toThrow(/No package\.json/);
  });

  it('should reject a package.json with no "name"', async () => {
    fixtureDir = createFixtureDir('shadow-release-no-name-');
    writeFixtureFiles(fixtureDir, { 'package.json': JSON.stringify({ version: '1.0.0' }) });
    await expect(release({ release: 'patch', path: fixtureDir })).rejects.toThrow(/no "name"/);
  });

  it('should reject a package.json with no "version"', async () => {
    fixtureDir = createFixtureDir('shadow-release-no-version-');
    writeFixtureFiles(fixtureDir, { 'package.json': JSON.stringify({ name: '@fixtures/pkg' }) });
    await expect(release({ release: 'patch', path: fixtureDir })).rejects.toThrow(/no "version"/);
  });

  it('should require GITHUB_TOKEN', async () => {
    fixtureDir = createFixtureDir('shadow-release-no-token-');
    writeFixtureFiles(fixtureDir, { 'package.json': JSON.stringify({ name: '@fixtures/pkg', version: '1.0.0' }) });
    await expect(release({ release: 'patch', path: fixtureDir })).rejects.toThrow(/GITHUB_TOKEN/);
  });
});

describe('release (with injected dependencies)', () => {
  let fixtureDir: string | undefined;
  let originalGithubToken: string | undefined;

  beforeEach(() => {
    originalGithubToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    if (originalGithubToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalGithubToken;
    if (fixtureDir) removeFixtureDir(fixtureDir);
    fixtureDir = undefined;
  });

  const setup = (prefix: string, version = '1.0.0', config?: object): string => {
    const dir = createFixtureDir(prefix);
    writeFixtureFiles(dir, {
      'package.json': JSON.stringify({ name: '@fixtures/pkg', version }),
      ...(config ? { '.shadowrc.json': JSON.stringify(config) } : {}),
    });
    return dir;
  };

  it('should bump the chosen level, build, tag, release (not prerelease), and publish', async () => {
    fixtureDir = setup('shadow-release-ok-');
    const { deps, recorder } = withGitRoot(fixtureDir);

    // default commits (a feat) require "minor"; choosing minor is allowed
    await release({ release: 'minor', path: fixtureDir }, deps);

    expect(recorder.buildCalls).toStrictEqual([fixtureDir]);
    expect(recorder.commands).toContain('bun test');
    expect(recorder.clientCalls).toStrictEqual(['getContent', 'createOrUpdateFileContents']);
    expect(recorder.createRefArgs).toStrictEqual([{ ref: 'refs/tags/v1.1.0', sha: 'newsha' }]);
    expect(recorder.createReleaseArgs).toStrictEqual([{ tag_name: 'v1.1.0', prerelease: false }]);
    expect(recorder.commands).toContain('npm publish');
    expect(recorder.publishArgs).toContain('--tag');
    expect(recorder.publishArgs).toContain('latest');
    expect(JSON.parse(fs.readFileSync(path.join(fixtureDir, 'package.json'), 'utf-8')).version).toBe('1.1.0');
  });

  it('should error when the chosen level is below what the commits require', async () => {
    fixtureDir = setup('shadow-release-toolow-');
    const { deps, recorder } = withGitRoot(fixtureDir, { 'git log': ok('feat!: a breaking change\x00') });

    await expect(release({ release: 'minor', path: fixtureDir }, deps)).rejects.toThrow(/require a "major" bump, but "minor" was requested.*--force/s);
    expect(recorder.buildCalls).toHaveLength(0);
    expect(recorder.clientCalls).toHaveLength(0);
  });

  it('should warn but proceed under --force when the commits require a higher bump', async () => {
    fixtureDir = setup('shadow-release-force-');
    const { deps, recorder } = withGitRoot(fixtureDir, { 'git log': ok('feat!: a breaking change\x00') });
    const warn = spyOn(log, 'warn').mockImplementation(() => undefined);

    try {
      await release({ release: 'minor', force: true, path: fixtureDir }, deps);
      expect(warn.mock.calls.some(([msg]) => /Proceeding anyway because --force/.test(String(msg)))).toBe(true);
    } finally {
      warn.mockRestore();
    }

    expect(recorder.createRefArgs).toStrictEqual([{ ref: 'refs/tags/v1.1.0', sha: 'newsha' }]);
    expect(JSON.parse(fs.readFileSync(path.join(fixtureDir, 'package.json'), 'utf-8')).version).toBe('1.1.0');
  });

  it('should allow a 0.x breaking change as a minor release without --force', async () => {
    fixtureDir = setup('shadow-release-zerox-', '0.1.1');
    const { deps, recorder } = withGitRoot(fixtureDir, { 'git log': ok('feat!: a breaking change\x00') });

    await release({ release: 'minor', path: fixtureDir }, deps);

    expect(recorder.createRefArgs).toStrictEqual([{ ref: 'refs/tags/v0.2.0', sha: 'newsha' }]);
    expect(JSON.parse(fs.readFileSync(path.join(fixtureDir, 'package.json'), 'utf-8')).version).toBe('0.2.0');
  });

  it('should allow over-releasing (a higher level than the commits require)', async () => {
    fixtureDir = setup('shadow-release-over-');
    const { deps, recorder } = withGitRoot(fixtureDir, { 'git log': ok('fix: only a patch-worthy change\x00') });

    await release({ release: 'major', path: fixtureDir }, deps);

    expect(recorder.createRefArgs).toStrictEqual([{ ref: 'refs/tags/v2.0.0', sha: 'newsha' }]);
  });

  it('should cut an alpha prerelease at the inferred level and mark the release as prerelease', async () => {
    fixtureDir = setup('shadow-release-alpha-');
    const { deps, recorder } = withGitRoot(fixtureDir); // default commits require "minor"

    await release({ release: 'alpha', path: fixtureDir }, deps);

    expect(recorder.createRefArgs).toStrictEqual([{ ref: 'refs/tags/v1.1.0-alpha.0', sha: 'newsha' }]);
    expect(recorder.createReleaseArgs).toStrictEqual([{ tag_name: 'v1.1.0-alpha.0', prerelease: true }]);
    expect(recorder.publishArgs.slice(-2)).toStrictEqual(['--tag', 'alpha']);
  });

  it("should run the repo's own test script instead of bun test when one is declared", async () => {
    fixtureDir = createFixtureDir('shadow-release-testscript-');
    writeFixtureFiles(fixtureDir, { 'package.json': JSON.stringify({ name: '@fixtures/pkg', version: '1.0.0', scripts: { test: 'vitest run' } }) });
    const { deps, recorder } = withGitRoot(fixtureDir);

    await release({ release: 'minor', path: fixtureDir }, deps);

    expect(recorder.commands).toContain('bun run');
    expect(recorder.commands).not.toContain('bun test');
  });

  it('should skip npm publish when release.npm is false', async () => {
    fixtureDir = setup('shadow-release-nonpm-', '1.0.0', { release: { npm: false } });
    const { deps, recorder } = withGitRoot(fixtureDir);

    await release({ release: 'minor', path: fixtureDir }, deps);

    expect(recorder.commands).not.toContain('npm publish');
    expect(recorder.createReleaseArgs).toHaveLength(1);
  });

  it('should abort before any release action when tests fail', async () => {
    fixtureDir = setup('shadow-release-testfail-');
    const { deps, recorder } = withGitRoot(fixtureDir, { 'bun test': fail(1, 'boom') });

    await expect(release({ release: 'minor', path: fixtureDir }, deps)).rejects.toThrow(/Tests failed/);
    expect(recorder.buildCalls).toHaveLength(0);
    expect(recorder.clientCalls).toHaveLength(0);
  });

  it('should throw when there are no commits since the last release', async () => {
    fixtureDir = setup('shadow-release-nocommits-');
    const { deps } = withGitRoot(fixtureDir, { 'git log': ok('') });

    await expect(release({ release: 'minor', path: fixtureDir }, deps)).rejects.toThrow(/No commits/);
  });
});
