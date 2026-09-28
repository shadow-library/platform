import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { AuthErrorCode } from '@shadow-library/auth';

import { type ListProjectsQuery } from '@modules/project/project/project.dto';
import { ProjectService } from '@modules/project/project/project.service';
import { ownedBy } from '@server/common';
import { schema } from '@server/database';

const ACTOR = { kind: 'user' as const, id: 3n, organisationId: 7n };
const dialect = new PgDialect();
const FIRST_PAGE = { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' } as ListProjectsQuery;
const rendered = (condition: SQL | undefined): string => (condition ? dialect.sqlToQuery(condition).sql : '');

function makeService(check: () => Promise<boolean>): { service: ProjectService; filters: SQL[] } {
  const filters: SQL[] = [];
  const db = {
    $count: async () => 0,
    query: { projects: { findMany: async ({ where }: { where: SQL }) => (filters.push(where), []) } },
  };
  const actors = { current: () => ACTOR } as never;
  const context = { getAuthPrincipal: () => ({ kind: 'user', sub: '3', org: '7' }) } as never;
  const service = new ProjectService({ getPostgresClient: () => db } as never, actors, {} as never, { check } as never, context, {} as never);
  return { service, filters };
}

describe('ProjectService.list — visibility', () => {
  const ownOnly = rendered(ownedBy(schema.projects, ACTOR));

  it('should degrade to the caller’s own projects while the pdp is throttled, rather than failing the list', async () => {
    const { service, filters } = makeService(() => Promise.reject(AuthErrorCode.PDP_UNAVAILABLE.create({ reason: 'identity throttled the check', throttled: true })));

    await expect(service.list(FIRST_PAGE)).resolves.toMatchObject({ items: [] });
    expect(rendered(filters[0])).toBe(ownOnly);
  });

  it('should widen to the organisation’s shared projects for a curator', async () => {
    const { service, filters } = makeService(() => Promise.resolve(true));

    await service.list(FIRST_PAGE);
    expect(rendered(filters[0])).not.toBe(ownOnly);
    expect(rendered(filters[0])).toContain('shared_with_org');
  });

  it('should not swallow a failure that is not the pdp being unavailable', async () => {
    const { service } = makeService(() => Promise.reject(new TypeError('boom')));
    await expect(service.list(FIRST_PAGE)).rejects.toThrow('boom');
  });
});
