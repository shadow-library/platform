/**
 * Importing npm packages
 */
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { FIXTURE_NOVELS, fixtureCatalog, fixtureChapter, fixtureChapterList } from '@/lib/apis/fixtures';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
describe('fixture API layer', () => {
  it('should return the full catalog with genres for an empty query', () => {
    const catalog = fixtureCatalog({});
    expect(catalog.total).toBe(FIXTURE_NOVELS.length);
    expect(catalog.items.length).toBeGreaterThan(0);
    expect(catalog.genres).toContain('Fantasy');
  });

  it('should filter by genre, status, and search term', () => {
    const byGenre = fixtureCatalog({ genre: 'Horror' });
    expect(byGenre.items.every(novel => novel.genres.includes('Horror'))).toBe(true);

    const byStatus = fixtureCatalog({ status: 'completed' });
    expect(byStatus.items.every(novel => novel.status === 'completed')).toBe(true);

    const byTerm = fixtureCatalog({ q: 'sovereigns' });
    expect(byTerm.items.some(novel => novel.slug === 'omniscient-sovereigns')).toBe(true);
  });

  it('should sort by rating descending when requested', () => {
    const catalog = fixtureCatalog({ sort: 'rating' });
    const ratings = catalog.items.map(novel => novel.rating);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });

  it('should paginate the chapter list with stable metadata', () => {
    const list = fixtureChapterList('omniscient-sovereigns', 2, 100);
    expect(list).toBeDefined();
    expect(list?.items[0]?.ordinal).toBe(101);
    expect(list?.items).toHaveLength(100);
  });

  it('should generate deterministic chapter content with prev/next links', () => {
    const first = fixtureChapter('omniscient-sovereigns', 5);
    const second = fixtureChapter('omniscient-sovereigns', 5);
    expect(first).toEqual(second);
    expect(first?.previousOrdinal).toBe(4);
    expect(first?.nextOrdinal).toBe(6);
    expect(first?.paragraphs.length).toBeGreaterThan(5);
    expect(first?.contentHash).toMatch(/^fx-/);
  });

  it('should refuse chapters outside the novel range', () => {
    expect(fixtureChapter('omniscient-sovereigns', 0)).toBeUndefined();
    expect(fixtureChapter('missing-novel', 1)).toBeUndefined();
  });
});
