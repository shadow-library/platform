import { describe, expect, it } from 'bun:test';

import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';

import { schema } from '@server/database';
import { EXPORT_TABLE_EXCLUSIONS, EXPORT_TABLE_REGISTRY } from '@server/modules/export';

/**
 * ARCHITECTURE §20's "hard to forget" requirement: every table in the schema barrel must be either
 * exported (in `EXPORT_TABLE_REGISTRY`) or explicitly excluded with a reason (`EXPORT_TABLE_EXCLUSIONS`).
 * Adding a new user-owned table without wiring it into the registry fails this test, not silently ships
 * an incomplete export.
 */
describe('Export table registry completeness (T-29)', () => {
  it('should account for every table in the schema barrel', () => {
    const schemaTableNames = Object.values(schema)
      .filter(value => is(value, PgTable))
      .map(table => getTableName(table));

    const registryNames = new Set(EXPORT_TABLE_REGISTRY.map(entry => entry.key));
    const excludedNames = new Set(Object.keys(EXPORT_TABLE_EXCLUSIONS));

    const unaccountedFor = schemaTableNames.filter(name => name !== 'accounts' && !registryNames.has(name) && !excludedNames.has(name));
    expect(unaccountedFor).toEqual([]);
  });

  it('should not exclude a table the registry also claims to export', () => {
    const registryNames = new Set(EXPORT_TABLE_REGISTRY.map(entry => entry.key));
    const overlap = Object.keys(EXPORT_TABLE_EXCLUSIONS).filter(name => registryNames.has(name));
    expect(overlap).toEqual([]);
  });
});
