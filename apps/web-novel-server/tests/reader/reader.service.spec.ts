import { describe, expect, it } from 'bun:test';
import { type AuthPrincipal } from '@shadow-library/auth';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { type CatalogService } from '@modules/catalog/catalog.service';
import { type AccessSubject, type NovelAccessService } from '@modules/catalog/novel-access.service';
import { ReaderService } from '@modules/reader/reader.service';

import { roundTrips, scriptedPostgres } from '../scripted-postgres';

const READER = { kind: 'user', sub: 'reader-1' } as AuthPrincipal;

function novel(id: bigint, visibility: string, updatedAt: number): Record<string, unknown> {
  return {
    id,
    slug: `novel-${id}`,
    title: `Novel ${id}`,
    genres: [],
    status: 'live',
    visibility,
    organisationId: visibility === 'ORGANISATION' ? 'org-1' : null,
    updatedAt: new Date(updatedAt),
  };
}

describe('ReaderService', () => {
  describe('listShared', () => {
    it('should read granted and organisation-shared novels in one round trip and list the readable ones newest first', async () => {
      const postgres = scriptedPostgres([[{ novel: novel(1n, 'RESTRICTED', 1) }], [{ novel: novel(2n, 'ORGANISATION', 2) }, { novel: novel(3n, 'ORGANISATION', 3) }]]);
      const access = { readableIds: (subjects: AccessSubject[]) => Promise.resolve(new Set(subjects.map(subject => subject.id).filter(id => id !== 3n))) };
      const catalog = { imageUrl: () => undefined } as unknown as CatalogService;
      const service = new ReaderService(new FakeDatabaseService({ postgres: postgres.client }), catalog, access as unknown as NovelAccessService);

      const shelf = await service.listShared(READER);

      expect(shelf.map(item => item.slug)).toEqual(['novel-2', 'novel-1']);
      expect(roundTrips(postgres)).toBe(1);
    });
  });
});
