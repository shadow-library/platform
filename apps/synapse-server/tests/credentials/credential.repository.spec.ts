import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { type Envelope } from '@shadow-library/common/crypto';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { constraintErrorMap } from '@server/database/database.constants';

import { CredentialRepository } from '@modules/credentials/credential.repository';

import { type ExecutedQuery, fakePostgres, type QueryAnswer } from '../metering/fake-postgres';
import { credentialId } from './credential.fixtures';

const ENVELOPE = { v: 1, alg: 'A256GCM', kid: 'k2', dek: 'd', iv: 'i', ct: 'c', tag: 't' } as unknown as Envelope;

function repositoryOver(answer?: QueryAnswer): { repository: CredentialRepository; queries: ExecutedQuery[]; log: string[] } {
  const fake = fakePostgres(answer);
  return { repository: new CredentialRepository(new FakeDatabaseService({ postgres: fake.db, constraintErrorMap })), queries: fake.queries, log: fake.log };
}

let restoreLogger: RestoreLogger;
beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

describe('CredentialRepository.rewrapStale', () => {
  const answer: QueryAnswer = query => {
    if (query.sql.includes('pg_try_advisory_xact_lock')) return [{ locked: true }];
    if (query.sql.startsWith('select')) return [[credentialId(1), 3, 'k1', { kid: 'k1' }]];
    return [];
  };

  it('should re-wrap under the rewrap lock with a compare-and-set on the version and kid it read', async () => {
    const { repository, queries, log } = repositoryOver(answer);

    expect(await repository.rewrapStale('k2', async () => ENVELOPE)).toEqual({ rewrapped: 0, skipped: 1, failed: [] });

    expect(log[0]).toBe('begin');
    expect(queries[0]?.sql).toBe("select pg_try_advisory_xact_lock(hashtext('synapse:credentials:rewrap')) as locked");
    expect(queries[1]?.sql).toContain(`where "provider_credentials"."secret"->>'kid' is distinct from $1`);
    expect(queries[2]?.sql).toContain(`where ("provider_credentials"."id" = $2 and "provider_credentials"."version" = $3 and "provider_credentials"."secret"->>'kid' = $4)`);
    expect(queries[2]?.params.slice(1)).toEqual([credentialId(1), 3, 'k1']);
    expect(log.at(-1)).toBe('commit');
  });

  it('should report a row it cannot re-wrap by id and write nothing for it', async () => {
    const { repository, queries } = repositoryOver(answer);
    expect(await repository.rewrapStale('k2', () => Promise.reject(new TypeError('unreadable')))).toEqual({ rewrapped: 0, skipped: 0, failed: [credentialId(1)] });
    expect(queries).toHaveLength(2);
  });

  it('should touch nothing while another replica holds the lock', async () => {
    const { repository, queries } = repositoryOver(() => [{ locked: false }]);
    expect(await repository.rewrapStale('k2', async () => ENVELOPE)).toBeUndefined();
    expect(queries).toHaveLength(1);
  });
});

describe('CredentialRepository.revoke', () => {
  it('should check the published catalog under the catalog write lock and revoke nothing while it is referenced', async () => {
    const { repository, queries } = repositoryOver(query => {
      if (query.sql.includes('from "provider_credentials"'))
        return [[credentialId(1), 'openrouter', {}, 'https://openrouter.ai', 'h', 1, 'admin', new Date().toISOString(), null, null]];
      if (query.sql.includes('from "catalog_versions"')) return [[{ providers: { openrouter: { credential: credentialId(1) } } }]];
      return [];
    });

    const outcome = await repository.revoke(credentialId(1), 'admin-1', () => ['openrouter']);

    expect(outcome).toEqual({ status: 'in_use', referencedBy: ['openrouter'] });
    expect(queries[0]?.sql).toBe("select pg_advisory_xact_lock(hashtext('synapse:catalog'))");
    expect(queries[1]?.sql).toContain('for update');
    expect(queries.some(query => query.sql.startsWith('update'))).toBe(false);
  });
});
