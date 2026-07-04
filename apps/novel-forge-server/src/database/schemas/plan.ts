/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { projects } from './projects';

/**
 * Defining types
 */

export namespace Plan {
  export type Volume = InferSelectModel<typeof volumes>;
  export type Status = InferEnum<typeof planStatus>;
}

/**
 * Declaring the constants
 */

export const planStatus = pgEnum('plan_status', ['draft', 'approved', 'source']);

export const volumes = pgTable(
  'volumes',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    volumeKey: varchar('volume_key').notNull(),
    ordinal: integer('ordinal').notNull().default(0),
    title: varchar('title', { length: 500 }),
    objective: text('objective'),
    conflict: text('conflict'),
    payoff: text('payoff'),
    startChapter: integer('start_chapter'),
    endChapter: integer('end_chapter'),
    status: planStatus('status').notNull().default('draft'),
    cast: jsonb('cast'),
    body: text('body'),
    epitome: text('epitome'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('volumes_project_id_volume_key_unique').on(t.projectId, t.volumeKey), index('volumes_project_id_ordinal_idx').on(t.projectId, t.ordinal)],
);

export const volumesRelations = relations(volumes, ({ one }) => ({
  project: one(projects, { fields: [volumes.projectId], references: [projects.id] }),
}));
