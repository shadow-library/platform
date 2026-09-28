import { afterAll, describe, expect, it, mock } from 'bun:test';

import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { setConfig } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { WebauthnService } from '@server/modules/auth/mfa/webauthn.service';

interface StoredCredential {
  credentialId: string;
  userId: bigint;
}

const dialect = new PgDialect();

/** Deletes as Postgres would: a row goes only when every column the WHERE names matches the bound value. */
function credentialStore(rows: StoredCredential[]) {
  const where = mock((condition: SQL) => {
    const { sql, params } = dialect.sqlToQuery(condition);
    const filters: [keyof StoredCredential, unknown][] = [];
    for (const [index, column] of [...sql.matchAll(/"(credential_id|user_id)" = \$(\d+)/g)].map(match => [Number(match[2]) - 1, match[1]] as const)) {
      filters.push([column === 'user_id' ? 'userId' : 'credentialId', params[index]]);
    }
    const removed = rows.filter(row => filters.every(([key, value]) => row[key] === value));
    for (const row of removed) rows.splice(rows.indexOf(row), 1);
    return { returning: () => Promise.resolve(removed.map(row => ({ userId: row.userId }))) };
  });
  return { postgres: { delete: () => ({ where }) }, rows };
}

function serviceOver(postgres: object) {
  const record = mock(() => Promise.resolve());
  const enqueue = mock(() => Promise.resolve());
  const service = new WebauthnService(
    new FakeDatabaseService({ postgres }),
    { getPrimaryEmail: () => Promise.resolve(null) } as never,
    { record } as never,
    { enqueue } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, record };
}

describe('WebauthnService', () => {
  const restoreConfig = setConfig({ 'auth.webauthn.rp-id': 'identity.test', 'auth.webauthn.origin': 'https://identity.test' });
  afterAll(restoreConfig);

  describe('remove', () => {
    it("should leave another account's passkey untouched when its credential id is submitted", async () => {
      const store = credentialStore([{ credentialId: 'victim-key', userId: 2n }]);
      const { service, record } = serviceOver(store.postgres);

      await expect(service.remove(1n, 'victim-key')).rejects.toMatchObject({ code: 'MFA_001' });
      expect(store.rows).toEqual([{ credentialId: 'victim-key', userId: 2n }]);
      expect(record).not.toHaveBeenCalled();
    });

    it('should remove and audit the caller’s own passkey', async () => {
      const store = credentialStore([
        { credentialId: 'own-key', userId: 1n },
        { credentialId: 'other-key', userId: 2n },
      ]);
      const { service, record } = serviceOver(store.postgres);

      await service.remove(1n, 'own-key');

      expect(store.rows).toEqual([{ credentialId: 'other-key', userId: 2n }]);
      expect(record).toHaveBeenCalledTimes(1);
    });
  });
});
