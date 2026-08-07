import { describe, expect, it } from 'vitest';

import { type LibraryEntry, type ReadingProgress, toLibraryEntry, toReadingProgress } from '@/lib/apis';

const LIBRARY_RESPONSE = {
  items: [
    {
      slug: 'omniscient-sovereigns',
      title: 'Omniscient Sovereigns',
      genres: ['Fantasy', 'System'],
      status: 'live' as const,
      visibility: 'PUBLIC' as const,
      addedAt: '2026-07-01T10:00:00.000Z',
    },
    {
      slug: 'starfall-requiem',
      title: 'Starfall Requiem',
      coverUrl: 'http://localhost:9000/wiki-assets/starfall.webp',
      genres: ['Sci-Fi'],
      status: 'retired' as const,
      visibility: 'PUBLIC' as const,
      addedAt: '2026-06-20T08:30:00.000Z',
    },
  ],
};

const PROGRESS_RESPONSE = {
  items: [
    { novelSlug: 'omniscient-sovereigns', ordinal: 42, position: 63, furthestOrdinal: 47, updatedAt: '2026-07-10T21:14:03.000Z' },
    { novelSlug: 'starfall-requiem', ordinal: 3, position: 0, furthestOrdinal: 3, updatedAt: '2026-07-02T09:00:00.000Z' },
  ],
};

describe('toLibraryEntry', () => {
  it('should normalize a lean server shelf item into the internal LibraryEntry model', () => {
    const entry = toLibraryEntry(LIBRARY_RESPONSE.items[0]!);
    expect(entry.novelSlug).toBe('omniscient-sovereigns');
    expect(entry.addedAt).toBe('2026-07-01T10:00:00.000Z');
    expect(entry.novel).toMatchObject({
      slug: 'omniscient-sovereigns',
      title: 'Omniscient Sovereigns',
      genres: ['Fantasy', 'System'],
      status: 'ongoing',
      author: 'Unknown author',
    });
    expect(entry.novel.cover.from).toMatch(/^#/);
  });

  it('should map the server retired status to the internal completed status', () => {
    expect(toLibraryEntry(LIBRARY_RESPONSE.items[1]!).novel.status).toBe('completed');
  });

  it('should carry the resolved coverUrl onto the cover as imageUrl', () => {
    expect(toLibraryEntry(LIBRARY_RESPONSE.items[1]!).novel.cover.imageUrl).toBe('http://localhost:9000/wiki-assets/starfall.webp');
  });

  it('should leave imageUrl unset when the server has no cover for the novel', () => {
    expect(toLibraryEntry(LIBRARY_RESPONSE.items[0]!).novel.cover.imageUrl).toBeUndefined();
  });

  it('should keep the richer local catalog snapshot while taking the server addedAt', () => {
    const local: LibraryEntry = {
      novelSlug: 'omniscient-sovereigns',
      addedAt: '2026-06-01T00:00:00.000Z',
      novel: {
        slug: 'omniscient-sovereigns',
        title: 'Omniscient Sovereigns',
        author: 'Shadow Novelist',
        genres: ['Fantasy', 'System', 'Romance'],
        status: 'ongoing',
        rating: 4.8,
        ratingCount: 31204,
        chapterCount: 12438,
        synopsis: 'When the Seal shatters…',
        updatedAt: '2026-07-01T08:00:00.000Z',
        views: 2840000,
        cover: { from: '#6366f1', to: '#312e81' },
      },
    };
    const entry = toLibraryEntry(LIBRARY_RESPONSE.items[0]!, local);
    expect(entry.novel).toBe(local.novel);
    expect(entry.addedAt).toBe('2026-07-01T10:00:00.000Z');
  });
});

describe('toReadingProgress', () => {
  it('should map a wrapped progress item onto the internal ReadingProgress model', () => {
    const entries = PROGRESS_RESPONSE.items.map(toReadingProgress);
    expect(entries[0]).toEqual<ReadingProgress>({ novelSlug: 'omniscient-sovereigns', ordinal: 42, position: 63, updatedAt: '2026-07-10T21:14:03.000Z' });
    expect(entries[1]?.position).toBe(0);
  });

  it('should drop unknown server fields so they never reach the localStorage mirror', () => {
    const item = { ...PROGRESS_RESPONSE.items[0]!, id: 'prg_01' };
    expect(Object.keys(toReadingProgress(item)).sort()).toEqual(['novelSlug', 'ordinal', 'position', 'updatedAt']);
  });
});
