import { type InferEnum, type InferSelectModel } from 'drizzle-orm';
import { bigint, bigserial, pgEnum, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { accounts } from './accounts';

export namespace AchievementEarned {
  export type Row = InferSelectModel<typeof achievementsEarned>;
}

export namespace TitleEarned {
  export type Row = InferSelectModel<typeof titlesEarned>;
}

export namespace CosmeticUnlock {
  export type Row = InferSelectModel<typeof cosmeticUnlocks>;
  export type Source = InferEnum<typeof cosmeticSource>;
}

export const cosmeticSource = pgEnum('cosmetic_source', ['coin', 'achievement']);

export const achievementsEarned = pgTable(
  'achievements_earned',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    achievementId: varchar('achievement_id', { length: 64 }).notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('achievements_earned_account_id_achievement_id_unique').on(t.accountId, t.achievementId)],
);

export const titlesEarned = pgTable(
  'titles_earned',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    titleId: varchar('title_id', { length: 64 }).notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('titles_earned_account_id_title_id_unique').on(t.accountId, t.titleId)],
);

export const cosmeticUnlocks = pgTable(
  'cosmetic_unlocks',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    cosmeticId: varchar('cosmetic_id', { length: 64 }).notNull(),
    source: cosmeticSource('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('cosmetic_unlocks_account_id_cosmetic_id_unique').on(t.accountId, t.cosmeticId)],
);
