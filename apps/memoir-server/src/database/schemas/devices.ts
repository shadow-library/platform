import { type InferSelectModel } from 'drizzle-orm';
import { bigint, boolean, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { accounts } from './accounts';

export namespace Device {
  export type Row = InferSelectModel<typeof devices>;
}

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userAgent: varchar('user_agent', { length: 300 }),
    pushSubscription: jsonb('push_subscription'),
    pushOptIn: boolean('push_opt_in').notNull().default(false),
    reminderPrefs: jsonb('reminder_prefs'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    lastSyncSeq: bigint('last_sync_seq', { mode: 'bigint' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index('devices_account_id_idx').on(t.accountId)],
);
