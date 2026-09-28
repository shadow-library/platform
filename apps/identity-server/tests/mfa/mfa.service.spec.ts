import { afterAll, describe, expect, it } from 'bun:test';

import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { setConfig } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { MfaService } from '@server/modules/auth/mfa/mfa.service';
import { type MfaEnrollment } from '@server/modules/infrastructure/datastore';

interface Enrollment {
  userId: bigint;
  type: MfaEnrollment.Method;
  verifiedAt: Date | null;
}

const dialect = new PgDialect();

/** Answers findFirst as Postgres would for the equality and IS NOT NULL predicates the WHERE carries. */
function matches(row: Enrollment, condition: SQL): boolean {
  const { sql, params } = dialect.sqlToQuery(condition);
  const equalities = [...sql.matchAll(/"(user_id|type)" = \$(\d+)/g)].every(([, column, index]) => {
    const value = params[Number(index) - 1];
    return column === 'user_id' ? row.userId === value : row.type === value;
  });
  return equalities && (!sql.includes('"verified_at" is not null') || row.verifiedAt !== null);
}

function serviceOver(enrollments: Enrollment[]): MfaService {
  const postgres = {
    query: {
      mfaEnrollments: { findFirst: (config: { where: SQL }) => Promise.resolve(enrollments.find(row => matches(row, config.where))) },
      webauthnCredentials: { findFirst: () => Promise.resolve(undefined) },
    },
  };
  const none = {} as never;
  return new MfaService(new FakeDatabaseService({ postgres }), none, none, none, none, none, none, none, none, none);
}

describe('MfaService', () => {
  const restoreConfig = setConfig({ 'oauth.issuer': 'https://identity.test' });
  afterAll(restoreConfig);

  describe('getFactors', () => {
    it('should not report a verified enrolment of another kind as TOTP', async () => {
      const factors = await serviceOver([{ userId: 1n, type: 'EMAIL_OTP', verifiedAt: new Date() }]).getFactors(1n);

      expect(factors).toEqual({ totp: false, webauthn: false });
    });

    it('should report a verified TOTP enrolment', async () => {
      const factors = await serviceOver([{ userId: 1n, type: 'TOTP', verifiedAt: new Date() }]).getFactors(1n);

      expect(factors).toEqual({ totp: true, webauthn: false });
    });

    it('should ignore a TOTP enrolment that was never verified', async () => {
      const factors = await serviceOver([{ userId: 1n, type: 'TOTP', verifiedAt: null }]).getFactors(1n);

      expect(factors).toEqual({ totp: false, webauthn: false });
    });
  });
});
