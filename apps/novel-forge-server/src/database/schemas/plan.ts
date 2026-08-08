import { InferEnum, InferSelectModel, relations, sql } from 'drizzle-orm';
import { bigint, bigserial, check, index, integer, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { projects } from './projects';

export namespace Plan {
  export type Volume = InferSelectModel<typeof volumes>;
  export type Arc = InferSelectModel<typeof arcs>;
  export type Status = InferEnum<typeof planStatus>;
}

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
    targetChapterCount: integer('target_chapter_count'),
    status: planStatus('status').notNull().default('draft'),
    cast: jsonb('cast').$type<string[]>(),
    body: text('body'),
    epitome: text('epitome'),
    revision: integer('revision').notNull().default(1),
    contentHash: varchar('content_hash'),
    staleReason: varchar('stale_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('volumes_project_id_volume_key_unique').on(t.projectId, t.volumeKey), index('volumes_project_id_ordinal_idx').on(t.projectId, t.ordinal)],
);

export const arcs = pgTable(
  'arcs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    arcKey: varchar('arc_key').notNull(),
    volumeKey: varchar('volume_key').notNull(),
    ordinal: integer('ordinal').notNull().default(0),
    title: varchar('title', { length: 500 }),
    objective: text('objective'),
    escalation: text('escalation'),
    payoff: text('payoff'),
    hook: text('hook'),
    // Absolute chapter numbers; containment inside the parent volume's range is a service-level check
    // because volumeKey is a loose key (same convention as briefs.volumeKey), not a FK with range data.
    chapterStart: integer('chapter_start'),
    chapterEnd: integer('chapter_end'),
    cast: jsonb('cast').$type<string[]>(),
    status: planStatus('status').notNull().default('draft'),
    body: text('body'),
    revision: integer('revision').notNull().default(1),
    contentHash: varchar('content_hash'),
    staleReason: varchar('stale_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [
    unique('arcs_project_id_arc_key_unique').on(t.projectId, t.arcKey),
    index('arcs_project_id_volume_key_ordinal_idx').on(t.projectId, t.volumeKey, t.ordinal),
    check('arcs_chapter_range_check', sql`${t.chapterStart} <= ${t.chapterEnd}`),
  ],
);

export const volumesRelations = relations(volumes, ({ one }) => ({
  project: one(projects, { fields: [volumes.projectId], references: [projects.id] }),
}));

export const arcsRelations = relations(arcs, ({ one }) => ({
  project: one(projects, { fields: [arcs.projectId], references: [projects.id] }),
}));
