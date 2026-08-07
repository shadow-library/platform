import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, jsonb, pgEnum, pgTable, smallint, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { templates, templateVersions } from './templates';

export namespace Notification {
  export type Status = InferEnum<typeof notificationStatus>;
  export type Channel = InferEnum<typeof notificationChannel>;
  export type Priority = InferEnum<typeof priority>;
  export type Job = InferSelectModel<typeof notificationJobs>;
  export type Message = InferSelectModel<typeof notificationMessages>;
}

export const priority = pgEnum('priority', ['LOW', 'MEDIUM', 'HIGH']);
export const notificationChannel = pgEnum('notification_channel', ['EMAIL', 'SMS', 'PUSH']);
export const notificationStatus = pgEnum('notification_status', ['PENDING', 'PROCESSING', 'FAILED', 'SENT', 'PERMANENTLY_FAILED']);

export const notificationJobs = pgTable(
  'notification_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    templateId: bigint('template_id', { mode: 'bigint' })
      .notNull()
      .references(() => templates.id, { onDelete: 'restrict' }),
    /** The exact published version resolved at creation, so a retry re-renders identical content even after the template is re-edited. */
    templateVersionId: bigint('template_version_id', { mode: 'bigint' })
      .notNull()
      .references(() => templateVersions.id, { onDelete: 'restrict' }),
    channel: notificationChannel('channel').notNull(),
    locale: varchar('locale', { length: 5 }).notNull(),
    priority: priority('priority').notNull().default('MEDIUM'),
    service: varchar('service', { length: 100 }),

    recipient: varchar('recipient', { length: 500 }).notNull(),
    payload: jsonb('payload'),

    status: notificationStatus('status').notNull(),

    attempt: smallint('attempt').notNull().default(0),
    lastAttemptedAt: timestamp('last_attempted_at'),
    nextAttemptAt: timestamp('next_attempt_at'),
    lastError: varchar('last_error', { length: 2000 }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [index('notification_jobs_status_priority_next_attempt_at_idx').on(t.status, t.priority, t.nextAttemptAt)],
);

export const notificationMessages = pgTable(
  'notification_messages',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    notificationJobId: uuid('notification_job_id')
      .notNull()
      .references(() => notificationJobs.id, { onDelete: 'cascade' }),

    renderedSubject: varchar('rendered_subject', { length: 255 }),
    /** Holds a fully rendered message body; email bodies are branded HTML documents that exceed any practical varchar cap, so this is unbounded text. */
    renderedBody: text('rendered_body').notNull(),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [index('notification_messages_created_at_channel_idx').on(t.createdAt)],
);

export const notificationJobRelations = relations(notificationJobs, ({ one, many }) => ({
  template: one(templates, { fields: [notificationJobs.templateId], references: [templates.id] }),
  templateVersion: one(templateVersions, { fields: [notificationJobs.templateVersionId], references: [templateVersions.id] }),
  messages: many(notificationMessages),
}));

export const notificationMessageRelations = relations(notificationMessages, ({ one }) => ({
  notificationJob: one(notificationJobs, { fields: [notificationMessages.notificationJobId], references: [notificationJobs.id] }),
}));
