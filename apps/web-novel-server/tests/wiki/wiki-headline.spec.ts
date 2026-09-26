import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { type AuthPrincipal } from '@shadow-library/auth';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { type CatalogService } from '@modules/catalog';
import { schema } from '@modules/datastore';
import { WikiService } from '@modules/wiki';
import { listThumbnailRef, visibleHeadlineRef } from '@modules/wiki/wiki-headline';

import { scriptedPostgres, type ScriptedPostgres } from '../scripted-postgres';

const READER = { kind: 'user', sub: 'reader-1' } as AuthPrincipal;
const NOVEL = { id: 7n, visibility: 'public', accessRevision: 1 };
const STATS = [{ locked: 0, maxRevision: 1 }];

const catalog = {
  getReadableNovel: () => Promise.resolve(NOVEL),
  imageUrl: (ref: string | null | undefined) => (ref ? `https://cdn.test/${ref}` : undefined),
} as unknown as CatalogService;

function service(postgres: ScriptedPostgres): WikiService {
  return new WikiService(new FakeDatabaseService({ postgres: postgres.client }), catalog);
}

function selectCount(postgres: ScriptedPostgres): number {
  return postgres.calls.filter(call => call.root === 'select').length;
}

const crowned = { imageRef: 'crowned.png', sortOrder: 0, visibleFromOrdinal: 50 };
const young = { imageRef: 'young.png', sortOrder: 1, visibleFromOrdinal: 1 };
const chapterFifty = { imageRef: 'scarred.png', imageVisibleFromOrdinal: 50 };

describe('visibleHeadlineRef', () => {
  it('should hide a chapter-50 headline from a chapter-1 reader and show it at chapter 50', () => {
    expect(visibleHeadlineRef(chapterFifty, 1)).toBeNull();
    expect(visibleHeadlineRef(chapterFifty, 50)).toBe('scarred.png');
  });

  it('should show an ungated legacy headline at any gate', () => {
    expect(visibleHeadlineRef({ imageRef: 'legacy.png', imageVisibleFromOrdinal: null }, 0)).toBe('legacy.png');
  });
});

describe('listThumbnailRef', () => {
  it('should fall back to the latest gallery image the reader has reached', () => {
    const older = { imageRef: 'child.png', sortOrder: 2, visibleFromOrdinal: 0 };
    expect(listThumbnailRef(chapterFifty, [older, young, crowned], 10)).toBe('young.png');
  });

  it('should break a fallback tie by gallery order', () => {
    const twin = { imageRef: 'twin.png', sortOrder: 0, visibleFromOrdinal: 1 };
    expect(listThumbnailRef(chapterFifty, [young, twin], 10)).toBe('twin.png');
  });

  it('should never fall back for an entry without a headline gate', () => {
    expect(listThumbnailRef({ imageRef: null, imageVisibleFromOrdinal: null }, [young], 10)).toBeNull();
  });
});

describe('WikiService', () => {
  const entryRow = { id: 1n, entryKey: 'amara', type: 'character', name: 'Amara', ...chapterFifty };
  const maskedRow = { ...entryRow, imageRef: null };

  describe('the SQL headline mask', () => {
    function entrySelects(postgres: ScriptedPostgres): Record<string, unknown>[] {
      return postgres.calls.map(call => call.args[0] as Record<string, unknown> | undefined).filter((fields): fields is Record<string, unknown> => !!fields?.entryKey);
    }

    it('should expose the gated headline column only through a mask that opens at the gate, on both pages', async () => {
      const list = scriptedPostgres([[{ furthest: 1 }], [maskedRow], [], STATS]);
      const entry = scriptedPostgres([[{ furthest: 1 }], [{ ...maskedRow, revision: 1 }], [], [{ value: 0 }], []]);
      await service(list).listEntries('novel', READER);
      await service(entry).getEntry('novel', 'amara', READER);

      for (const fields of [...entrySelects(list), ...entrySelects(entry)]) {
        expect(Object.values(fields)).not.toContain(schema.wikiEntries.gatedImageRef);
        const query = new PgDialect().sqlToQuery(fields.imageRef as SQL);
        expect(query.sql).toBe('coalesce("wiki_entries"."image_ref", case when "wiki_entries"."image_visible_from_ordinal" <= $1 then "wiki_entries"."gated_image_ref" end)');
        expect(query.params).toEqual([1]);
      }
    });

    it('should serve no headline on either page when the masked query returns none', async () => {
      const list = await service(scriptedPostgres([[{ furthest: 1 }], [maskedRow], [], STATS])).listEntries('novel', READER);
      const entry = await service(scriptedPostgres([[{ furthest: 1 }], [{ ...maskedRow, revision: 1 }], [], [{ value: 0 }], []])).getEntry('novel', 'amara', READER);

      expect(list.body.items[0]?.imageUrl).toBeUndefined();
      expect(entry.body.imageUrl).toBeUndefined();
    });
  });

  // These rows carry the headline unmasked, as if SQL had not masked it, so they exercise the JavaScript gate on its own.
  describe('the JavaScript headline gate', () => {
    describe('listEntries', () => {
      it('should give a chapter-1 reader the latest visible gallery image instead of a chapter-50 headline', async () => {
        const read = await service(scriptedPostgres([[{ furthest: 1 }], [entryRow], [{ entryId: 1n, ...young }], STATS])).listEntries('novel', READER);

        expect(read.body.items).toEqual([{ entryKey: 'amara', type: 'character', name: 'Amara', imageUrl: 'https://cdn.test/young.png' }]);
      });

      it('should give a chapter-50 reader the headline without querying for a fallback', async () => {
        const postgres = scriptedPostgres([[{ furthest: 50 }], [entryRow], STATS]);
        const read = await service(postgres).listEntries('novel', READER);

        expect(read.body.items[0]?.imageUrl).toBe('https://cdn.test/scarred.png');
        expect(selectCount(postgres)).toBe(3);
      });

      it('should not query for a fallback when no headline is gated', async () => {
        const postgres = scriptedPostgres([[{ furthest: 1 }], [{ ...entryRow, imageVisibleFromOrdinal: null }], STATS]);
        const read = await service(postgres).listEntries('novel', READER);

        expect(read.body.items[0]?.imageUrl).toBe('https://cdn.test/scarred.png');
        expect(selectCount(postgres)).toBe(3);
      });

      it('should leave a chapter-1 reader without a thumbnail when no gallery image is visible yet', async () => {
        const postgres = scriptedPostgres([[{ furthest: 1 }], [entryRow], [], STATS]);
        const read = await service(postgres).listEntries('novel', READER);

        expect(read.body.items[0]?.imageUrl).toBeUndefined();
        expect(selectCount(postgres)).toBe(4);
      });
    });

    describe('getEntry', () => {
      const detailRow = { ...entryRow, revision: 1 };

      it('should hide a chapter-50 headline from a chapter-1 reader, without falling back to the gallery, and show it at chapter 50', async () => {
        const early = await service(scriptedPostgres([[{ furthest: 1 }], [detailRow], [], [{ value: 0 }], [{ ...young, caption: null }]])).getEntry('novel', 'amara', READER);
        const caughtUp = await service(scriptedPostgres([[{ furthest: 50 }], [detailRow], [], [{ value: 0 }], [{ ...crowned, caption: null }]])).getEntry('novel', 'amara', READER);

        expect(early.body.imageUrl).toBeUndefined();
        expect(early.body.images.map(image => image.imageUrl)).toEqual(['https://cdn.test/young.png']);
        expect(caughtUp.body.imageUrl).toBe('https://cdn.test/scarred.png');
      });
    });
  });
});
