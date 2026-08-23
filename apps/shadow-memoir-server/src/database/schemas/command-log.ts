import { type InferEnum, type InferSelectModel } from 'drizzle-orm';
import { bigint, index, pgEnum, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { accounts } from './accounts';
import { devices } from './devices';

export namespace CommandLog {
  export type Row = InferSelectModel<typeof commandLog>;
  export type Status = InferEnum<typeof commandStatus>;
}

export const commandStatus = pgEnum('command_status', ['applied', 'rejected', 'superseded']);

export const commandLog = pgTable(
  'command_log',
  {
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    commandId: uuid('command_id').notNull(),
    type: varchar('type', { length: 64 }).notNull(),
    status: commandStatus('status').notNull(),
    result: jsonb('result'),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [primaryKey({ name: 'command_log_account_id_command_id_pk', columns: [t.accountId, t.commandId] }), index('command_log_applied_at_idx').on(t.appliedAt)],
);
