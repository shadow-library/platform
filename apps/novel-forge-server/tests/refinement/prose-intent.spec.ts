import { describe, expect, it } from 'bun:test';

import { PASSAGE_EDIT_WITHHELD_NOTE, PROSE_EDIT_WITHHELD_NOTE, proseEditIssues, proseWithheldNote, withoutProseEditOps } from '@modules/refinement';

describe('proseEditIssues', () => {
  it('should flag every prose op and nothing else', () => {
    const issues = proseEditIssues([
      { op: 'brief.update', chapter: 1, body: 'Purpose: arrive.' },
      { op: 'draft.update', chapter: 1, body: 'Orrin arrived.' },
      { op: 'action.revise_draft', chapter: 1, note: 'shorter' },
      { op: 'draft.rewrite_passage', chapter: 1, passage: 'Orrin walked.', replacement: 'Orrin ran.' },
    ]);
    expect(issues).toHaveLength(3);
    expect(issues[0]).toStartWith('changeSet[1]: draft.update changes the chapter');
    expect(issues[1]).toStartWith('changeSet[2]: action.revise_draft');
    expect(issues[2]).toBe(
      'changeSet[3]: draft.rewrite_passage needs Edit prose, which is off — drop it, say in the reply what you would change, and suggest turning on Edit prose; never turn a passage comment into a brief.update.',
    );
  });
});

describe('withoutProseEditOps', () => {
  it('should keep the plan ops and count what it withheld', () => {
    const brief = { op: 'brief.update', chapter: 1 };
    expect(withoutProseEditOps([{ op: 'draft.remove', chapter: 1 }, brief])).toEqual({ kept: [brief], withheld: 1 });
  });

  it('should withhold a passage rewrite with the approval that leaned on it', () => {
    const brief = { op: 'brief.update', chapter: 3 };
    const changeSet = [{ op: 'draft.rewrite_passage', chapter: 3, passage: 'Orrin walked.', replacement: 'Orrin ran.' }, { op: 'action.approve_draft', chapter: 3 }, brief];
    expect(withoutProseEditOps(changeSet)).toEqual({ kept: [brief], withheld: 2 });
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

describe('proseWithheldNote', () => {
  const passage = { op: 'draft.rewrite_passage', chapter: 3, passage: 'Orrin walked.', replacement: 'Orrin ran.' };

  it('should say the passage was left as it is when every withheld op rewrote a passage', () => {
    expect(proseWithheldNote([passage, passage, { op: 'brief.update', chapter: 3 }])).toBe(PASSAGE_EDIT_WITHHELD_NOTE);
  });

  it('should point at the plan when a whole-chapter edit or a revision was withheld too', () => {
    expect(proseWithheldNote([passage, { op: 'draft.update', chapter: 3, body: 'x' }])).toBe(PROSE_EDIT_WITHHELD_NOTE);
    expect(proseWithheldNote([{ op: 'action.revise_draft', chapter: 3, note: 'shorter' }])).toBe(PROSE_EDIT_WITHHELD_NOTE);
  });
});
