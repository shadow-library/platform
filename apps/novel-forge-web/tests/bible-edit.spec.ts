import { describe, expect, it } from 'bun:test';

import { type EditEvent, type EditState, stepEdit } from '../src/lib/bible-edit';

function run(events: EditEvent[], start: EditState = { mode: 'reading' }): { state: EditState; saves: string[]; focus: boolean } {
  const saves: string[] = [];
  let state = start;
  let focus = false;
  for (const event of events) {
    const step = stepEdit(state, event);
    state = step.state;
    focus = step.focus ?? false;
    if (step.save !== undefined) saves.push(step.save);
  }
  return { state, saves, focus };
}

const byKey = (current: string, required = false): EditEvent => ({ type: 'commit', current, required, via: 'key' });
const byBlur = (current: string, required = false): EditEvent => ({ type: 'commit', current, required, via: 'blur' });
const open = (value: string, draft: string): EditEvent[] => [
  { type: 'open', value },
  { type: 'change', draft },
];

describe('stepEdit', () => {
  it('should save a real change once, and close when the save lands', () => {
    const { state, saves } = run([...open('Tamsin', ' Tamsin Rook '), byKey('Tamsin'), byKey('Tamsin'), { type: 'saved' }]);
    expect(saves).toEqual(['Tamsin Rook']);
    expect(state).toEqual({ mode: 'reading' });
  });

  it('should close without saving when nothing changed, or a required field was emptied', () => {
    expect(run([...open('Tamsin', 'Tamsin '), byKey('Tamsin')])).toMatchObject({ state: { mode: 'reading' }, saves: [] });
    expect(run([...open('Tamsin', ' '), byKey('Tamsin', true)])).toMatchObject({ state: { mode: 'reading' }, saves: [] });
    expect(run([...open('scar', ''), byKey('scar')]).saves).toEqual(['']);
  });

  it('should drop the draft on Escape', () => {
    expect(run([...open('a', 'b'), { type: 'escape' }])).toMatchObject({ state: { mode: 'reading' }, saves: [] });
  });

  it('should stop and ask instead of overwriting a value someone else saved while the field was open', () => {
    const asked = run([...open('old', 'mine'), byBlur('theirs')]);
    expect(asked.saves).toEqual([]);
    expect(asked.state).toMatchObject({ mode: 'editing', conflict: true });
    expect(run([byBlur('theirs')], asked.state).saves).toEqual([]);
    expect(run([{ type: 'keepMine', required: false }], asked.state).saves).toEqual(['mine']);
    expect(run([{ type: 'takeTheirs' }], asked.state)).toMatchObject({ state: { mode: 'reading' }, saves: [] });
  });

  it('should not let Keep mine blank a required field', () => {
    const asked = run([...open('Tamsin', '  '), byBlur('Tam', true)]);
    expect(asked.state).toMatchObject({ mode: 'reading' });
    const conflicted: EditState = { mode: 'editing', base: 'Tamsin', draft: ' ', conflict: true, saving: false, returnFocus: false };
    expect(run([{ type: 'keepMine', required: true }], conflicted)).toMatchObject({ state: { mode: 'reading' }, saves: [] });
  });

  it('should keep the draft open after a failed save so nothing typed is lost', () => {
    const { state } = run([...open('a', 'b'), byKey('a'), { type: 'failed' }]);
    expect(state).toMatchObject({ mode: 'editing', base: 'a', draft: 'b', conflict: false, saving: false });
  });

  it('should ignore edits while a save is in flight', () => {
    const { state } = run([...open('a', 'b'), byKey('a'), { type: 'change', draft: 'c' }]);
    expect(state).toMatchObject({ draft: 'b', saving: true });
  });

  it('should return focus to the Edit control after a deliberate close, never after a save started by blur', () => {
    expect(run([...open('a', 'b'), { type: 'escape' }]).focus).toBe(true);
    expect(run([...open('a', 'b'), byKey('a'), { type: 'saved' }]).focus).toBe(true);
    expect(run([...open('a', 'a'), byKey('a')]).focus).toBe(true);
    expect(run([...open('a', 'b'), byBlur('a'), { type: 'saved' }]).focus).toBe(false);
    expect(run([...open('a', 'a'), byBlur('a')]).focus).toBe(false);
    const asked = run([...open('old', 'mine'), byBlur('theirs')]).state;
    expect(run([{ type: 'keepMine', required: false }, { type: 'saved' }], asked).focus).toBe(true);
    expect(run([{ type: 'takeTheirs' }], asked).focus).toBe(true);
  });
});
