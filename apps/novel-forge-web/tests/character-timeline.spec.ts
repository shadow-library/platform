import { describe, expect, it } from 'bun:test';

import { describeEvent, type TimelineEvent, timelineRows } from '../src/lib/character-timeline';

const names = new Map([['hollis', 'Hollis Vane']]);

function event(id: string, chapter: number, kind: TimelineEvent['kind'], after: unknown, before: unknown = null, status: TimelineEvent['status'] = 'committed'): TimelineEvent {
  return { id, chapter, kind, after: after as TimelineEvent['after'], before: before as TimelineEvent['before'], status };
}

describe('describeEvent', () => {
  it('should read a state change as what is newly true', () => {
    const lines = describeEvent(
      event(
        '1',
        3,
        'state',
        { location: 'the harbour wall', conditions: ['cut palm', 'soaked'], immediateGoal: 'find the ledger', statusNote: 'stops trusting the council' },
        {
          location: 'the lamp room',
          conditions: ['soaked'],
        },
      ),
      names,
    );
    expect(lines).toEqual(['Now at the harbour wall.', 'Cut palm.', 'Wants now: find the ledger.', 'Stops trusting the council.']);
  });

  it('should skip fields that did not change', () => {
    expect(describeEvent(event('1', 3, 'state', { location: 'the lamp room' }, { location: 'the lamp room' }), names)).toEqual([]);
  });

  it('should name a relationship’s other side and say whether the tie is new', () => {
    expect(describeEvent(event('1', 4, 'relationship', { targetKey: 'hollis', kind: 'mentor', note: 'trusts him less.' }), names)).toEqual([
      'New tie to Hollis Vane (mentor): trusts him less.',
    ]);
    expect(describeEvent(event('1', 4, 'relationship', { targetKey: 'maren', kind: 'family_member' }, { targetKey: 'maren' }), names)).toEqual(['With maren (family member).']);
  });

  it('should yield nothing for a shape it does not know rather than raw data', () => {
    expect(describeEvent(event('1', 4, 'relationship', { unexpected: true }), names)).toEqual([]);
    expect(describeEvent(event('1', 4, 'state', null), names)).toEqual([]);
  });
});

describe('timelineRows', () => {
  it('should show newest chapter first, one row per chapter, with only the first appearance', () => {
    const rows = timelineRows(
      [
        event('a', 1, 'appearance', null),
        event('b', 3, 'appearance', null),
        event('c', 3, 'state', { conditions: ['cut palm'] }),
        event('d', 4, 'state', { statusNote: 'suspects Hollis' }, null, 'provisional'),
        event('e', 4, 'relationship', { targetKey: 'hollis' }),
      ],
      names,
    );
    expect(rows).toEqual([
      { chapter: 4, lines: ['Suspects Hollis.', 'New tie to Hollis Vane.'], provisional: true },
      { chapter: 3, lines: ['Cut palm.'], provisional: false },
      { chapter: 1, lines: ['First appears.'], provisional: false },
    ]);
  });

  it('should be empty with no events', () => {
    expect(timelineRows([], names)).toEqual([]);
  });
});
