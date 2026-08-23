import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { projects } from './projects';

export namespace Story {
  export type Beat = InferSelectModel<typeof beats>;
  export type PlotThread = InferSelectModel<typeof plotThreads>;
  export type WorldFact = InferSelectModel<typeof worldFacts>;
  export type Mystery = InferSelectModel<typeof mysteries>;
  export type ThreadStatus = InferEnum<typeof threadStatus>;
  export type MysteryStatus = InferEnum<typeof mysteryStatus>;
}

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
    // The most recent chapter whose continuity extraction named this thread — distinct from
    // openedChapter/closedChapter, which only mark the endpoints. Drives dormant-thread detection.
    lastAdvancedChapter: integer('last_advanced_chapter'),
    // A single target chapter the thread is expected to pay off by. No automated writer yet — purely
    // additive for future outliner/arc-plan authoring; the dormant-thread report uses it when present.
    payoffWindow: integer('payoff_window'),
    // Marked by the outliner/continuity-extraction as a deliberate running thread, not an oversight —
    // novel-validation must not flag it as an unresolved-thread issue while this is true.
    intentionallyOpen: boolean('intentionally_open').notNull().default(false),
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
    // The canon_facts.factKey holding the mystery's answer — a loose key like every other entity/fact
    // reference here, deliberately not an FK so a mystery can name its truth before the fact exists.
    truthFactKey: varchar('truth_fact_key'),
    // The most recent chapter whose continuity extraction named this mystery — see plotThreads.lastAdvancedChapter.
    lastAdvancedChapter: integer('last_advanced_chapter'),
    // A single target chapter the mystery is expected to pay off by — see plotThreads.payoffWindow.
    payoffWindow: integer('payoff_window'),
    // Marked by the outliner/continuity-extraction as a deliberate running mystery, not an oversight —
    // novel-validation must not flag it as an unresolved-mystery issue while this is true.
    intentionallyOpen: boolean('intentionally_open').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('mysteries_project_id_mystery_key_unique').on(t.projectId, t.mysteryKey)],
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
