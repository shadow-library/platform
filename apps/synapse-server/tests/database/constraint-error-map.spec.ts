import { describe, expect, it } from 'bun:test';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';

import { AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { budgetCounters, catalogVersions, ledger } from '@server/database/schemas';
import { constraintErrorMap } from '@server/database/database.constants';

/** An unnamed column-level primary key is named `<table>_pkey` by Postgres, not by Drizzle. */
function declaredConstraintNames(table: PgTable): string[] {
  const config = getTableConfig(table);
  const columnPrimaryKeys = config.columns.filter(column => column.primary).map(() => `${config.name}_pkey`);
  const tablePrimaryKeys = config.primaryKeys.map(primaryKey => primaryKey.getName());
  const columnUniques = config.columns.filter(column => column.isUnique).map(column => column.uniqueName);
  const tableUniques = config.uniqueConstraints.map(constraint => constraint.getName());
  const uniqueIndexes = config.indexes.filter(index => index.config.unique).map(index => index.config.name);
  return [...columnPrimaryKeys, ...tablePrimaryKeys, ...columnUniques, ...tableUniques, ...uniqueIndexes].filter(name => name !== undefined);
}

const DECLARED_NAMES = new Set([catalogVersions, ledger, budgetCounters].flatMap(declaredConstraintNames));

describe('constraintErrorMap', () => {
  it('should key every entry by a primary key, unique constraint or unique index the schema declares', () => {
    for (const name of Object.keys(constraintErrorMap)) expect({ name, declared: DECLARED_NAMES.has(name) }).toEqual({ name, declared: true });
  });

  it('should resolve the name of every table primary key, column-level and composite alike', () => {
    for (const name of ['catalog_versions_pkey', 'ledger_pkey', 'budget_counters_pk']) expect({ name, declared: DECLARED_NAMES.has(name) }).toEqual({ name, declared: true });
  });

  it('should turn a clashing catalog id, version number or second draft into a catalog conflict the admin can retry', () => {
    for (const name of ['catalog_versions_pkey', 'catalog_versions_version_unique', 'catalog_versions_single_draft_idx']) {
      expect(AppError.is(constraintErrorMap[name], AppErrorCode.SYN_CATALOG_CONFLICT)).toBe(true);
    }
  });

  it('should turn a request_id reused at admission into a duplicate request', () => {
    expect(AppError.is(constraintErrorMap.ledger_pkey, AppErrorCode.SYN_DUPLICATE_REQUEST)).toBe(true);
  });
});
