import { and, between, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type DailyState, type PrimaryDatabase, type Quest, schema } from '@server/database';

export interface ShieldHolder {
  strictness: Quest.Strictness;
  optionalStreakOptIn: boolean;
  shieldsAvailable: number;
}

@Injectable()
export class HeroStandingRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async listShieldHolders(accountId: bigint): Promise<ShieldHolder[]> {
    const rows = await this.db
      .select({ strictness: schema.quests.strictness, optionalStreakOptIn: schema.quests.optionalStreakOptIn, shieldsAvailable: schema.questStreaks.shieldsAvailable })
      .from(schema.quests)
      .leftJoin(schema.questStreaks, and(eq(schema.questStreaks.accountId, schema.quests.accountId), eq(schema.questStreaks.questId, schema.quests.id)))
      .where(and(eq(schema.quests.accountId, accountId), eq(schema.quests.active, true)));
    return rows.map(row => ({ ...row, shieldsAvailable: row.shieldsAvailable ?? 0 }));
  }

  async listDailyStates(accountId: bigint, from: string, to: string): Promise<DailyState.Row[]> {
    return this.db
      .select()
      .from(schema.dailyStates)
      .where(and(eq(schema.dailyStates.accountId, accountId), between(schema.dailyStates.date, from, to)));
  }

  async hasPendingRecovery(accountId: bigint, date: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: schema.recoveryQuests.id })
      .from(schema.recoveryQuests)
      .where(and(eq(schema.recoveryQuests.accountId, accountId), eq(schema.recoveryQuests.date, date), eq(schema.recoveryQuests.state, 'pending')));
    return rows.length > 0;
  }
}
