import { describe, expect, it } from 'bun:test';

import { type ArtEvent, renderEventsAsOf } from '@modules/ai/context/art-context';
import { WriterDisclosurePolicy } from '@modules/bible/fact/writer-disclosure-policy';

const SECRET = 'Evan is the lost heir of the ridge court';
const secretFact = { factKey: 'evan_heir', text: SECRET, terms: ['ridge court'] };

function policy(chapter: number, lockedFacts = [secretFact]): WriterDisclosurePolicy {
  return new WriterDisclosurePolicy({ chapter, lockedFacts, plannerOnly: [], plannerPages: [], volumeOrdinals: new Map(), currentVolumeOrdinal: null });
}

function event(overrides: Partial<ArtEvent>): ArtEvent {
  return { chapter: 1, kind: 'state', detailKey: '', after: { condition: 'unhurt' }, status: 'committed', ...overrides };
}

describe('renderEventsAsOf', () => {
  it('should keep the changes up to the chapter and drop every later one', () => {
    const events = [event({ chapter: 2, after: { condition: 'bruised' } }), event({ chapter: 50, after: { condition: 'lost his left arm' } })];

    const rendered = renderEventsAsOf(events, 10, policy(10, []));

    expect(rendered).toContain('bruised');
    expect(rendered).not.toContain('left arm');
  });

  it('should drop provisional changes and bare sightings', () => {
    const events = [event({ chapter: 3, status: 'provisional', after: { condition: 'feverish' } }), event({ chapter: 3, kind: 'appearance', after: { seen: true } })];

    expect(renderEventsAsOf(events, 10, policy(10, []))).toBe('');
  });

  it('should scrub a secret truth out of a change the chapter writer may not read', () => {
    const events = [event({ chapter: 4, kind: 'relationship', detailKey: 'ridge court', after: { note: `${SECRET}.` } })];

    const rendered = renderEventsAsOf(events, 5, policy(5));

    expect(rendered).not.toContain('lost heir');
    expect(rendered).not.toContain('ridge court');
    expect(rendered).toContain('[withheld]');
  });
});
