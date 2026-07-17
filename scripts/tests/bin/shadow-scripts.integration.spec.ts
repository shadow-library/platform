/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { run } from '@lib/utils';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const rootDir = path.join(import.meta.dirname, '..', '..');
const binPath = path.join(rootDir, 'src/bin/shadow-scripts.ts');

function invoke(args: string[]) {
  return run('bun', ['run', binPath, ...args], { cwd: rootDir, stream: false });
}

describe('shadow-scripts (bin, integration)', () => {
  it('should print usage and exit 0 for --help', () => {
    const result = invoke(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('build-lib');
  });

  it('should print usage and exit 1 when called with no command', () => {
    const result = invoke([]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Usage:');
  });

  it('should exit 1 with a clear message for an unknown command', () => {
    const result = invoke(['frobnicate']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown command: "frobnicate"');
  });

  it('should exit 1 with a usage message when gen-api-types is missing its url', () => {
    const result = invoke(['gen-api-types']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: shadow-scripts gen-api-types');
  });

  it('should exit 1 with a usage message when release is missing its bump', () => {
    const result = invoke(['release']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: shadow-scripts release');
  });

  it('should not print a raw stack trace for a known ShadowScriptsError', () => {
    const result = invoke(['release']);
    expect(result.stderr).not.toContain(' at ');
  });
});
