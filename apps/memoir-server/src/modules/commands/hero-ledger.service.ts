import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

import { currentRuleset, levelFor, type QuestLogState, type StatAffinity } from '@modules/rules';
import { AppErrorCode } from '@server/classes';
import { type DatabaseTransaction, type HeroEvent, schema } from '@server/database';
import { pseudoAccountId, TelemetryService } from '@server/telemetry';

export interface GrantIntent {
  /** The deterministic natural key: the same user action must always derive the same string. */
  dedupeKey: string;
  type: HeroEvent.Type;
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

interface HeroTotals {
  level: number;
  totalXp: bigint;
  coins: number;
  statDiscipline: number;
  statBody: number;
  statWealth: number;
  statMind: number;
}

interface AppliedGrant {
  account: HeroTotals;
  outcome: GrantOutcome;
  levelUps: GrantIntent[];
}

/**
 * The single gate through which every Hero total moves. Callers pass the open transaction their command owns, so the `hero_events` append and
 * `accounts` mirror update commit together.
 * `hero_events` is grant-frozen for every runtime role, so `level_after` must be right at insert: the account row is read `FOR UPDATE` and the post-grant level computed from it.
 */
@Injectable()
export class HeroLedger {
  constructor(private readonly telemetry: TelemetryService) {}

  /** Reads the account `FOR UPDATE` once and carries it forward: under that lock only this loop writes it, so a per-intent re-read returns what the last intent wrote. */
  async grant(tx: DatabaseTransaction, accountId: bigint, intents: GrantIntent[]): Promise<GrantOutcome[]> {
    const outcomes: GrantOutcome[] = [];
    if (intents.length === 0) return outcomes;

    let account = await this.lockTotals(tx, accountId);
    for (const intent of intents) {
      const applied = await this.apply(tx, accountId, account, intent, true);
      account = applied.account;
      outcomes.push(applied.outcome);
      for (const levelUp of applied.levelUps) account = (await this.apply(tx, accountId, account, levelUp, false)).account;
    }
    return outcomes;
  }

  private async lockTotals(tx: DatabaseTransaction, accountId: bigint): Promise<HeroTotals> {
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
    return account;
  }

  /** `deriveLevelUps` is false for the level-up events this method itself produces, so recursion is one level deep. */
  private async apply(tx: DatabaseTransaction, accountId: bigint, account: HeroTotals, intent: GrantIntent, deriveLevelUps: boolean): Promise<AppliedGrant> {
    const ruleset = currentRuleset();
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

    if (!event) return { account, outcome: await this.converge(tx, accountId, intent.dedupeKey), levelUps: [] };

    const next: HeroTotals = {
      level,
      totalXp,
      coins,
      statDiscipline: account.statDiscipline + (intent.statAffinity === 'discipline' ? statDelta : 0),
      statBody: account.statBody + (intent.statAffinity === 'body' ? statDelta : 0),
      statWealth: account.statWealth + (intent.statAffinity === 'wealth' ? statDelta : 0),
      statMind: account.statMind + (intent.statAffinity === 'mind' ? statDelta : 0),
    };
    await tx
      .update(schema.accounts)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(schema.accounts.id, accountId));

    const levelUps: GrantIntent[] = [];
    if (deriveLevelUps) {
      for (let reached = account.level + 1; reached <= level; reached++) {
        levelUps.push({ dedupeKey: `levelup_${reached}`, type: 'level_up', date: intent.date, levelAfter: reached });
      }
    }

    const leveledUp = level > account.level;
    const outcome: GrantOutcome = {
      dedupeKey: intent.dedupeKey,
      status: 'applied',
      eventId: event.id,
      xpDelta,
      coinsDelta,
      statAffinity: intent.statAffinity ?? null,
      statDelta,
      levelAfter: intent.levelAfter ?? level,
      leveledUp,
    };

    this.telemetry.emit({
      name: 'hero_event_recorded',
      pseudoId: pseudoAccountId(accountId),
      occurredAtMs: Date.now(),
      eventType: intent.type,
      xpDelta,
      coinsDelta,
      statAffinity: intent.statAffinity ?? null,
      statDelta,
      levelAfter: outcome.levelAfter,
      leveledUp,
    });

    return { account: next, outcome, levelUps };
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
