import { describe, expect, it } from 'bun:test';

import {
  buildCheckSelection,
  checkLockIssue,
  chooseFix,
  clearResolution,
  dismissFinding,
  nextSlice,
  openFindings,
  parseCheckRound,
  passedCount,
  type Resolutions,
  resolveArithmetic,
  uncheckedSlices,
  writeOwnFix,
} from '@/features/blueprint/check-step';

const round = {
  id: '1',
  options: {
    slices: [
      { slice: 'rules', run: true, passed: 8 },
      { slice: 'cast', run: true, passed: 4 },
      { slice: 'shape', run: false, passed: 0 },
    ],
    findings: [
      {
        id: 'f1',
        slice: 'rules',
        kind: 'story',
        title: 'Rule clash: cost rule vs chapter 3',
        detail: 'He pays with a memory he does not have.',
        choices: [
          { id: 'f1a', label: 'He pays with recent memories', detail: 'Keeps the rule.' },
          { id: 'f1b', label: 'Lost memories still owe', detail: 'Rewrites a locked rule.' },
        ],
      },
      {
        id: 'f2',
        slice: 'cast',
        kind: 'arithmetic',
        title: 'Ages don’t add up: Brannoc',
        detail: 'His card says 38.',
        choices: [
          { id: 'f2a', label: 'Make him 45', detail: 'Matches the page.' },
          { id: 'f2b', label: 'Say “twenty-six years”', detail: 'Keeps him 38.' },
        ],
      },
    ],
  },
} as never;

const parsed = parseCheckRound(round);
const done = { ...parsed, slices: parsed.slices.map(state => ({ ...state, run: true })) };

describe('parseCheckRound', () => {
  it('should read every slice and finding with its two ways out', () => {
    expect(parsed.slices.map(state => state.slice)).toEqual(['rules', 'cast', 'shape']);
    expect(parsed.findings.map(finding => finding.id)).toEqual(['f1', 'f2']);
    expect(parsed.findings[0]?.choices.map(choice => choice.id)).toEqual(['f1a', 'f1b']);
  });

  it('should survive a round with nothing in it', () => {
    expect(parseCheckRound(null)).toEqual({ slices: [], findings: [] });
    expect(parseCheckRound({ id: '2', options: { slices: ['junk'], findings: [{}] } } as never)).toEqual({ slices: [], findings: [] });
  });

  it('should say what is left to check and add up what has passed', () => {
    expect(uncheckedSlices(parsed)).toEqual(['Premise, spine and arcs']);
    expect(nextSlice(parsed)).toBe('shape');
    expect(nextSlice(done)).toBeNull();
    expect(passedCount(parsed)).toBe(12);
  });
});

describe('resolving findings', () => {
  it('should take a way out, and take it back when it is pressed again', () => {
    const chosen = chooseFix({}, 'f1', 'f1a');
    expect(chosen['f1']).toEqual({ choiceId: 'f1a', text: '', dismissed: false });
    expect(chooseFix(chosen, 'f1', 'f1a')).toEqual({});
    expect(chooseFix(chosen, 'f1', 'f1b')['f1']).toMatchObject({ choiceId: 'f1b' });
  });

  it('should replace a way out with the author’s own fix, and with a dismissal', () => {
    const own = writeOwnFix(chooseFix({}, 'f1', 'f1a'), 'f1', 'He pays with the jar itself.');
    expect(own['f1']).toEqual({ text: 'He pays with the jar itself.', dismissed: false });

    const dismissed = dismissFinding(own, 'f1', 'Chapter 3 is a flashback.');
    expect(dismissed['f1']).toEqual({ text: 'Chapter 3 is a flashback.', dismissed: true });
    expect(clearResolution(dismissed, 'f1')).toEqual({});
  });

  it('should take the first way out of every arithmetic finding still open and leave the story ones alone', () => {
    const resolved = resolveArithmetic({}, parsed);
    expect(resolved).toEqual({ f2: { choiceId: 'f2a', text: '', dismissed: false } });

    const already = writeOwnFix({}, 'f2', 'He is 45.');
    expect(resolveArithmetic(already, parsed)).toEqual(already);
  });

  it('should count what nobody has answered yet', () => {
    expect(openFindings(parsed, {}).map(finding => finding.id)).toEqual(['f1', 'f2']);
    expect(openFindings(parsed, chooseFix({}, 'f1', 'f1a')).map(finding => finding.id)).toEqual(['f2']);
  });
});

describe('buildCheckSelection', () => {
  it('should send every answer the author gave, and nothing for the findings they left open', () => {
    const resolutions: Resolutions = { ...chooseFix({}, 'f1', 'f1a'), ...dismissFinding({}, 'f2', 'The page is the one that is wrong.') };

    expect(buildCheckSelection(done, resolutions)).toEqual({
      resolutions: [
        { findingId: 'f1', choiceId: 'f1a', dismissed: false },
        { findingId: 'f2', text: 'The page is the one that is wrong.', dismissed: true },
      ],
    });
  });

  it('should refuse while a slice has never been checked', () => {
    expect(checkLockIssue(parsed, {})).toContain('Premise, spine and arcs');
    expect(buildCheckSelection(parsed, {})).toBeNull();
  });

  it('should refuse a screen with no round at all rather than reading an empty slice list as nothing outstanding', () => {
    const empty = parseCheckRound(null);
    expect(uncheckedSlices(empty)).toEqual(['Rules and briefs', 'Cast, places and ages', 'Premise, spine and arcs']);
    expect(checkLockIssue(empty, {})).toContain('Rules and briefs');
    expect(buildCheckSelection(empty, {})).toBeNull();
  });

  it('should refuse a dismissal with no reason and an answer with nothing in it', () => {
    expect(checkLockIssue(done, { f1: { text: '  ', dismissed: true } })).toContain('a reason');
    expect(buildCheckSelection(done, { f1: { text: '  ', dismissed: true } })).toBeNull();
    expect(buildCheckSelection(done, { f1: { text: '', dismissed: false } })).toBeNull();
  });

  it('should allow a lock that leaves every finding open once every slice has been checked', () => {
    expect(checkLockIssue(done, {})).toBeNull();
    expect(buildCheckSelection(done, {})).toEqual({ resolutions: [] });
  });
});
