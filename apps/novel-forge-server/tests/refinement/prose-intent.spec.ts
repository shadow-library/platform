import { describe, expect, it } from 'bun:test';

import { proseEditIssues, withoutProseEditOps } from '@modules/refinement';

describe('proseEditIssues', () => {
  it('should flag every prose op and nothing else', () => {
    const issues = proseEditIssues([
      { op: 'brief.update', chapter: 1, body: 'Purpose: arrive.' },
      { op: 'draft.update', chapter: 1, body: 'Orrin arrived.' },
      { op: 'action.revise_draft', chapter: 1, note: 'shorter' },
    ]);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toStartWith('changeSet[1]: draft.update changes the chapter');
    expect(issues[1]).toStartWith('changeSet[2]: action.revise_draft');
  });
});

describe('withoutProseEditOps', () => {
  it('should keep the plan ops and count what it withheld', () => {
    const brief = { op: 'brief.update', chapter: 1 };
    expect(withoutProseEditOps([{ op: 'draft.remove', chapter: 1 }, brief])).toEqual({ kept: [brief], withheld: 1 });
  });

  it('should drop the actions that depended on the withheld prose', () => {
    const brief = { op: 'brief.update', chapter: 3 };
    const otherApproval = { op: 'action.approve_draft', chapter: 2 };
    const laterFinalize = { op: 'action.finalize', upTo: 2 };
    const changeSet = [
      { op: 'draft.update', chapter: 3, body: 'Orrin climbed.' },
      { op: 'action.judge_draft', chapter: 3 },
      { op: 'action.approve_draft', chapter: 3 },
      { op: 'action.finalize', upTo: 4 },
      { op: 'action.finalize' },
      brief,
      otherApproval,
      laterFinalize,
    ];
    expect(withoutProseEditOps(changeSet)).toEqual({ kept: [brief, otherApproval, laterFinalize], withheld: 5 });
  });

  it('should keep every action when no prose op was withheld', () => {
    const changeSet = [{ op: 'action.finalize' }, { op: 'action.approve_draft', chapter: 3 }];
    expect(withoutProseEditOps(changeSet)).toEqual({ kept: changeSet, withheld: 0 });
  });
});
