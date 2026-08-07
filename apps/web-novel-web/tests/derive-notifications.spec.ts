import { describe, expect, it } from 'vitest';

import { deriveNotifications } from '@/lib/apis/notifications.api';
import { type LibraryEntry, type NovelSummary, type ReadingProgress } from '@/lib/apis/types';
import { type DownloadedNovel } from '@/lib/offline/store';
import { DEFAULT_SETTINGS } from '@/lib/settings-store';

function novel(overrides: Partial<NovelSummary> = {}): NovelSummary {
  return {
    slug: 'clockwork-saint',
    title: 'Clockwork Saint',
    author: 'A. Wren',
    genres: ['Fantasy'],
    status: 'ongoing',
    rating: 4.6,
    ratingCount: 120,
    chapterCount: 342,
    synopsis: '',
    updatedAt: '2026-08-02T10:00:00.000Z',
    views: 900,
    cover: { from: '#312e81', to: '#1e1b4b' },
    ...overrides,
  };
}

function shelf(overrides: Partial<NovelSummary> = {}): LibraryEntry[] {
  return [{ novelSlug: 'clockwork-saint', addedAt: '2026-07-01T00:00:00.000Z', novel: novel(overrides) }];
}

function readAt(ordinal: number, updatedAt: string): Record<string, ReadingProgress> {
  return { 'clockwork-saint': { novelSlug: 'clockwork-saint', ordinal, position: 0, updatedAt } };
}

const DOWNLOAD: DownloadedNovel = {
  slug: 'starfall-requiem',
  title: 'Starfall Requiem',
  author: 'K. Vale',
  cover: { from: '#7c2d12', to: '#431407' },
  chapterCount: 200,
  ordinals: [120, 121, 122],
  downloadedAt: '2026-08-01T08:00:00.000Z',
};

const EMPTY = { library: [], progress: {}, downloads: [], settings: DEFAULT_SETTINGS, readIds: new Set<string>() };

describe('deriveNotifications', () => {
  it('should return nothing when the reader has no shelf, progress or downloads', () => {
    expect(deriveNotifications(EMPTY)).toEqual([]);
  });

  it('should report the chapters a shelved novel gained after the reader last opened it', () => {
    const items = deriveNotifications({ ...EMPTY, library: shelf(), progress: readAt(339, '2026-07-30T09:00:00.000Z') });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'chapter:clockwork-saint:342', type: 'chapter', novelSlug: 'clockwork-saint', read: false });
    expect(items[0]?.body).toContain('3 chapters');
  });

  it('should ignore a shelved novel the reader has never opened, since there is no "since" to report against', () => {
    expect(deriveNotifications({ ...EMPTY, library: shelf() })).toEqual([]);
  });

  it('should ignore a novel that has not moved since the last read, even with chapters left unread', () => {
    const items = deriveNotifications({ ...EMPTY, library: shelf({ updatedAt: '2026-07-01T00:00:00.000Z' }), progress: readAt(10, '2026-07-30T09:00:00.000Z') });

    expect(items).toEqual([]);
  });

  it('should ignore a library entry synced without a catalog snapshot rather than invent an update for it', () => {
    const items = deriveNotifications({ ...EMPTY, library: shelf({ chapterCount: 0, updatedAt: '2026-07-01T00:00:00.000Z' }), progress: readAt(5, '2026-06-01T00:00:00.000Z') });

    expect(items).toEqual([]);
  });

  it('should report chapters actually saved to this device', () => {
    const items = deriveNotifications({ ...EMPTY, downloads: [DOWNLOAD] });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'download:starfall-requiem:2026-08-01T08:00:00.000Z', type: 'download', novelSlug: 'starfall-requiem' });
    expect(items[0]?.body).toContain('3 chapters');
  });

  it('should carry read state from the persisted ids and sort the newest entry first', () => {
    const items = deriveNotifications({
      ...EMPTY,
      library: shelf(),
      progress: readAt(339, '2026-07-30T09:00:00.000Z'),
      downloads: [DOWNLOAD],
      readIds: new Set(['download:starfall-requiem:2026-08-01T08:00:00.000Z']),
    });

    expect(items.map(item => item.type)).toEqual(['chapter', 'download']);
    expect(items.map(item => item.read)).toEqual([false, true]);
  });

  it('should honor the per-type notification toggles', () => {
    const input = { ...EMPTY, library: shelf(), progress: readAt(339, '2026-07-30T09:00:00.000Z'), downloads: [DOWNLOAD] };

    expect(deriveNotifications({ ...input, settings: { ...DEFAULT_SETTINGS, notifyNewChapters: false } }).map(item => item.type)).toEqual(['download']);
    expect(deriveNotifications({ ...input, settings: { ...DEFAULT_SETTINGS, notifyDownloadComplete: false } }).map(item => item.type)).toEqual(['chapter']);
  });
});
