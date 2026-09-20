import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type AchievementId } from '@modules/rules';
import { type CosmeticUnlock, type DatabaseTransaction, type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * `achievements_earned`/`titles_earned`/`cosmetic_unlocks` are grant-frozen (ARCHITECTURE §10.4: INSERT
 * + SELECT only), so this repository never updates or deletes them — every write is an `onConflictDoNothing`
 * insert against the natural-key `U`, which is what makes every grant idempotent under replay. The one
 * exception is `cosmetic_unlocks.equipped`, the sole mutable column on that table (T-21, `EquipCosmetic`).
 */
@Injectable()
export class GrantsRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async listEarnedAchievementIds(tx: DatabaseTransaction, accountId: bigint): Promise<AchievementId[]> {
    const rows = await tx.select({ id: schema.achievementsEarned.achievementId }).from(schema.achievementsEarned).where(eq(schema.achievementsEarned.accountId, accountId));
    return rows.map(row => row.id as AchievementId);
  }

  async listEarnedTitleIds(tx: DatabaseTransaction, accountId: bigint): Promise<string[]> {
    const rows = await tx.select({ id: schema.titlesEarned.titleId }).from(schema.titlesEarned).where(eq(schema.titlesEarned.accountId, accountId));
    return rows.map(row => row.id);
  }

  async grantAchievement(tx: DatabaseTransaction, accountId: bigint, achievementId: string): Promise<boolean> {
    const [row] = await tx
      .insert(schema.achievementsEarned)
      .values({ accountId, achievementId })
      .onConflictDoNothing({ target: [schema.achievementsEarned.accountId, schema.achievementsEarned.achievementId] })
      .returning({ id: schema.achievementsEarned.id });
    return row !== undefined;
  }

  async grantTitle(tx: DatabaseTransaction, accountId: bigint, titleId: string): Promise<boolean> {
    const [row] = await tx
      .insert(schema.titlesEarned)
      .values({ accountId, titleId })
      .onConflictDoNothing({ target: [schema.titlesEarned.accountId, schema.titlesEarned.titleId] })
      .returning({ id: schema.titlesEarned.id });
    return row !== undefined;
  }

  async findUnlockedCosmetic(tx: DatabaseTransaction, accountId: bigint, cosmeticId: string): Promise<{ kind: string } | null> {
    const [row] = await tx
      .select({ kind: schema.cosmeticUnlocks.kind })
      .from(schema.cosmeticUnlocks)
      .where(and(eq(schema.cosmeticUnlocks.accountId, accountId), eq(schema.cosmeticUnlocks.cosmeticId, cosmeticId)))
      .for('update');
    return row ?? null;
  }

  async unlockCosmetic(tx: DatabaseTransaction, accountId: bigint, cosmeticId: string, kind: string, source: CosmeticUnlock.Source): Promise<boolean> {
    const [row] = await tx
      .insert(schema.cosmeticUnlocks)
      .values({ accountId, cosmeticId, kind, source })
      .onConflictDoNothing({ target: [schema.cosmeticUnlocks.accountId, schema.cosmeticUnlocks.cosmeticId] })
      .returning({ id: schema.cosmeticUnlocks.id });
    return row !== undefined;
  }

  /**
   * The partial unique index `(account_id, kind) WHERE equipped` is the actual invariant enforcer; the
   * unequip-then-equip pair here just keeps the visible state correct inside the same transaction rather
   * than relying on the constraint to reject a would-be second equip.
   */
  async equipCosmetic(tx: DatabaseTransaction, accountId: bigint, cosmeticId: string, kind: string): Promise<void> {
    await tx
      .update(schema.cosmeticUnlocks)
      .set({ equipped: false })
      .where(and(eq(schema.cosmeticUnlocks.accountId, accountId), eq(schema.cosmeticUnlocks.kind, kind)));
    await tx
      .update(schema.cosmeticUnlocks)
      .set({ equipped: true })
      .where(and(eq(schema.cosmeticUnlocks.accountId, accountId), eq(schema.cosmeticUnlocks.cosmeticId, cosmeticId)));
  }

  async snapshotAchievements(accountId: bigint): Promise<(typeof schema.achievementsEarned.$inferSelect)[]> {
    return this.db.select().from(schema.achievementsEarned).where(eq(schema.achievementsEarned.accountId, accountId));
  }

  async snapshotTitles(accountId: bigint): Promise<(typeof schema.titlesEarned.$inferSelect)[]> {
    return this.db.select().from(schema.titlesEarned).where(eq(schema.titlesEarned.accountId, accountId));
  }

  async snapshotCosmetics(accountId: bigint): Promise<(typeof schema.cosmeticUnlocks.$inferSelect)[]> {
    return this.db.select().from(schema.cosmeticUnlocks).where(eq(schema.cosmeticUnlocks.accountId, accountId));
  }
}
