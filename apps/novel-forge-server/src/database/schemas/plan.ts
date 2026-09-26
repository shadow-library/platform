import { InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, integer, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { projects } from './projects';

export namespace Plan {
  export type Volume = InferSelectModel<typeof volumes>;
}

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
    body: text('body'),
    revision: integer('revision').notNull().default(1),
    contentHash: varchar('content_hash'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('volumes_project_id_volume_key_unique').on(t.projectId, t.volumeKey), index('volumes_project_id_ordinal_idx').on(t.projectId, t.ordinal)],
);

export const volumesRelations = relations(volumes, ({ one }) => ({
  project: one(projects, { fields: [volumes.projectId], references: [projects.id] }),
}));
