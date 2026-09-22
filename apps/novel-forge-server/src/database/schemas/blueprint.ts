import { InferEnum, InferInsertModel, InferSelectModel, relations, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { jobs } from './jobs';
import { jsonb } from './jsonb';
import { projects } from './projects';

export namespace Blueprint {
  export type Round = InferSelectModel<typeof blueprintRounds>;
  export type NewRound = InferInsertModel<typeof blueprintRounds>;
  export type RoundStatus = InferEnum<typeof blueprintRoundStatus>;
  export type FeedbackVerdict = 'more' | 'not' | 'mix';

  export interface OptionFeedback {
    optionId: string;
    verdict: FeedbackVerdict;
    reason?: string;
  }
}

export const blueprintRoundStatus = pgEnum('blueprint_round_status', ['pending', 'running', 'ready', 'failed', 'cancelled']);

export const blueprintRounds = pgTable(
  'blueprint_rounds',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    stepKey: varchar('step_key', { length: 60 }).notNull(),
    round: integer('round').notNull(),
    status: blueprintRoundStatus('status').notNull().default('pending'),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    steer: text('steer'),
    nudges: jsonb('nudges')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    keepAsDirection: boolean('keep_as_direction').notNull().default(false),
    feedback: jsonb('feedback')
      .$type<Blueprint.OptionFeedback[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    input: jsonb('input'),
    focus: varchar('focus', { length: 60 }),
    options: jsonb('options'),
    coachMessage: text('coach_message'),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [
    unique('blueprint_rounds_project_id_step_key_round_unique').on(t.projectId, t.stepKey, t.round),
    uniqueIndex('blueprint_rounds_one_active_per_step_idx')
      .on(t.projectId, t.stepKey)
      .where(sql`${t.status} IN ('pending', 'running')`),
    index('blueprint_rounds_job_id_idx').on(t.jobId),
  ],
);

export const blueprintRoundsRelations = relations(blueprintRounds, ({ one }) => ({
  project: one(projects, { fields: [blueprintRounds.projectId], references: [projects.id] }),
}));
