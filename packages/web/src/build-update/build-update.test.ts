import { describe, expect, it } from 'bun:test';

import { type BuildCheckTiming, buildIdResponse, canCheckNow, isChunkLoadError, isDifferentBuild, nextCheckDelay, readBuildId, resolveBuildId, retryDelay } from './build-update';

const TIMING: BuildCheckTiming = { intervalMs: 1000, minGapMs: 100, maxBackoffMs: 5000 };

describe('resolveBuildId', () => {
  it('should use the deploy version when one is given', () => {
    expect(resolveBuildId(' 8da62ae-dirty-1f2e ', 0)).toBe('8da62ae-dirty-1f2e');
  });

  it('should fall back to the build time when no version is given', () => {
    expect(resolveBuildId(undefined, 1_700_000_000_000)).toBe(`local-${(1_700_000_000_000).toString(36)}`);
    expect(resolveBuildId('  ', 35)).toBe('local-z');
  });
});

describe('buildIdResponse', () => {
  it('should answer the build id as uncached JSON', async () => {
    const response = buildIdResponse('8da62ae');

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(readBuildId(await response.json())).toBe('8da62ae');
  });
});

describe('readBuildId', () => {
  it('should read a trimmed build id', () => {
    expect(readBuildId({ buildId: ' abc ' })).toBe('abc');
  });

  it('should reject a body that is not a build id payload', () => {
    for (const body of [null, 'abc', 42, {}, { buildId: 42 }, { buildId: '   ' }, { buildId: 'x'.repeat(201) }]) expect(readBuildId(body)).toBeNull();
  });
});

describe('isDifferentBuild', () => {
  it('should flag a served build that differs from the loaded one', () => {
    expect(isDifferentBuild('aaa', 'bbb')).toBe(true);
  });

  it('should not flag the same build or a failed check', () => {
    expect(isDifferentBuild('aaa', 'aaa')).toBe(false);
    expect(isDifferentBuild('aaa', null)).toBe(false);
  });
});

describe('retryDelay', () => {
  it('should wait one interval while checks succeed', () => {
    expect(retryDelay(0, TIMING)).toBe(1000);
  });

  it('should double per consecutive failure up to the ceiling', () => {
    expect([1, 2, 3, 4, 5, 20].map(failures => retryDelay(failures, TIMING))).toEqual([1000, 2000, 4000, 5000, 5000, 5000]);
  });
});

describe('nextCheckDelay', () => {
  it('should count down from the last attempt', () => {
    expect(nextCheckDelay({ lastAttemptAt: 10_000, failures: 0 }, 10_400, TIMING)).toBe(600);
    expect(nextCheckDelay({ lastAttemptAt: 10_000, failures: 2 }, 10_400, TIMING)).toBe(1600);
  });

  it('should never be negative once a check is overdue', () => {
    expect(nextCheckDelay({ lastAttemptAt: 0, failures: 0 }, 50_000, TIMING)).toBe(0);
  });
});

describe('canCheckNow', () => {
  it('should hold focus checks to the minimum gap', () => {
    expect(canCheckNow({ lastAttemptAt: 0, failures: 0 }, 99, TIMING)).toBe(false);
    expect(canCheckNow({ lastAttemptAt: 0, failures: 0 }, 100, TIMING)).toBe(true);
  });

  it('should let an urgent check skip the gap', () => {
    expect(canCheckNow({ lastAttemptAt: 0, failures: 0 }, 1, TIMING, true)).toBe(true);
  });

  it('should hold every check, urgent ones included, until the backoff elapses', () => {
    const failing = { lastAttemptAt: 0, failures: 2 };

    expect(canCheckNow(failing, 1999, TIMING)).toBe(false);
    expect(canCheckNow(failing, 1999, TIMING, true)).toBe(false);
    expect(canCheckNow(failing, 2000, TIMING)).toBe(true);
  });
});

describe('isChunkLoadError', () => {
  it('should recognise each browser’s failed dynamic import', () => {
    const messages = [
      'Failed to fetch dynamically imported module: https://forge.example/assets/chat-1a2b.js',
      'error loading dynamically imported module: https://forge.example/assets/chat-1a2b.js',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/chat-1a2b.css',
    ];
    for (const message of messages) expect(isChunkLoadError(new TypeError(message))).toBe(true);
    expect(isChunkLoadError(Object.assign(new Error('Loading chunk 7 failed'), { name: 'ChunkLoadError' }))).toBe(true);
  });

  it('should ignore unrelated rejections', () => {
    for (const reason of [new Error('Request failed'), 'Failed to fetch dynamically imported module', null, undefined, {}]) expect(isChunkLoadError(reason)).toBe(false);
  });
});
