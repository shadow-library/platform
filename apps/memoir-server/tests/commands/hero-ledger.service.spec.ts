import '@server/bootstrap';

import { describe, expect, it } from 'bun:test';
import { AppError } from '@shadow-library/common';

import { type GrantIntent, HeroLedger } from '@modules/commands/hero-ledger.service';
import { currentRuleset, xpThresholdForLevel } from '@modules/rules';
import { AppErrorCode } from '@server/classes';
import { type DatabaseTransaction } from '@server/database';
import { type TelemetryService } from '@server/telemetry';

import { type RecordedQuery, recordingDb } from '../recording-db';

const ACCOUNT_ID = 7n;
const DATE = '2026-03-01';

function ledgerOver(duplicates: string[] = []) {
  let nextEventId = 500n;
  const { db, queries } = recordingDb((query: RecordedQuery) => {
    if (query.sql.startsWith('select') && query.sql.includes('from "accounts"')) {
      return [{ level: 1, totalXp: 0n, coins: 50, statDiscipline: 0, statBody: 0, statWealth: 0, statMind: 0 }];
    }
    if (query.sql.startsWith('insert into "hero_events"')) return duplicates.some(key => query.params.includes(key)) ? [] : [{ id: nextEventId++ }];
    if (query.sql.startsWith('select') && query.sql.includes('from "hero_events"')) {
      return [{ id: 1n, xpDelta: 5, coinsDelta: 0, statAffinity: null, statDelta: 0, levelAfter: 1 }];
    }
    return [];
  });
  const ledger = new HeroLedger({ emit: () => undefined } as unknown as TelemetryService);
  return { ledger, tx: db as DatabaseTransaction, queries };
}

function accountReads(queries: RecordedQuery[]): number {
  return queries.filter(query => query.sql.startsWith('select') && query.sql.includes('from "accounts"')).length;
}

function accountUpdates(queries: RecordedQuery[]): RecordedQuery[] {
  return queries.filter(query => query.sql.startsWith('update "accounts"'));
}

const intent = (dedupeKey: string, overrides: Partial<GrantIntent> = {}): GrantIntent => ({ dedupeKey, type: 'crown_forfeit', date: DATE, ...overrides });

describe('HeroLedger', () => {
  it('should lock the account once per grant and carry each applied intent into the next', async () => {
    const { ledger, tx, queries } = ledgerOver();

    const outcomes = await ledger.grant(tx, ACCOUNT_ID, [
      intent('a', { xpDelta: 10, coinsDelta: 5, statAffinity: 'body', statDelta: 1 }),
      intent('b', { xpDelta: 20, coinsDelta: -15, statAffinity: 'body', statDelta: 2 }),
      intent('c', { xpDelta: 30, statAffinity: 'mind', statDelta: 1 }),
    ]);

    expect(outcomes.map(outcome => outcome.status)).toEqual(['applied', 'applied', 'applied']);
    expect(accountReads(queries)).toBe(1);
    expect(queries).toHaveLength(7);
    const [first, second, third] = accountUpdates(queries).map(update => update.params);
    expect(first).toEqual(expect.arrayContaining([10n, 55]));
    expect(second).toEqual(expect.arrayContaining([30n, 40, 3]));
    expect(third).toEqual(expect.arrayContaining([60n, 40, 3, 1]));
  });

  it('should refuse a spend against the balance earlier intents in the same grant already drew down', async () => {
    const { ledger, tx } = ledgerOver();

    const error = await ledger.grant(tx, ACCOUNT_ID, [intent('spend-1', { coinsDelta: -30 }), intent('spend-2', { coinsDelta: -30 })]).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(AppErrorCode.HRO_001.code);
  });

  it('should leave the carried totals untouched by a duplicate intent', async () => {
    const { ledger, tx, queries } = ledgerOver(['dup']);

    const outcomes = await ledger.grant(tx, ACCOUNT_ID, [intent('dup', { xpDelta: 99 }), intent('fresh', { xpDelta: 4 })]);

    expect(outcomes.map(outcome => outcome.status)).toEqual(['duplicate', 'applied']);
    expect(accountReads(queries)).toBe(1);
    expect(accountUpdates(queries)).toHaveLength(1);
    expect(accountUpdates(queries)[0]?.params).toEqual(expect.arrayContaining([4n]));
  });

  it('should append every level crossed without re-reading the account', async () => {
    const { ledger, tx, queries } = ledgerOver();
    const xp = xpThresholdForLevel(currentRuleset(), 4);

    const [outcome] = await ledger.grant(tx, ACCOUNT_ID, [intent('big', { xpDelta: xp })]);

    expect(outcome?.leveledUp).toBe(true);
    expect(outcome?.levelAfter).toBe(4);
    expect(
      queries
        .filter(query => query.params.some(param => typeof param === 'string' && param.startsWith('levelup_')))
        .map(query => query.params.find(param => String(param).startsWith('levelup_'))),
    ).toEqual(['levelup_2', 'levelup_3', 'levelup_4']);
    expect(accountReads(queries)).toBe(1);
  });

  it('should not touch the database for an empty grant', async () => {
    const { ledger, tx, queries } = ledgerOver();

    expect(await ledger.grant(tx, ACCOUNT_ID, [])).toEqual([]);
    expect(queries).toHaveLength(0);
  });
});
