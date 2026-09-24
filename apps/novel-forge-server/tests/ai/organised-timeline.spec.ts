import { describe, expect, it } from 'bun:test';
import { textDigest } from '@shadow-library/sdk';

import { type BibleDocRow } from '@modules/ai/context/bible-docs';
import { organisedTimelineState, planningBibleText } from '@modules/ai/context/organised-timeline';

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

describe('planningBibleText', () => {
  it('should give a whole-book planner the timeline whole and first, and keep it out of the digest a budget may cut', () => {
    const seen: string[] = [];
    const text = planningBibleText(docs, [brief, organised(textDigest(NOTES))], rest => {
      seen.push(...rest.map(doc => doc.slug));
      return '### world/river — River\nThe river runs east.';
    });

    expect(seen).toEqual(['river']);
    expect(text.startsWith("### project/timeline — the author's organised timeline")).toBe(true);
    expect(text.indexOf('takes the throne')).toBeLessThan(text.indexOf('The river runs east.'));
    expect(text).toContain('this timeline wins');
  });

  it('should leave a page at that address to the digest, like any other, until the author has organised their notes', () => {
    const text = planningBibleText(docs, [brief], rest => rest.map(doc => doc.slug).join(','));
    expect(text).toBe('timeline,river');
  });
});
