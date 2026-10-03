import { describe, expect, it } from 'bun:test';

import { defaultDeclined, isGuardedOp } from '../src/lib/proposals';

describe('defaultDeclined', () => {
  it('should pre-decline the one-way-door ops so they never apply by accident', () => {
    const declined = defaultDeclined([{ op: 'entity.upsert' }, { op: 'action.finalize' }]);
    expect([...declined]).toEqual([1]);
  });

  it('should pre-decline adding a chapter to the Story Bible', () => {
    expect([...defaultDeclined([{ op: 'action.apply_continuity', chapter: 3 }])]).toEqual([0]);
  });

  it('should decline nothing when the change-set holds no guarded op', () => {
    expect(defaultDeclined([{ op: 'entity.upsert' }]).size).toBe(0);
    expect(isGuardedOp({ op: 'entity.upsert' })).toBe(false);
  });
});
