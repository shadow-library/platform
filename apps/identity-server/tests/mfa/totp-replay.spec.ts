import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { AppError } from '@shadow-library/common';
import { type RestoreConfig, type RestoreLogger, setConfig, silenceLogger } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { AppErrorCode } from '@server/classes';
import { MfaService } from '@server/modules/auth/mfa/mfa.service';
import { hotp } from '@server/modules/auth/mfa/totp';
import { type MfaEnrollment } from '@server/modules/infrastructure/datastore';

import { LEGACY_MFA_SECRET, sealerFor, TOTP_SECRET_HEX } from '../keys/keys.fixtures';

type Predicate = [RegExp, (match: RegExpMatchArray) => boolean];

const SECRET = Buffer.from(TOTP_SECRET_HEX, 'hex');

const dialect = new PgDialect();

let restoreConfig: RestoreConfig;
let restoreLogger: RestoreLogger;

beforeAll(() => {
  restoreConfig = setConfig({ 'oauth.issuer': 'https://identity.test' });
  restoreLogger = silenceLogger();
});

afterAll(() => {
  restoreConfig();
  restoreLogger();
});

function currentStep(): number {
  return Math.floor(Date.now() / 1000 / 30);
}

function enrollmentRow(overrides: Partial<MfaEnrollment> = {}): MfaEnrollment {
  return {
    id: 9n,
    userId: 1n,
    type: 'TOTP',
    label: 'Authenticator',
    verifiedAt: new Date(),
    lastUsedAt: null,
    lastUsedCounter: null,
    secretEnvelope: null,
    secretCiphertext: LEGACY_MFA_SECRET,
    kekVersion: 1,
    createdAt: new Date(),
    ...overrides,
  };
}

/** Applies an UPDATE's WHERE as Postgres would for the predicates the TOTP writes issue, so a guard missing from the query lets the write through. */
function holds(row: MfaEnrollment, condition: SQL): boolean {
  const { sql, params } = dialect.sqlToQuery(condition);
  const param = (match: RegExpMatchArray): unknown => params[Number(match[1]) - 1];
  const predicates: Predicate[] = [
    [/"id" = \$(\d+)/, match => row.id === param(match)],
    [/"verified_at" is null/, () => row.verifiedAt === null],
    [
      /"last_used_counter" is null or "mfa_enrollments"\."last_used_counter" < \$(\d+)/,
      match => row.lastUsedCounter === null || row.lastUsedCounter < BigInt(param(match) as bigint),
    ],
  ];
  return predicates.every(([pattern, check]) => {
    const match = sql.match(pattern);
    return !match || check(match);
  });
}

function serviceOver(row: MfaEnrollment): MfaService {
  const postgres = {
    query: {
      mfaEnrollments: {
        findFirst: (config: { where: SQL }) => {
          const wantsVerified = dialect.sqlToQuery(config.where).sql.includes('"verified_at" is not null');
          return Promise.resolve((row.verifiedAt !== null) === wantsVerified ? { ...row } : undefined);
        },
      },
    },
    update: () => ({
      set: (values: Partial<MfaEnrollment>) => ({
        where: (condition: SQL) => ({
          returning: () => {
            if (!holds(row, condition)) return Promise.resolve([]);
            Object.assign(row, values);
            return Promise.resolve([{ id: row.id }]);
          },
        }),
      }),
    }),
  };
  const none = {} as never;
  const auditService = { record: () => Promise.resolve() } as never;
  const userEmailService = { getPrimaryEmail: () => Promise.resolve(null) } as never;
  return new MfaService(new FakeDatabaseService({ postgres }), sealerFor(), userEmailService, auditService, none, none, none, none, none, none);
}

async function refusal(work: () => Promise<unknown>): Promise<unknown> {
  return work().then(
    () => null,
    (error: unknown) => error,
  );
}

describe('MfaService TOTP replay', () => {
  describe('verifyTotp', () => {
    it('should accept a fresh code when no counter has been used yet and record its counter', async () => {
      const row = enrollmentRow();
      const step = currentStep();

      expect(await serviceOver(row).verifyTotp(1n, hotp(SECRET, step))).toBe(true);
      expect(row.lastUsedCounter).toBe(BigInt(step));
    });

    it('should refuse a code whose counter equals the last one used', async () => {
      const step = currentStep();
      const row = enrollmentRow({ lastUsedCounter: BigInt(step) });

      expect(await serviceOver(row).verifyTotp(1n, hotp(SECRET, step))).toBe(false);
    });

    it('should refuse a code whose counter is older than the last one used', async () => {
      const step = currentStep();
      const row = enrollmentRow({ lastUsedCounter: BigInt(step + 1) });

      expect(await serviceOver(row).verifyTotp(1n, hotp(SECRET, step))).toBe(false);
      expect(row.lastUsedCounter).toBe(BigInt(step + 1));
    });

    it('should accept a code from a later counter than the last one used', async () => {
      const step = currentStep();
      const row = enrollmentRow({ lastUsedCounter: BigInt(step - 1) });

      expect(await serviceOver(row).verifyTotp(1n, hotp(SECRET, step))).toBe(true);
      expect(row.lastUsedCounter).toBe(BigInt(step));
    });

    it('should accept exactly one of two concurrent submissions of one code', async () => {
      const service = serviceOver(enrollmentRow());
      const code = hotp(SECRET, currentStep());

      const results = await Promise.all([service.verifyTotp(1n, code), service.verifyTotp(1n, code)]);

      expect(results.filter(Boolean)).toHaveLength(1);
    });
  });

  describe('activateTotp', () => {
    it('should activate a pending enrolment once and refuse a concurrent second activation', async () => {
      const row = enrollmentRow({ verifiedAt: null });
      const service = serviceOver(row);
      const code = hotp(SECRET, currentStep());

      const outcomes = await Promise.all([refusal(() => service.activateTotp(1n, code)), refusal(() => service.activateTotp(1n, code))]);

      expect(outcomes.filter(outcome => outcome === null)).toHaveLength(1);
      expect(outcomes.some(outcome => AppError.is(outcome, AppErrorCode.MFA_001))).toBe(true);
      expect(row.verifiedAt).toBeInstanceOf(Date);
    });
  });
});
