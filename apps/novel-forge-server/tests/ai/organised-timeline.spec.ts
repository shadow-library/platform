import { describe, expect, it } from 'bun:test';
import { textDigest } from '@shadow-library/sdk';

import { type BibleDocRow } from '@modules/ai/context/bible-docs';
import { organisedTimelineState, organisedTimelineText } from '@modules/ai/context/organised-timeline';

const NOTES = 'A ferryman who lies to the dead.';
const brief = { kind: 'direction' as const, topic: 'start.brief', statement: NOTES, links: {}, payload: null };
const organised = (notesDigest: string) => ({
  kind: 'decision' as const,
  topic: 'organise',
  statement: 'Organised.',
  links: { bibleDocuments: [{ section: 'project' as const, slug: 'timeline' }] },
  payload: { notesDigest },
});
const docs = [
  { section: 'project', slug: 'timeline', frontmatter: null, body: '# Timeline\n\n## The ending\n\n- The ferryman takes the throne' },
  { section: 'world', slug: 'river', frontmatter: null, body: '# River\n\nThe river runs east.' },
] as BibleDocRow[];

describe('organisedTimelineState', () => {
  it('should read the timeline as current only while it was organised from the notes as they stand', () => {
    expect(organisedTimelineState([brief, organised(textDigest(NOTES))])).toBe('current');
    expect(organisedTimelineState([brief, organised('00000000')])).toBe('stale');
    expect(organisedTimelineState([brief])).toBeNull();
  });
});

describe('organisedTimelineText', () => {
  it('should give a planner the timeline whole with its binding rule first', () => {
    const text = organisedTimelineText(docs, [brief, organised(textDigest(NOTES))]);

    expect(text?.startsWith("The author's own timeline")).toBe(true);
    expect(text).toContain('happens where it is placed and never in the opening');
    expect(text).toContain('- The ferryman takes the throne');
    expect(text).not.toContain('The river runs east.');
  });

  it("should let the author's own words win over a timeline organised from older notes", () => {
    expect(organisedTimelineText(docs, [brief, organised('00000000')])).toContain("Where it disagrees with the author's own words, those win");
  });

  it('should be null until the author has organised their notes', () => {
    expect(organisedTimelineText(docs, [brief])).toBeNull();
  });
});
