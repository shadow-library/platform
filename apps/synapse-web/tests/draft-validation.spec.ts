import { describe, expect, it } from 'bun:test';

import { validationOutcomeOf } from '../src/features/advanced/draft-validation';

describe('validationOutcomeOf', () => {
  it('should report an absent draft when the server answered 204', () => {
    expect(validationOutcomeOf(null)).toEqual({ kind: 'absent', notice: { intent: 'info', title: 'There is no saved draft to validate' } });
  });

  it('should call a valid draft publishable', () => {
    expect(validationOutcomeOf({ valid: true, issues: [] })).toEqual({ kind: 'checked', issues: [], notice: { intent: 'success', title: 'The saved draft is publishable' } });
  });

  it('should count the issues that block publishing', () => {
    const issues = [{ path: 'aliases.x', code: 'unknown_model', message: 'm' }];
    expect(validationOutcomeOf({ valid: false, issues })).toEqual({ kind: 'checked', issues, notice: { intent: 'warning', title: '1 issue(s) block publishing' } });
  });
});
