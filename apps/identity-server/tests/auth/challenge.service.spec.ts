import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { ChallengeService } from '@server/modules/auth/flow/challenge.service';
import { type VerificationChallenge } from '@server/modules/infrastructure/datastore';

type Predicate = [RegExp, (match: RegExpMatchArray) => boolean];

const CODE = '123456';
const WRONG_CODES = Array.from({ length: 20 }, (_, index) => String(200_000 + index));

const dialect = new PgDialect();

function challengeRow(overrides: Partial<VerificationChallenge> = {}): VerificationChallenge {
  return {
    id: 'challenge-1',
    userId: 7n,
    flowId: 'flow-1',
    type: 'EMAIL_OTP',
    target: 'ada@example.com',
    codeHash: createHash('sha256').update(CODE).digest('hex'),
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    attemptCount: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

/** Applies an UPDATE's WHERE as Postgres would for the predicates `verifyAndGet` issues, so a guard missing from the query lets the write through. */
function holds(row: VerificationChallenge, condition: SQL): boolean {
  const { sql, params } = dialect.sqlToQuery(condition);
  const param = (match: RegExpMatchArray): unknown => params[Number(match[1]) - 1];
  const predicates: Predicate[] = [
    [/"id" = \$(\d+)/, match => row.id === param(match)],
    [/"consumed_at" is null/, () => row.consumedAt === null],
    [/"attempt_count" < \$(\d+)/, match => row.attemptCount < Number(param(match))],
    [/"expires_at" > now\(\)/, () => row.expiresAt.getTime() > Date.now()],
  ];
  return predicates.every(([pattern, check]) => {
    const match = sql.match(pattern);
    return !match || check(match);
  });
}

function apply(row: VerificationChallenge, values: Record<string, SQL>): void {
  if (values.attemptCount && dialect.sqlToQuery(values.attemptCount).sql.endsWith('"attempt_count" + 1')) row.attemptCount += 1;
  if (values.consumedAt && dialect.sqlToQuery(values.consumedAt).sql === 'now()') row.consumedAt = new Date();
}

function serviceOver(row: VerificationChallenge): ChallengeService {
  const postgres = {
    query: { verificationChallenges: { findFirst: () => Promise.resolve(row.consumedAt === null ? { ...row } : undefined) } },
    update: () => ({
      set: (values: Record<string, SQL>) => ({
        where: (condition: SQL) => ({
          returning: () => {
            if (!holds(row, condition)) return Promise.resolve([]);
            apply(row, values);
            return Promise.resolve([{ ...row }]);
          },
        }),
      }),
    }),
  };
  const none = {} as never;
  return new ChallengeService(new FakeDatabaseService({ postgres }), none, none);
}

describe('ChallengeService', () => {
  describe('verifyAndGet', () => {
    it('should accept the issued code once and return the consumed challenge', async () => {
      const row = challengeRow();
      const service = serviceOver(row);

      const challenge = await service.verifyAndGet('flow-1', CODE);

      expect(challenge?.consumedAt).toBeInstanceOf(Date);
      expect(challenge?.target).toBe('ada@example.com');
      expect(await service.verifyAndGet('flow-1', CODE)).toBeNull();
    });

    it('should refuse the correct code once three wrong guesses spent the budget', async () => {
      const row = challengeRow();
      const service = serviceOver(row);

      for (const code of WRONG_CODES.slice(0, 3)) expect(await service.verifyAndGet('flow-1', code)).toBeNull();

      expect(await service.verifyAndGet('flow-1', CODE)).toBeNull();
      expect(row).toMatchObject({ attemptCount: 3, consumedAt: null });
    });

    it('should accept the correct code on the last remaining attempt', async () => {
      const row = challengeRow({ attemptCount: 2 });

      expect(await serviceOver(row).verifyAndGet('flow-1', CODE)).not.toBeNull();
      expect(row.attemptCount).toBe(3);
    });

    it('should bound concurrent wrong guesses by the attempt budget so the correct code is refused afterwards', async () => {
      const row = challengeRow();
      const service = serviceOver(row);

      const results = await Promise.all(WRONG_CODES.map(code => service.verifyAndGet('flow-1', code)));

      expect(results.every(result => result === null)).toBe(true);
      expect(row.attemptCount).toBe(3);
      expect(await service.verifyAndGet('flow-1', CODE)).toBeNull();
    });

    it('should accept exactly one of two concurrent submissions of the correct code', async () => {
      const service = serviceOver(challengeRow());

      const results = await Promise.all([service.verifyAndGet('flow-1', CODE), service.verifyAndGet('flow-1', CODE)]);

      expect(results.filter(result => result !== null)).toHaveLength(1);
    });

    it('should refuse an expired challenge without spending an attempt', async () => {
      const row = challengeRow({ expiresAt: new Date(Date.now() - 1_000) });

      expect(await serviceOver(row).verifyAndGet('flow-1', CODE)).toBeNull();
      expect(row).toMatchObject({ attemptCount: 0, consumedAt: null });
    });
  });
});
