import { describe, expect, it } from 'bun:test';

import { DEFAULT_CUTOVER, parseTransferOptions } from '@server/transfer-curated-projects.options';

const REQUIRED = ['--org', '7', '--bot', '42', '--owner', '101'];

const parse = (...args: string[]) => parseTransferOptions(args);

const reasonOf = (...args: string[]): string => {
  const result = parse(...args);
  if (result.ok) throw new Error(`expected a refusal, got ${JSON.stringify(result.options)}`);
  return result.reason;
};

const optionsOf = (...args: string[]) => {
  const result = parse(...args);
  if (!result.ok) throw new Error(`expected a parse, got "${result.reason}"`);
  return result.options;
};

describe('parseTransferOptions', () => {
  it('should parse the required flags and default the cutover', () => {
    expect(optionsOf(...REQUIRED)).toEqual({ organisationId: 7n, botId: 42n, owners: [101n], before: new Date(DEFAULT_CUTOVER), dryRun: false });
  });

  it('should require org, bot and owner', () => {
    expect(reasonOf('--org', '7', '--bot', '42')).toContain('required');
    expect(reasonOf('--org', '7', '--owner', '101')).toContain('required');
    expect(reasonOf('--bot', '42', '--owner', '101')).toContain('required');
  });

  it('should refuse an empty owner list rather than reading it as owner zero', () => {
    expect(reasonOf('--org', '7', '--bot', '42', '--owner', '')).toContain('required');
    expect(reasonOf('--org', '7', '--bot', '42', '--owner', '101,')).toContain('--owner');
    expect(reasonOf('--org', '7', '--bot', '42', '--owner', ' ')).toContain('--owner');
  });

  it('should refuse a non-numeric id on any flag', () => {
    expect(reasonOf('--org', 'abc', '--bot', '42', '--owner', '101')).toContain('--org');
    expect(reasonOf('--org', '7', '--bot', '-1', '--owner', '101')).toContain('--bot');
    expect(reasonOf('--org', '7', '--bot', '42', '--owner', '101,nobody')).toContain('--owner');
  });

  it('should read a comma-separated owner list, trimming each entry', () => {
    expect(optionsOf('--org', '7', '--bot', '42', '--owner', '101, 102 ,103').owners).toEqual([101n, 102n, 103n]);
  });

  it('should take a flag as a missing value rather than as an id', () => {
    expect(reasonOf('--org', '--bot', '42', '--owner', '101')).toContain('--org');
  });

  it('should parse an explicit cutover and refuse an unparseable one', () => {
    expect(optionsOf(...REQUIRED, '--before', '2026-09-20T12:00:00Z').before).toEqual(new Date('2026-09-20T12:00:00Z'));
    expect(reasonOf(...REQUIRED, '--before', 'last tuesday')).toContain('--before');
  });

  it('should read the dry-run flag', () => {
    expect(optionsOf(...REQUIRED, '--dry-run').dryRun).toBe(true);
    expect(optionsOf(...REQUIRED).dryRun).toBe(false);
  });
});
