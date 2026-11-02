import { afterAll, describe, expect, it } from 'bun:test';
import { setConfig } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { CatalogService } from '@modules/catalog/catalog.service';
import { type NovelAccessService } from '@modules/catalog/novel-access.service';

import { roundTrips, scriptedPostgres } from '../scripted-postgres';

const restoreConfig = setConfig({ 'storage.public-origin': 'https://cdn.test' });
afterAll(restoreConfig);

const NOVEL = { slug: 'the-novel', title: 'The Novel', genres: [], tags: [], status: 'live', visibility: 'PUBLIC', updatedAt: new Date(0) };

describe('CatalogService', () => {
  describe('listNovels', () => {
    it('should count and page the public catalogue in one round trip', async () => {
      const postgres = scriptedPostgres([[{ value: 41 }], [{ novel: NOVEL, chapterCount: 3 }]]);
      const service = new CatalogService(new FakeDatabaseService({ postgres: postgres.client }), {} as NovelAccessService);

      const page = await service.listNovels({ limit: 1, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' });

      expect(page).toMatchObject({ total: 41, limit: 1, offset: 0, items: [{ slug: 'the-novel', chapterCount: 3 }] });
      expect(postgres.calls).toHaveLength(2);
      expect(roundTrips(postgres)).toBe(1);
    });
  });
});
