/**
 * Importing npm packages
 */
import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

import { currentRuleset, levelFor, type QuestLogState, type StatAffinity } from '@modules/rules';
import { AppErrorCode } from '@server/classes';
import { type DatabaseTransaction, type HeroEvent, schema } from '@server/database';

/**
 * Defining types
 */

export interface GrantIntent {
  /** The deterministic natural key from PRD §3.4 — the same user action must always derive the same string. */
  dedupeKey: string;
  type: HeroEvent.Type;
  /** User-local calendar date the grant is attributed to. */
  date: string;
  xpDelta?: number;
  /** Negative only for `coin_spend`; a spend beyond the balance is refused rather than clamped. */
  coinsDelta?: number;
  statAffinity?: StatAffinity;
  statDelta?: number;
  questId?: bigint;
  questLogId?: bigint;
  state?: QuestLogState;
  achievementId?: string;
  note?: string;
  /** The level this event marks; defaults to the level the account's totals imply once the grant lands. */
  levelAfter?: number;
}

export interface GrantOutcome {
  dedupeKey: string;
  /** `duplicate` is convergence, never failure: the deltas below are the ones the first grant recorded. */
  status: 'applied' | 'duplicate';
  eventId: bigint;
  xpDelta: number;
  coinsDelta: number;
  statAffinity: StatAffinity | null;
  statDelta: number;
  levelAfter: number | null;
  leveledUp: boolean;
}

interface AppliedGrant {
  outcome: GrantOutcome;
  levelUps: GrantIntent[];
}

/**
 * The single gate through which every Hero total moves (ARCHITECTURE §11.1). Callers hand it an open
 * transaction — the one their domain command already owns — so the `hero_events` append and the
 * `accounts` mirror update commit together or not at all, which is the PRD §3.4 atomicity requirement.
 *
 * `hero_events` is grant-frozen for every runtime role (§10.4), so `level_after` has to be right at
 * insert time: the account row is read `FOR UPDATE` first and the post-grant level computed from it,
 * rather than stamped by a follow-up UPDATE the role cannot issue.
 */
@Injectable()
export class HeroLedger {
  async grant(tx: DatabaseTransaction, accountId: bigint, intents: GrantIntent[]): Promise<GrantOutcome[]> {
    const outcomes: GrantOutcome[] = [];
    for (const intent of intents) {
      const applied = await this.apply(tx, accountId, intent, true);
      outcomes.push(applied.outcome);
      for (const levelUp of applied.levelUps) await this.apply(tx, accountId, levelUp, false);
    }
    return outcomes;
  }

  /** `deriveLevelUps` is false for the level-up events this method itself produced — that is §11.1's recursion depth of exactly 1. */
  private async apply(tx: DatabaseTransaction, accountId: bigint, intent: GrantIntent, deriveLevelUps: boolean): Promise<AppliedGrant> {
    const ruleset = currentRuleset();
    const [account] = await tx
      .select({
        level: schema.accounts.level,
        totalXp: schema.accounts.totalXp,
        coins: schema.accounts.coins,
        statDiscipline: schema.accounts.statDiscipline,
        statBody: schema.accounts.statBody,
        statWealth: schema.accounts.statWealth,
        statMind: schema.accounts.statMind,
      })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .for('update');
    if (!account) throw AppError.internal(`HeroLedger.grant addressed account '${accountId}' which does not exist`);

    const xpDelta = intent.xpDelta ?? 0;
    const coinsDelta = intent.coinsDelta ?? 0;
    const statDelta = intent.statDelta ?? 0;
    const totalXp = account.totalXp + BigInt(xpDelta);
    const coins = account.coins + coinsDelta;
    if (coins < 0) throw AppErrorCode.HRO_001.create({ balance: account.coins, required: -coinsDelta });

    const level = levelFor(ruleset, Number(totalXp));
    const [event] = await tx
      .insert(schema.heroEvents)
      .values({
        accountId,
        dedupeKey: intent.dedupeKey,
        type: intent.type,
        date: intent.date,
        xpDelta,
        coinsDelta,
        statAffinity: intent.statAffinity ?? null,
        statDelta,
        questId: intent.questId ?? null,
        questLogId: intent.questLogId ?? null,
        state: intent.state ?? null,
        achievementId: intent.achievementId ?? null,
        note: intent.note ?? null,
        levelAfter: intent.levelAfter ?? level,
        rulesetVersion: ruleset.version,
      })
      .onConflictDoNothing({ target: [schema.heroEvents.accountId, schema.heroEvents.dedupeKey] })
      .returning({ id: schema.heroEvents.id });

    if (!event) return { outcome: await this.converge(tx, accountId, intent.dedupeKey), levelUps: [] };

    await tx
      .update(schema.accounts)
      .set({
        totalXp,
        coins,
        level,
        statDiscipline: account.statDiscipline + (intent.statAffinity === 'discipline' ? statDelta : 0),
        statBody: account.statBody + (intent.statAffinity === 'body' ? statDelta : 0),
        statWealth: account.statWealth + (intent.statAffinity === 'wealth' ? statDelta : 0),
        statMind: account.statMind + (intent.statAffinity === 'mind' ? statDelta : 0),
        updatedAt: new Date(),
      })
      .where(eq(schema.accounts.id, accountId));

    const levelUps: GrantIntent[] = [];
    if (deriveLevelUps) {
      for (let reached = account.level + 1; reached <= level; reached++) {
        levelUps.push({ dedupeKey: `levelup_${reached}`, type: 'level_up', date: intent.date, levelAfter: reached });
      }
    }

    const outcome: GrantOutcome = {
      dedupeKey: intent.dedupeKey,
      status: 'applied',
      eventId: event.id,
      xpDelta,
      coinsDelta,
      statAffinity: intent.statAffinity ?? null,
      statDelta,
      levelAfter: intent.levelAfter ?? level,
      leveledUp: level > account.level,
    };
    return { outcome, levelUps };
  }

  private async converge(tx: DatabaseTransaction, accountId: bigint, dedupeKey: string): Promise<GrantOutcome> {
    const [existing] = await tx
      .select()
      .from(schema.heroEvents)
      .where(and(eq(schema.heroEvents.accountId, accountId), eq(schema.heroEvents.dedupeKey, dedupeKey)));
    if (!existing) throw AppError.internal(`hero event '${dedupeKey}' conflicted on insert but could not be read back for account '${accountId}'`);

    return {
      dedupeKey,
      status: 'duplicate',
      eventId: existing.id,
      xpDelta: existing.xpDelta,
      coinsDelta: existing.coinsDelta,
      statAffinity: existing.statAffinity,
      statDelta: existing.statDelta,
      levelAfter: existing.levelAfter,
      leveledUp: false,
    };
  }
}
