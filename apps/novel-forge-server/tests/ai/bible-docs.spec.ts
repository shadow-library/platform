import { describe, expect, it } from 'bun:test';

import { bibleDocExcerpt, bibleDocLabel, type BibleDocRow, clipAtBoundary, rankBibleDocs, renderBibleDigest } from '@modules/ai/context/bible-docs';
import { countTokens } from '@modules/ai/context/token-budget';

const paragraphs = (subject: string, count: number): string =>
  Array.from({ length: count }, (_, i) => `Paragraph ${i}. ${`${subject} is measured by the lock gauge at every change of the tide. `.repeat(10)}`).join('\n\n');

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

describe('renderBibleDigest', () => {
  it('should keep every short document whole and skip empty ones', () => {
    const digest = renderBibleDigest([doc('world', 'canal', 'CANAL_MARKER The canal runs north.'), doc('plot', 'blank', '   \n  '), doc('plot', 'none', null)], {
      totalTokens: 2_000,
      perDocTokens: 1_000,
    });
    expect(digest.text).toContain('### bible_doc:world/canal — Canal\nCANAL_MARKER The canal runs north.');
    expect(digest.text).not.toContain('blank');
    expect(digest.truncated).toEqual([]);
    expect(digest.omitted).toEqual([]);
  });

  it('should stay within its budget, cutting long documents and handing a short one’s unused share to the rest', () => {
    const docs = [doc('world', 'short', 'SHORT_MARKER One line.'), doc('plot', 'long-a', paragraphs('The ferry', 30)), doc('power', 'long-b', paragraphs('The gauge', 30))];
    const digest = renderBibleDigest(docs, { totalTokens: 3_000, perDocTokens: 2_500 });

    expect(countTokens(digest.text)).toBeLessThanOrEqual(3_000);
    expect(countTokens(digest.text)).toBeGreaterThan(2_500);
    expect(digest.text).toContain('SHORT_MARKER');
    expect(digest.truncated.sort()).toEqual(['bible_doc:plot/long-a', 'bible_doc:power/long-b']);
    expect(digest.text).toContain('[…cut to fit]');
  });

  it('should drop the lowest-priority documents rather than shrink every document below a readable size', () => {
    const docs = Array.from({ length: 12 }, (_, i) => doc('world', `place-${String(i).padStart(2, '0')}`, paragraphs(`Place ${i}`, 10)));
    const digest = renderBibleDigest([...docs, doc('project', 'premise', paragraphs('The premise', 10))], { totalTokens: 1_500, perDocTokens: 1_000 });

    expect(digest.text.startsWith('### bible_doc:project/premise')).toBe(true);
    expect(digest.omitted.length).toBeGreaterThan(0);
    expect(digest.omitted.at(-1)).toBe('bible_doc:world/place-11');
    expect(countTokens(digest.text)).toBeLessThanOrEqual(1_500);
  });

  it('should leave out every non-core document when asked for the core only', () => {
    const digest = renderBibleDigest([doc('lore', 'songs', 'LORE_MARKER'), doc('world', 'canal', 'WORLD_MARKER')], { totalTokens: 2_000, perDocTokens: 1_000, coreOnly: true });
    expect(digest.text).toContain('WORLD_MARKER');
    expect(digest.text).not.toContain('LORE_MARKER');
  });

  it('should give non-core documents only what the core documents leave', () => {
    const digest = renderBibleDigest([doc('lore', 'songs', paragraphs('The song', 30)), doc('plot', 'main-line', paragraphs('The plot', 30))], {
      totalTokens: 2_000,
      perDocTokens: 1_800,
    });
    const plotAt = digest.text.indexOf('bible_doc:plot/main-line');
    const loreAt = digest.text.indexOf('bible_doc:lore/songs');
    expect(plotAt).toBe(4);
    expect(loreAt === -1 || countTokens(digest.text.slice(loreAt)) < countTokens(digest.text.slice(plotAt, loreAt))).toBe(true);
  });
});
