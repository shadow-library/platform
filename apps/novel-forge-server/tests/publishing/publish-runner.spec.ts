import { describe, expect, it } from 'bun:test';

import { type Publishing } from '@server/database';

import { type PublicationAccessService } from '@modules/publishing/publication-access.service';
import { PublishRunner } from '@modules/publishing/publish-runner';
import { type PublishingService } from '@modules/publishing/publishing.service';
import { type AccessPushBody, type ReaderPushClient, ReaderPushError, SlugConflictError, StaleRevisionError, UnknownConflictError } from '@modules/publishing/reader-push.client';
import { type WikiPublishingService } from '@modules/publishing/wiki-publishing.service';

type Row = Record<string, unknown>;

function publicationRow(overrides: Partial<Publishing.Publication> = {}): Publishing.Publication {
  return {
    id: 5n,
    projectId: 1n,
    novelSlug: 'low-water',
    title: 'Low Water',
    originalAuthor: null,
    blurb: null,
    coverPath: null,
    genres: null,
    tags: null,
    sexualContent: null,
    violence: null,
    darkContent: null,
    status: 'live',
    visibility: 'RESTRICTED',
    organisationId: null,
    accessRevision: 2,
    revision: 1,
    publishToken: 'token',
    createdAt: new Date(2024, 0, 1),
    updatedAt: new Date(2024, 0, 1),
    ...overrides,
  } as Publishing.Publication;
}

interface ReaderFake {
  upsertNovel?: () => Promise<{ outcome: 'applied' | 'noop' }>;
  upsertAccess?: (body: AccessPushBody) => Promise<{ outcome: 'applied' | 'noop' }>;
}

function runner(publication: Publishing.Publication, reader: ReaderFake = {}) {
  const updates: Row[] = [];
  const db = {
    query: { publications: { findFirst: async () => publication } },
    update: () => ({ set: (patch: Row) => ({ where: async () => void updates.push(patch) }) }),
  };
  const pushed: AccessPushBody[] = [];
  const pushClient = {
    upsertNovel: async () => (reader.upsertNovel ? reader.upsertNovel() : { outcome: 'noop' }),
    getAccess: async () => ({ visibility: 'RESTRICTED', subjectIds: ['someone-else'], revision: 1 }),
    upsertAccess: async (_slug: string, body: AccessPushBody) => {
      pushed.push(body);
      return reader.upsertAccess ? reader.upsertAccess(body) : { outcome: 'applied' };
    },
    getManifest: async () => [],
    getWikiManifest: async () => ({ items: [], headlineGate: false }),
  };
  const publishingService = {
    getPublication: async () => publication,
    loadLedger: async () => [],
    ensurePublishToken: async () => 'token',
    reassignSlug: async () => undefined,
    restoreSlug: async () => undefined,
  };
  const accessService = { getPushPayload: async () => ['reader-1'] };
  const wikiService = { computeProjections: async () => [], reconcileLedger: async () => [] };
  const instance = new PublishRunner(
    { getPostgresClient: () => db } as never,
    publishingService as unknown as PublishingService,
    pushClient as unknown as ReaderPushClient,
    accessService as unknown as PublicationAccessService,
    wikiService as unknown as WikiPublishingService,
  );
  return { runner: instance, pushed, updates };
}

describe('PublishRunner.converge', () => {
  it('should answer an access push the reader refuses as stale with a 409 conflict', async () => {
    const { runner: publish } = runner(publicationRow(), { upsertAccess: () => Promise.reject(new StaleRevisionError(2)) });

    await expect(publish.converge(1n, { reconcile: true })).rejects.toMatchObject({ code: 'PUB_011', status: 409 });
  });

  it('should answer a conflict the reader attributed to no code with a 409 conflict', async () => {
    const { runner: publish } = runner(publicationRow(), { upsertAccess: () => Promise.reject(new UnknownConflictError('low-water', 2)) });

    await expect(publish.converge(1n, { reconcile: true })).rejects.toMatchObject({ code: 'PUB_011', status: 409 });
  });

  it('should answer a slug the reader refuses with no re-assignment left with a 409 conflict', async () => {
    const { runner: publish } = runner(publicationRow(), { upsertNovel: () => Promise.reject(new SlugConflictError('low-water')) });

    await expect(publish.converge(1n)).rejects.toMatchObject({ code: 'PUB_008', status: 409 });
  });

  it('should keep answering a reader outage with PUB_004', async () => {
    const { runner: publish } = runner(publicationRow(), { upsertAccess: () => Promise.reject(new ReaderPushError('reader service unreachable: connect ECONNREFUSED')) });

    await expect(publish.converge(1n, { reconcile: true })).rejects.toMatchObject({ code: 'PUB_004', status: 500 });
  });
});
