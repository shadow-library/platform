import { afterEach, describe, expect, it } from 'bun:test';

import { assertUnderProjectCap, isProjectCapReached } from '@modules/project';
import { type AppError, Config } from '@shadow-library/common';

import { type OwnerRef } from '@server/common';

function setConfig(key: string, value: unknown): void {
  (Config as unknown as { cache: Map<string, unknown> })['cache'].set(key, value);
}

function clearConfig(key: string): void {
  (Config as unknown as { cache: Map<string, unknown> })['cache'].delete(key);
}

describe('isProjectCapReached', () => {
  it('should allow creation while the owner is below the cap', () => {
    expect(isProjectCapReached(98, 100)).toBe(false);
    expect(isProjectCapReached(99, 100)).toBe(false);
  });

  it('should reject creation once the count reaches the cap', () => {
    expect(isProjectCapReached(100, 100)).toBe(true);
    expect(isProjectCapReached(150, 100)).toBe(true);
  });

  it('should treat a non-positive cap as disabled', () => {
    expect(isProjectCapReached(9_999, 0)).toBe(false);
    expect(isProjectCapReached(9_999, -1)).toBe(false);
  });
});

// Every project-creation surface (create, clone, import, reforge promote, curated ingest) routes through
// this guard, so exercising it with a stubbed counter proves the cap trips on all of them without a live
// DB; the per-surface wiring is covered behaviourally by the Postgres-backed suites in CI.
describe('assertUnderProjectCap', () => {
  const stubDb = (count: number, onCount?: () => void): never =>
    ({
      $count: async () => {
        onCount?.();
        return count;
      },
    }) as never;

  const owner: OwnerRef = { kind: 'user', id: BigInt(7) };

  afterEach(() => clearConfig('projects.max-per-owner'));

  it('should pass when the owner is below the configured cap', async () => {
    setConfig('projects.max-per-owner', 100);
    await assertUnderProjectCap(stubDb(99), owner);
  });

  it('should throw PRJ_004 once the owner reaches the cap', async () => {
    setConfig('projects.max-per-owner', 3);
    const err = (await assertUnderProjectCap(stubDb(3), owner).catch((e: AppError) => e)) as AppError;
    expect(err.code).toBe('PRJ_004');
  });

  it('should skip the count entirely when the cap is disabled', async () => {
    setConfig('projects.max-per-owner', 0);
    let counted = false;
    await assertUnderProjectCap(
      stubDb(9_999, () => (counted = true)),
      owner,
    );
    expect(counted).toBe(false);
  });
});
