/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { checkMigrations } from '@lib/check-migrations';
import { run } from '@lib/utils';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from './helpers/fixture';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

function initGitRepo(dir: string): void {
  run('git', ['init', '--quiet'], { cwd: dir, stream: false });
  run('git', ['config', 'user.email', 'test@example.com'], {
    cwd: dir,
    stream: false,
  });
  run('git', ['config', 'user.name', 'Test'], { cwd: dir, stream: false });
  run('git', ['add', '-A'], { cwd: dir, stream: false });
  run('git', ['commit', '--quiet', '-m', 'initial'], {
    cwd: dir,
    stream: false,
  });
}

describe('checkMigrations (integration)', () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) removeFixtureDir(fixtureDir);
    fixtureDir = undefined;
  });

  it('should pass when db:generate leaves the migrations directory clean', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-check-migrations-clean-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/server',
        scripts: { 'db:generate': 'node -e "0"' },
      }),
      'generated/drizzle/0000_init.sql': '-- init\n',
    });
    initGitRepo(fixtureDir);

    await expect(checkMigrations({ cwd: fixtureDir })).resolves.toBeUndefined();
  });

  it('should fail when db:generate modifies an already-tracked migration file', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-check-migrations-modified-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/server',
        scripts: {
          'db:generate': `node -e "require('fs').appendFileSync('generated/drizzle/0000_init.sql', '-- drift\\n')"`,
        },
      }),
      'generated/drizzle/0000_init.sql': '-- init\n',
    });
    initGitRepo(fixtureDir);

    await expect(checkMigrations({ cwd: fixtureDir })).rejects.toThrow(/uncommitted changes/);
  });

  it('should fail when db:generate creates a brand new untracked migration file', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-check-migrations-untracked-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/server',
        scripts: {
          'db:generate': `node -e "require('fs').writeFileSync('generated/drizzle/0001_new.sql', '-- new\\n')"`,
        },
      }),
      'generated/drizzle/0000_init.sql': '-- init\n',
    });
    initGitRepo(fixtureDir);

    await expect(checkMigrations({ cwd: fixtureDir })).rejects.toThrow(/uncommitted changes/);
  });

  it('should use a custom --dir when given', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-check-migrations-dir-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/server',
        scripts: { 'db:generate': 'node -e "0"' },
      }),
      'db/migrations/0000_init.sql': '-- init\n',
    });
    initGitRepo(fixtureDir);

    await expect(checkMigrations({ cwd: fixtureDir, dir: 'db/migrations' })).resolves.toBeUndefined();
  });

  it('should fail clearly when db:generate does not exist', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-check-migrations-no-script-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/server', scripts: {} }),
    });
    initGitRepo(fixtureDir);

    await expect(checkMigrations({ cwd: fixtureDir })).rejects.toThrow(/No "db:generate" script/);
  });
});
