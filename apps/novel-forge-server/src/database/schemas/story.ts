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

export namespace Story {
  export type Beat = InferSelectModel<typeof beats>;
  export type PlotThread = InferSelectModel<typeof plotThreads>;
  export type WorldFact = InferSelectModel<typeof worldFacts>;
  export type Mystery = InferSelectModel<typeof mysteries>;
  export type TimelineEvent = InferSelectModel<typeof timelineEvents>;
  export type PowerProgression = InferSelectModel<typeof powerProgressions>;
  export type ThreadStatus = InferEnum<typeof threadStatus>;
  export type MysteryStatus = InferEnum<typeof mysteryStatus>;
}

/**
 * Declaring the constants
 */

export const threadStatus = pgEnum('thread_status', ['open', 'closed']);
export const mysteryStatus = pgEnum('mystery_status', ['open', 'resolved']);

export const beats = pgTable(
  'beats',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    beatKey: varchar('beat_key').notNull(),
    chapter: integer('chapter').notNull(),
    beatType: varchar('beat_type'),
    summary: text('summary'),
    entities: jsonb('entities'),
    opensThreads: jsonb('opens_threads'),
    closesThreads: jsonb('closes_threads'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [unique('beats_project_id_beat_key_unique').on(t.projectId, t.beatKey), index('beats_project_id_chapter_idx').on(t.projectId, t.chapter)],
);

export const plotThreads = pgTable(
  'plot_threads',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    threadKey: varchar('thread_key').notNull(),
    status: threadStatus('status').notNull(),
    openedChapter: integer('opened_chapter'),
    closedChapter: integer('closed_chapter'),
    summary: text('summary'),
    owner: varchar('owner'),
    payoff: text('payoff'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('plot_threads_project_id_thread_key_unique').on(t.projectId, t.threadKey)],
);

export const worldFacts = pgTable(
  'world_facts',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    category: varchar('category').notNull(),
    key: varchar('key').notNull(),
    value: text('value').notNull(),
    chapter: integer('chapter'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('world_facts_project_id_category_key_unique').on(t.projectId, t.category, t.key), index('world_facts_project_id_category_idx').on(t.projectId, t.category)],
);

export const mysteries = pgTable(
  'mysteries',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    mysteryKey: varchar('mystery_key').notNull(),
    question: text('question').notNull(),
    status: mysteryStatus('status').notNull(),
    openedChapter: integer('opened_chapter'),
    resolvedChapter: integer('resolved_chapter'),
    knownTo: varchar('known_to'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('mysteries_project_id_mystery_key_unique').on(t.projectId, t.mysteryKey)],
);

export const timelineEvents = pgTable('timeline_events', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  projectId: bigint('project_id', { mode: 'bigint' })
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  whenText: varchar('when_text'),
  event: text('event').notNull(),
  chapter: integer('chapter'),
  significance: text('significance'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const powerProgressions = pgTable(
  'power_progressions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    character: varchar('character'),
    stage: varchar('stage'),
    chapter: integer('chapter'),
    feat: text('feat'),
    next: text('next'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [unique('power_progressions_project_id_character_chapter_unique').on(t.projectId, t.character, t.chapter)],
);

export const beatsRelations = relations(beats, ({ one }) => ({
  project: one(projects, { fields: [beats.projectId], references: [projects.id] }),
}));

export const plotThreadsRelations = relations(plotThreads, ({ one }) => ({
  project: one(projects, { fields: [plotThreads.projectId], references: [projects.id] }),
}));

export const worldFactsRelations = relations(worldFacts, ({ one }) => ({
  project: one(projects, { fields: [worldFacts.projectId], references: [projects.id] }),
}));

export const mysteriesRelations = relations(mysteries, ({ one }) => ({
  project: one(projects, { fields: [mysteries.projectId], references: [projects.id] }),
}));

export const timelineEventsRelations = relations(timelineEvents, ({ one }) => ({
  project: one(projects, { fields: [timelineEvents.projectId], references: [projects.id] }),
}));

export const powerProgressionsRelations = relations(powerProgressions, ({ one }) => ({
  project: one(projects, { fields: [powerProgressions.projectId], references: [projects.id] }),
}));
