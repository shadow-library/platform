import { describe, expect, it, mock } from 'bun:test';

import { PgDialect } from 'drizzle-orm/pg-core';
import { type SQL } from 'drizzle-orm';
import { ClassSchema } from '@shadow-library/class-schema';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { ACCESS_METADATA } from '@server/modules/access/access.decorator';
import { DirectoryController, DirectoryUserItem } from '@server/modules/identity/directory';
import { DirectoryService } from '@server/modules/identity/directory/directory.service';
import { schema } from '@server/modules/infrastructure/datastore';

interface LookupRow {
  userId: bigint;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
}

function lookupOver(rows: LookupRow[]) {
  const joins: { table: unknown; condition: SQL }[] = [];
  const query = {
    from: () => query,
    innerJoin: (table: unknown, condition: SQL) => (joins.push({ table, condition }), query),
    leftJoin: () => query,
    where: () => Promise.resolve(rows),
  };
  const select = mock(() => query);
  const record = mock(() => Promise.resolve());
  const service = new DirectoryService(new FakeDatabaseService({ postgres: { select } }), { record } as never);
  return { service, select, record, joins };
}

function classAccessOf(target: object): unknown {
  for (const key of Reflect.getMetadataKeys(target)) {
    const metadata = Reflect.getMetadata(key, target) as Record<string, unknown> | undefined;
    if (metadata && ACCESS_METADATA in metadata) return metadata[ACCESS_METADATA];
  }
  return undefined;
}

describe('DirectoryController', () => {
  it('should admit only service tokens holding users:resolve', () => {
    expect(classAccessOf(DirectoryController)).toEqual({ service: 'users:resolve' });
  });

  it('should answer a lookup with names only, never an address', () => {
    const properties = Object.keys(ClassSchema.generate(DirectoryUserItem).properties ?? {});

    expect(properties.sort()).toEqual(['displayName', 'firstName', 'lastName', 'userId']);
  });
});

describe('DirectoryService.lookupByUserId', () => {
  it('should name the users found, leave out the ids it does not find, and omit names a profile does not set', async () => {
    const { service, record } = lookupOver([{ userId: 2n, displayName: 'Ada', firstName: null, lastName: null }]);

    const users = await service.lookupByUserId(['2', '3'], 'synapse');

    expect(users).toEqual([{ userId: '2', displayName: 'Ada', firstName: undefined, lastName: undefined }]);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: 'directory.users.lookup', actorId: 'synapse', detail: { requested: 2, resolved: 1 } }));
  });

  it('should scope the lookup to users holding a consent with the calling client', async () => {
    const { service, joins } = lookupOver([]);

    await service.lookupByUserId(['2'], 'synapse');

    expect(joins.map(join => join.table)).toEqual([schema.consents]);
    expect(new PgDialect().sqlToQuery(joins[0]!.condition).params).toEqual(['synapse']);
  });

  it('should not query for subjects that are not user ids', async () => {
    const { service, select } = lookupOver([]);

    expect(await service.lookupByUserId(['seed', 'import', '1'.repeat(20)], 'synapse')).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
});
