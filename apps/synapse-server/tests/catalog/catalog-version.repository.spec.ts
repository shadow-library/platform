import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { AppError } from '@shadow-library/common';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { AppErrorCode } from '@server/classes';
import { constraintErrorMap } from '@server/database/database.constants';

import { CatalogVersionRepository } from '@modules/catalog/catalog-version.repository';

const dialect = new PgDialect();

function postgresError(constraint: string): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint'), { code: 'ERR_POSTGRES_SERVER_ERROR', constraint });
}

function repositoryOver(transaction: (work: (tx: unknown) => Promise<unknown>) => Promise<unknown>): CatalogVersionRepository {
  return new CatalogVersionRepository(new FakeDatabaseService({ postgres: { transaction }, constraintErrorMap }));
}

let restoreLogger: RestoreLogger;
beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

describe('CatalogVersionRepository.exclusive', () => {
  it('should take the catalog advisory lock before running the work', async () => {
    const executed: string[] = [];
    const tx = { execute: async (query: SQL) => void executed.push(dialect.sqlToQuery(query).sql) };
    const repository = repositoryOver(work => work(tx));

    await repository.exclusive(async () => void executed.push('work'));

    expect(executed).toEqual(["select pg_advisory_xact_lock(hashtext('synapse:catalog'))", 'work']);
  });

  it('should run the lock and every store statement on the same transaction', async () => {
    const used: string[] = [];
    const rows = { limit: async () => [] };
    const chain = { from: () => ({ where: () => rows }) };
    const tx = {
      execute: async () => void used.push('tx.execute'),
      select: () => {
        used.push('tx.select');
        return chain;
      },
    };
    const pool = { transaction: (work: (handle: unknown) => Promise<unknown>) => work(tx), select: () => used.push('pool.select') };
    const repository = new CatalogVersionRepository(new FakeDatabaseService({ postgres: pool, constraintErrorMap }));

    await repository.exclusive(store => store.findVersion(1));

    expect(used).toEqual(['tx.execute', 'tx.select']);
  });

  it('should surface a version violation as a catalog conflict', async () => {
    for (const constraint of ['catalog_versions_pkey', 'catalog_versions_version_unique']) {
      const repository = repositoryOver(async () => {
        throw postgresError(constraint);
      });
      const error = await repository.exclusive(async () => undefined).catch((reason: unknown) => reason);
      expect(AppError.is(error, AppErrorCode.SYN_CATALOG_CONFLICT)).toBe(true);
    }
  });

  it('should pass a domain error raised by the work through unchanged', async () => {
    const invalid = AppErrorCode.SYN_CATALOG_INVALID.create({ issues: [] });
    const repository = repositoryOver(work => work({ execute: async () => undefined }));
    const error = await repository
      .exclusive(async () => {
        throw invalid;
      })
      .catch((reason: unknown) => reason);
    expect(error).toBe(invalid);
  });

  it('should turn any other failure into an internal error', async () => {
    const repository = repositoryOver(async () => {
      throw new TypeError('connection reset');
    });
    const error = await repository.exclusive(async () => undefined).catch((reason: unknown) => reason);
    expect(AppError.is(error) && error.isInternal).toBe(true);
  });
});
