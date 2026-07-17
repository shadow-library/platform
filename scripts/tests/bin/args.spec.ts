/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { parseArgs } from '@lib/bin/args';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('parseArgs', () => {
  it('should collect positionals with no flags', () => {
    expect(parseArgs(['patch'])).toStrictEqual({
      positionals: ['patch'],
      flags: {},
    });
  });

  it('should parse "--flag value" pairs', () => {
    expect(parseArgs(['--path', '../other'])).toStrictEqual({
      positionals: [],
      flags: { path: '../other' },
    });
  });

  it('should parse "--flag=value" pairs', () => {
    expect(parseArgs(['--path=../other'])).toStrictEqual({
      positionals: [],
      flags: { path: '../other' },
    });
  });

  it('should treat a flag with no following value as boolean true', () => {
    expect(parseArgs(['--help'])).toStrictEqual({
      positionals: [],
      flags: { help: true },
    });
  });

  it('should treat a flag immediately followed by another flag as boolean true', () => {
    expect(parseArgs(['--fix', '--verbose'])).toStrictEqual({
      positionals: [],
      flags: { fix: true, verbose: true },
    });
  });

  it('should mix positionals and flags in any order', () => {
    expect(parseArgs(['patch', '--path', '.', 'extra'])).toStrictEqual({
      positionals: ['patch', 'extra'],
      flags: { path: '.' },
    });
  });

  it('should return empty positionals/flags for empty input', () => {
    expect(parseArgs([])).toStrictEqual({ positionals: [], flags: {} });
  });
});
