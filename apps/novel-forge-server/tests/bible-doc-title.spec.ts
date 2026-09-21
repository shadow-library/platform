import { describe, expect, it } from 'bun:test';

import { deriveBibleDocTitle, ensureBibleDocTitle } from '@server/common';

describe('deriveBibleDocTitle', () => {
  it('should prefer the frontmatter title', () => {
    expect(deriveBibleDocTitle({ slug: 'lock-law', frontmatter: { title: 'Frontmatter Title' }, body: '# Heading\nBody.' })).toBe('Frontmatter Title');
  });

  it('should fall back to the first top-level heading', () => {
    expect(deriveBibleDocTitle({ slug: 'lock-law', body: '## Minor\n# Heading Title\nBody.' })).toBe('Heading Title');
  });

  it('should fall back to the humanised slug when there is no title or heading', () => {
    expect(deriveBibleDocTitle({ slug: 'lock-law', body: 'Body only.' })).toBe('Lock law');
    expect(deriveBibleDocTitle({ slug: 'lock-law', body: null })).toBe('Lock law');
  });

  it('should ignore a non-string or blank frontmatter title', () => {
    expect(deriveBibleDocTitle({ slug: 'lock-law', frontmatter: { title: 42 }, body: 'Body only.' })).toBe('Lock law');
    expect(deriveBibleDocTitle({ slug: 'lock-law', frontmatter: { title: '   ' }, body: '# Heading\nBody.' })).toBe('Heading');
  });
});

describe('ensureBibleDocTitle', () => {
  it('should leave an author-set title untouched', () => {
    const frontmatter = { title: 'Kept Title', tags: ['a'] };
    expect(ensureBibleDocTitle({ slug: 'lock-law', frontmatter, body: '# Different Heading' })).toBe(frontmatter);
  });

  it('should fold the derived title into frontmatter when one is missing', () => {
    expect(ensureBibleDocTitle({ slug: 'lock-law', frontmatter: { tags: ['a'] }, body: '# Heading Title' })).toEqual({ tags: ['a'], title: 'Heading Title' });
  });

  it('should create frontmatter from scratch when there is none at all', () => {
    expect(ensureBibleDocTitle({ slug: 'lock-law', frontmatter: null, body: null })).toEqual({ title: 'Lock law' });
    expect(ensureBibleDocTitle({ slug: 'lock-law' })).toEqual({ title: 'Lock law' });
  });
});
