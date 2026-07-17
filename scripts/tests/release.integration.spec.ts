/**
 * Importing npm packages
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { type ReleaseDependencies, release } from '@lib/release';
import { type RunResult } from '@lib/utils';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from './helpers/fixture';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const ok = (stdout = ''): RunResult => ({ status: 0, stdout, stderr: '' });
const fail = (status = 1, stderr = ''): RunResult => ({
  status,
  stdout: '',
  stderr,
});

/** Canned responses for every command `release` can spawn, keyed loosely by command + first arg. */
function fakeDeps(gitRoot: string, overrides: Partial<Record<string, RunResult>> = {}): ReleaseDependencies {
  return {
    run: (command, args) => {
      const key = `${command} ${args[0]}`;
      if (overrides[key]) return overrides[key];
      if (command === 'gh' && args[0] === '--version') return ok();
      if (command === 'git' && args[0] === 'remote') return ok('git@github.com:fixtures/pkg.git');
      if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') return ok(gitRoot);
      if (command === 'git' && args[0] === 'rev-parse') return ok('abc123');
      if (command === 'git' && args[0] === 'show') return ok('chore: release v1.0.1');
      if (command === 'gh' && args[0] === 'api') return ok();
      if (command === 'bunx' && args[0] === 'release-it') return ok();
      throw new Error(`fakeDeps: unexpected command "${command} ${args.join(' ')}"`);
    },
  };
}

/**
 * These only exercise `release`'s validation path — every case here is rejected before the command
 * would spawn `release-it` or `gh`, so no real release, publish, or GitHub API call ever happens.
 */
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

  it('should reject an invalid bump before touching the filesystem', async () => {
    await expect(release({ bump: 'not-a-bump', path: '/nonexistent' })).rejects.toThrow(/Invalid bump/);
  });

  it('should reject a non-existent target directory', async () => {
    await expect(release({ bump: 'patch', path: '/definitely/not/a/real/path' })).rejects.toThrow(/Not a directory/);
  });

  it('should reject a target with no package.json', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-release-no-pkg-');
    await expect(release({ bump: 'patch', path: fixtureDir })).rejects.toThrow(/No package\.json/);
  });

  it('should reject a package.json with no "name"', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-release-no-name-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ version: '1.0.0' }),
    });
    await expect(release({ bump: 'patch', path: fixtureDir })).rejects.toThrow(/no "name"/);
  });

  it('should reject a target with no .release-it.json', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-release-no-config-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/pkg' }),
    });
    await expect(release({ bump: 'patch', path: fixtureDir })).rejects.toThrow(/\.release-it\.json/);
  });

  it('should require GITHUB_TOKEN when the config still needs the back-sync (git.push: false)', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-release-needs-token-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/pkg' }),
      '.release-it.json': JSON.stringify({ git: { push: false } }),
    });
    await expect(release({ bump: 'patch', path: fixtureDir })).rejects.toThrow(/GITHUB_TOKEN/);
  });
});

/**
 * These exercise `release`'s full happy/failure paths using an injected fake `run` (see
 * {@link ReleaseDependencies}) — no real `release-it`, `git`, or `gh` process is ever spawned here.
 */
describe('release (with injected process dependency)', () => {
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

  it('should run release-it then back-sync package.json when git.push is false', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-release-happy-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/pkg',
        version: '1.0.1',
      }),
      '.release-it.json': JSON.stringify({ git: { push: false } }),
    });

    const calls: string[] = [];
    const deps = fakeDeps(fixtureDir);
    const trackedDeps: ReleaseDependencies = {
      run: (command, args, opts) => (calls.push(`${command} ${args[0]}`), deps.run(command, args, opts)),
    };

    await release({ bump: 'patch', path: fixtureDir }, trackedDeps);

    expect(calls).toContain('bunx release-it');
    expect(calls).toContain('gh api');
  });

  it('should skip the back-sync entirely when git.push is true', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-release-no-backsync-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/pkg',
        version: '1.0.1',
      }),
      '.release-it.json': JSON.stringify({ git: { push: true } }),
    });
    delete process.env.GITHUB_TOKEN; // must not be required when back-sync isn't needed

    const calls: string[] = [];
    const deps = fakeDeps(fixtureDir);
    const trackedDeps: ReleaseDependencies = {
      run: (command, args, opts) => (calls.push(`${command} ${args[0]}`), deps.run(command, args, opts)),
    };

    await release({ bump: 'patch', path: fixtureDir }, trackedDeps);

    expect(calls).toContain('bunx release-it');
    expect(calls).not.toContain('gh api');
  });

  it('should report a release-it failure and never attempt the back-sync', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-release-it-fail-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/pkg' }),
      '.release-it.json': JSON.stringify({ git: { push: false } }),
    });

    const calls: string[] = [];
    const deps = fakeDeps(fixtureDir, {
      'bunx release-it': fail(2, 'release-it exploded'),
    });
    const trackedDeps: ReleaseDependencies = {
      run: (command, args, opts) => (calls.push(`${command} ${args[0]}`), deps.run(command, args, opts)),
    };

    await expect(release({ bump: 'patch', path: fixtureDir }, trackedDeps)).rejects.toThrow(/release-it failed/);
    expect(calls).not.toContain('gh api');
  });

  it('should report which back-sync step failed and never print the token', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-release-backsync-fail-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/pkg' }),
      '.release-it.json': JSON.stringify({ git: { push: false } }),
    });

    const deps = fakeDeps(fixtureDir, {
      'gh api': fail(1, 'permission denied'),
    });
    let capturedError: Error | undefined;
    try {
      await release({ bump: 'patch', path: fixtureDir }, deps);
    } catch (error) {
      capturedError = error as Error;
    }

    expect(capturedError?.message).toMatch(/back-sync failed/);
    expect(capturedError?.message).not.toContain('test-token');
  });

  it('should pass --preRelease=beta for a pre-* bump', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-release-pre-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/pkg' }),
      '.release-it.json': JSON.stringify({ git: { push: true } }),
    });

    let releaseItArgs: string[] = [];
    const deps = fakeDeps(fixtureDir);
    const trackedDeps: ReleaseDependencies = {
      run: (command, args, opts) => {
        if (command === 'bunx') releaseItArgs = args;
        return deps.run(command, args, opts);
      },
    };

    await release({ bump: 'prepatch', path: fixtureDir }, trackedDeps);
    expect(releaseItArgs).toContain('--preRelease=beta');
  });
});
