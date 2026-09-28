import { describe, expect, it } from 'bun:test';

import { type Publishing } from '@server/database';

import { PublicationAccessService } from '@modules/publishing/publication-access.service';
import { PublishingService } from '@modules/publishing/publishing.service';

import { type RecordedQuery, recordingDb } from '../recording-db';

const PUBLICATION = {
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
  accessRevision: 5,
  accessPushedRevision: 5,
  accessError: null,
  revision: 3,
  publishToken: 'token',
  createdAt: new Date(2024, 0, 1),
  updatedAt: new Date(2024, 0, 1),
} as Publishing.Publication;

const HELD_GRANT = { publicationId: 5n, email: 'kept@example.test', subjectId: 'subject-kept', state: 'resolved' };

function accessService() {
  const { db, queries } = recordingDb((query: RecordedQuery) => {
    if (query.sql.includes(' for update')) return [PUBLICATION];
    if (query.sql.startsWith('select') && query.sql.includes('from "publication_grants"')) return [HELD_GRANT];
    return [];
  });
  const publishing = { getPublication: async () => PUBLICATION };
  const authClient = {
    resolveUsersByEmail: async (emails: string[]) => emails.map(email => ({ email, userId: email === HELD_GRANT.email ? HELD_GRANT.subjectId : `subject-${email}` })),
  };
  const service = new PublicationAccessService({ getPostgresClient: () => db } as never, publishing as never, authClient as never);
  return { service, queries };
}

const publicationUpdate = (queries: RecordedQuery[]) => queries.find(query => query.sql.startsWith('update "publications"'));

describe('PublicationAccessService.setAccess', () => {
  it('should lock the publication before it reads the grants it compares against', async () => {
    const { service, queries } = accessService();

    await service.setAccess(1n, { visibility: 'RESTRICTED', grants: [{ email: HELD_GRANT.email }] } as never, undefined);

    const lock = queries.findIndex(query => query.sql.startsWith('select') && query.sql.includes('from "publications"') && query.sql.endsWith(' for update'));
    const grantsRead = queries.findIndex(query => query.sql.startsWith('select') && query.sql.includes('from "publication_grants"'));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(grantsRead).toBeGreaterThan(lock);
  });

  it('should bump the access revision as an increment of the stored one when the share list changed', async () => {
    const { service, queries } = accessService();

    await service.setAccess(1n, { visibility: 'RESTRICTED', grants: [{ email: HELD_GRANT.email }, { email: 'added@example.test' }] } as never, undefined);

    expect(publicationUpdate(queries)?.sql).toContain('"access_revision" = "publications"."access_revision" + 1');
  });

  it('should leave the access revision unwritten when nothing changed', async () => {
    const { service, queries } = accessService();

    await service.setAccess(1n, { visibility: 'RESTRICTED', grants: [{ email: HELD_GRANT.email }] } as never, undefined);

    expect(publicationUpdate(queries)?.sql).not.toContain('"access_revision"');
  });
});

describe('PublishingService.publishNovel', () => {
  it('should bump the metadata revision as an increment of the stored one', async () => {
    const { db, queries } = recordingDb(() => [PUBLICATION], { projects: { findFirst: { id: 1n, title: 'Low Water' } }, publications: { findFirst: PUBLICATION } });
    const service = new PublishingService({ getPostgresClient: () => db, run: (work: () => unknown) => work() } as never, {} as never, {} as never);

    await service.publishNovel(1n, { title: 'High Water' } as never);

    expect(publicationUpdate(queries)?.sql).toContain('"revision" = "publications"."revision" + 1');
  });
});
