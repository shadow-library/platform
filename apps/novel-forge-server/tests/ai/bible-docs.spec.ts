import { describe, expect, it } from 'bun:test';

import { bibleDocExcerpt, bibleDocLabel, type BibleDocRow, clipAtBoundary, rankBibleDocs } from '@modules/ai/context/bible-docs';

function doc(section: BibleDocRow['section'], slug: string, body: string | null, frontmatter: Record<string, unknown> | null = null): BibleDocRow {
  return { section, slug, body, frontmatter };
}

describe('clipAtBoundary', () => {
  it('should return short text unchanged with its whitespace collapsed', () => {
    expect(clipAtBoundary('A lock\nkeeper   waits.', 80)).toBe('A lock keeper waits.');
  });

  it('should cut at the last sentence end when one falls in the back half of the window', () => {
    const text = 'The canal freezes every winter. Barges wait at the upper lock until the thaw, and the keepers charge double.';
    expect(clipAtBoundary(text, 60)).toBe('The canal freezes every winter.');
  });

  it('should cut at a word boundary and never mid-word when no sentence ends in time', () => {
    const text = 'Keepers inherit their locks through the maternal line and guard the gauges jealously against every rival';
    const clipped = clipAtBoundary(text, 50);
    expect(clipped.endsWith('…')).toBe(true);
    expect(text.startsWith(clipped.slice(0, -1))).toBe(true);
    expect(text.charAt(clipped.length - 1)).toBe(' ');
  });

  it('should cut unspaced text at a sentence or clause mark', () => {
    expect(clipAtBoundary('运河每年冬天结冰。驳船在上游船闸等待解冻，闸门看守收双倍的费用。', 12)).toBe('运河每年冬天结冰。');
    expect(clipAtBoundary('运河每年冬天结冰。驳船在上游船闸等待解冻，闸门看守收双倍的费用。', 24)).toBe('运河每年冬天结冰。驳船在上游船闸等待解冻…');
  });
});

describe('bible document labels', () => {
  it('should prefer the frontmatter title, then the first top-level heading, then the humanised slug', () => {
    expect(bibleDocLabel(doc('world', 'lock-law', '# Heading Title\nBody.', { title: 'Frontmatter Title' }))).toBe('Frontmatter Title');
    expect(bibleDocLabel(doc('world', 'lock-law', '## Minor\n# Heading Title\nBody.'))).toBe('Heading Title');
    expect(bibleDocLabel(doc('world', 'lock-law', 'Body only.'))).toBe('Lock law');
    expect(bibleDocLabel(doc('world', 'lock-law', 'Body only.', { title: 42 }))).toBe('Lock law');
  });

  it('should excerpt the first prose paragraph without markdown markers', () => {
    const body = '# Lock Law\n\n**Every** barge pays at the [upper lock](#upper).\n\nSecond paragraph.';
    expect(bibleDocExcerpt(doc('world', 'lock-law', body), 160)).toBe('Every barge pays at the upper lock.');
  });
});

describe('rankBibleDocs', () => {
  it('should put premise and reader promise first, then plot, world and power, then the other sections', () => {
    const ranked = rankBibleDocs([
      doc('ai', 'drafting', 'x'),
      doc('world', 'canal', 'x'),
      doc('project', 'art-style', 'x'),
      doc('power', 'gauges', 'x'),
      doc('project', 'reader-promise', 'x'),
      doc('lore', 'songs', 'x'),
      doc('plot', 'main-line', 'x'),
      doc('project', 'premise', 'x'),
    ]);
    expect(ranked.map(d => `${d.section}/${d.slug}`)).toEqual([
      'project/premise',
      'project/reader-promise',
      'plot/main-line',
      'world/canal',
      'power/gauges',
      'project/art-style',
      'lore/songs',
      'ai/drafting',
    ]);
  });
});
