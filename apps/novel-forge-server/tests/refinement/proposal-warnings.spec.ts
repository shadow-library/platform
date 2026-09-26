import { describe, expect, it } from 'bun:test';

import { type ChangeOp, revealClearWarnings } from '@modules/refinement';

describe('revealClearWarnings', () => {
  it('should warn when an op undates a fact that is currently dated', () => {
    const ops: ChangeOp[] = [{ op: 'fact.upsert', factKey: 'the_vault_is_empty', revealChapter: null }];
    const warnings = revealClearWarnings(ops, new Map([['the_vault_is_empty', 12]]));
    expect(warnings).toEqual([
      "fact:the_vault_is_empty is scheduled to reveal at chapter 12; this clears that date, so only an unlock condition can let a plan reveal it — check that's intended.",
    ]);
  });

  it('should not warn when the fact was already unscheduled', () => {
    const ops: ChangeOp[] = [{ op: 'fact.upsert', factKey: 'stale_secret', revealChapter: null }];
    expect(revealClearWarnings(ops, new Map())).toEqual([]);
  });

  it('should not warn when revealChapter is merely omitted', () => {
    const ops: ChangeOp[] = [{ op: 'fact.upsert', factKey: 'the_vault_is_empty', body: 'edited' }];
    expect(revealClearWarnings(ops, new Map([['the_vault_is_empty', 12]]))).toEqual([]);
  });

  it('should not warn when a number sets or keeps a date', () => {
    const ops: ChangeOp[] = [{ op: 'fact.upsert', factKey: 'the_vault_is_empty', revealChapter: 30 }];
    expect(revealClearWarnings(ops, new Map([['the_vault_is_empty', 12]]))).toEqual([]);
  });

  it('should ignore other op types', () => {
    const ops: ChangeOp[] = [{ op: 'fact.remove', factKey: 'the_vault_is_empty' }];
    expect(revealClearWarnings(ops, new Map([['the_vault_is_empty', 12]]))).toEqual([]);
  });
});
