import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { projects } from './projects';

export type UnlockTerm = { milestone: string } | { volume: string } | { chapter: number } | { ending: true };

/** A conjunction: the fact unlocks once every term holds. */
export interface UnlockCondition {
  all: UnlockTerm[];
}

export namespace Knowledge {
  export type Entity = InferSelectModel<typeof entities>;
  export type EntityImage = InferSelectModel<typeof entityImages>;
  export type EntityAlias = InferSelectModel<typeof entityAliases>;
  export type EntityRelationship = InferSelectModel<typeof entityRelationships>;
  export type EntityAppearance = InferSelectModel<typeof entityAppearances>;
  export type CanonFact = InferSelectModel<typeof canonFacts>;
  export type CharacterKnowledge = InferSelectModel<typeof characterKnowledge>;
  export type CharacterState = InferSelectModel<typeof characterStates>;
  export type EntityType = InferEnum<typeof entityType>;
  export type EntitySignificance = InferEnum<typeof entitySignificance>;
  export type EntityOrigin = InferEnum<typeof entityOrigin>;
  export type EntityWikiVisibility = InferEnum<typeof entityWikiVisibility>;
  export type FactSource = InferEnum<typeof factSource>;
  export type Milestone = InferSelectModel<typeof milestones>;
  export type MilestoneKind = InferEnum<typeof milestoneKind>;
  export type MilestoneState = InferEnum<typeof milestoneState>;
  export type KnowledgeStatus = InferEnum<typeof knowledgeStatus>;
  export type CharacterEvent = InferSelectModel<typeof characterEvents>;
  export type CharacterEventKind = InferEnum<typeof characterEventKind>;
  export type CharacterEventSource = InferEnum<typeof characterEventSource>;
}

export const entityType = pgEnum('entity_type', ['character', 'faction', 'location', 'power_rule', 'item', 'concept']);
export const factSource = pgEnum('fact_source', ['brief', 'manual', 'import', 'seed', 'generated']);
export const entitySignificance = pgEnum('entity_significance', ['major', 'minor']);
export const entityOrigin = pgEnum('entity_origin', ['extracted', 'seeded', 'generated']);
export const milestoneKind = pgEnum('milestone_kind', ['rank', 'event', 'learned_from', 'custom']);
export const milestoneState = pgEnum('milestone_state', ['open', 'planned', 'reached']);
export const knowledgeStatus = pgEnum('knowledge_status', ['provisional', 'committed']);
// Every value has a durable canon source `applyContinuityDelta` already writes: `state` mirrors `character_states`,
// `appearance` mirrors `entity_appearances`, `relationship` mirrors `entity_relationships`. `power` and `knowledge`
// changes are deliberately not persisted anywhere yet (see `apply-continuity.ts`), so no event kind stands for them.
export const characterEventKind = pgEnum('character_event_kind', ['state', 'appearance', 'relationship']);
export const characterEventSource = pgEnum('character_event_source', ['continuity', 'backfill', 'manual']);

// Author opt-out for the reader wiki: `default` projects the entity to the published wiki (spoiler-gated
// per fragment), `hidden` withholds it entirely — a flipped-to-hidden entity is deleted from the reader
// on the next converge.
export const entityWikiVisibility = pgEnum('entity_wiki_visibility', ['default', 'hidden']);

export const entities = pgTable(
  'entities',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    entityKey: varchar('entity_key').notNull(),
    type: entityType('type').notNull(),
    name: varchar('name').notNull(),
    attributes: jsonb('attributes'),
    significance: entitySignificance('significance'),
    firstSeenChapter: integer('first_seen_chapter'),
    status: varchar('status'),
    origin: entityOrigin('origin'),
    notes: text('notes'),
    motivation: text('motivation'),
    body: text('body'),
    // The canonical visual description. When set it anchors every generated image for this entity, so
    // re-rolls and refinements keep producing the same character rather than a new one each time.
    appearance: text('appearance'),
    imagePath: varchar('image_path'),
    // The chapter the portrait shows the entity as of; null for a portrait that predates dating.
    imageDepictsChapter: integer('image_depicts_chapter'),
    wikiVisibility: entityWikiVisibility('wiki_visibility').notNull().default('default'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('entities_project_id_entity_key_unique').on(t.projectId, t.entityKey), index('entities_project_id_type_idx').on(t.projectId, t.type)],
);

// Additional reference images for an entity — a gallery that complements the single `imagePath` portrait.
export const entityImages = pgTable(
  'entity_images',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    entityId: bigint('entity_id', { mode: 'bigint' })
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    imagePath: varchar('image_path').notNull(),
    caption: varchar('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    depictsChapter: integer('depicts_chapter'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [index('entity_images_entity_id_idx').on(t.entityId)],
);

export const entityAliases = pgTable(
  'entity_aliases',
  {
    entityId: bigint('entity_id', { mode: 'bigint' })
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    alias: varchar('alias').notNull(),
  },
  t => [primaryKey({ columns: [t.entityId, t.alias] })],
);

export const entityRelationships = pgTable(
  'entity_relationships',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' }).notNull(),
    entityId: bigint('entity_id', { mode: 'bigint' })
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    targetKey: varchar('target_key').notNull(),
    kind: varchar('kind').notNull(),
    note: text('note'),
    chapter: integer('chapter'),
  },
  t => [unique().on(t.projectId, t.entityId, t.targetKey, t.kind, t.chapter)],
);

export const entityAppearances = pgTable(
  'entity_appearances',
  {
    entityId: bigint('entity_id', { mode: 'bigint' })
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'bigint' }).notNull(),
    chapter: integer('chapter').notNull(),
    firstChapter: integer('first_chapter'),
    lastChapter: integer('last_chapter'),
    seenChapters: jsonb('seen_chapters'),
  },
  t => [primaryKey({ columns: [t.entityId, t.chapter] })],
);

// Spoiler-grade canon lives here, never in bible prose or entity sheets: the drafter only ever sees a fact's `text` once the POV cast has ledgered it.
// While hidden, the drafter sees `writerNote` alone (nothing when it is null); `constraintNote` is author-only and `terms` feeds the deterministic leak scan.
export const canonFacts = pgTable(
  'canon_facts',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    factKey: varchar('fact_key').notNull(),
    text: text('text').notNull(),
    subjects: jsonb('subjects').$type<string[]>(),
    constraintNote: text('constraint_note'),
    writerNote: text('writer_note'),
    terms: jsonb('terms').$type<string[]>(),
    revealChapter: integer('reveal_chapter'),
    unlock: jsonb('unlock').$type<UnlockCondition>(),
    /** Provisional: the chapter whose plan currently schedules the reveal. */
    plannedChapter: integer('planned_chapter'),
    /** Set only when the disclosing chapter is finalized; planning never writes it. */
    disclosedInChapter: integer('disclosed_in_chapter'),
    /** Observable effects the writer may show while the explanation stays locked. */
    allowedClues: jsonb('allowed_clues').$type<string[]>(),
    source: factSource('source').notNull().default('manual'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('canon_facts_project_id_fact_key_unique').on(t.projectId, t.factKey)],
);

// The knowledge ledger: which character knows which fact, and since which chapter. Populated
// deterministically from brief `learns` declarations at draft approval, never by AI extraction.
export const characterKnowledge = pgTable(
  'character_knowledge',
  {
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    factId: bigint('fact_id', { mode: 'bigint' })
      .notNull()
      .references(() => canonFacts.id, { onDelete: 'cascade' }),
    entityId: bigint('entity_id', { mode: 'bigint' })
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    learnedInChapter: integer('learned_in_chapter').notNull(),
    source: factSource('source').notNull().default('manual'),
    note: text('note'),
    status: knowledgeStatus('status').notNull().default('committed'),
    /** The approved draft revision a provisional row is bound to. */
    draftRevision: integer('draft_revision'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.factId, t.entityId] }), index('character_knowledge_project_id_idx').on(t.projectId)],
);

export const milestones = pgTable(
  'milestones',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    milestoneKey: varchar('milestone_key').notNull(),
    label: varchar('label', { length: 500 }).notNull(),
    subjectEntityKey: varchar('subject_entity_key'),
    kind: milestoneKind('kind').notNull().default('custom'),
    state: milestoneState('state').notNull().default('open'),
    plannedChapter: integer('planned_chapter'),
    reachedChapter: integer('reached_chapter'),
    boundRevision: integer('bound_revision'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('milestones_project_id_milestone_key_unique').on(t.projectId, t.milestoneKey)],
);

// Each character's current dynamic state as of the most recently finalized chapter — location, conditions,
// immediate goal, a one-line status note. One row per project/entity: `statusNote` is replaced, not appended.
export const characterStates = pgTable(
  'character_states',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    entityKey: varchar('entity_key').notNull(),
    location: varchar('location'),
    conditions: jsonb('conditions').$type<string[]>(),
    immediateGoal: text('immediate_goal'),
    statusNote: text('status_note'),
    lastUpdatedChapter: integer('last_updated_chapter').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('character_states_project_id_entity_key_unique').on(t.projectId, t.entityKey)],
);

// Per-chapter history behind "How <name> has changed": one row per entity per chapter per changed kind, replayed
// in chapter order. `detailKey` distinguishes multiple events of the same kind in one chapter (a relationship
// event's target+kind) and is `''` where a kind is already one-per-chapter. `status`/`draftRevision` mirror
// `character_knowledge` (T05) for a provisional row bound to an approval and dropped by `revokeProvisionalReveals`
// on revise — `applyContinuityDelta` writes `committed` today since it only runs once a chapter is already
// finalized; the manual propose→apply path can commit from an unapproved draft, which is fine for now since
// nothing here is provisional yet. T26's event-apply service is what will actually write `provisional` rows.
export const characterEvents = pgTable(
  'character_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    entityId: bigint('entity_id', { mode: 'bigint' })
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    kind: characterEventKind('kind').notNull(),
    detailKey: varchar('detail_key').notNull().default(''),
    before: jsonb('before'),
    after: jsonb('after'),
    source: characterEventSource('source').notNull().default('continuity'),
    status: knowledgeStatus('status').notNull().default('committed'),
    draftRevision: integer('draft_revision'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [
    unique('character_events_project_id_entity_id_chapter_kind_detail_unique').on(t.projectId, t.entityId, t.chapter, t.kind, t.detailKey),
    index('character_events_project_id_entity_id_idx').on(t.projectId, t.entityId, t.chapter),
  ],
);

export const characterEventsRelations = relations(characterEvents, ({ one }) => ({
  project: one(projects, { fields: [characterEvents.projectId], references: [projects.id] }),
  entity: one(entities, { fields: [characterEvents.entityId], references: [entities.id] }),
}));

export const entitiesRelations = relations(entities, ({ one, many }) => ({
  project: one(projects, { fields: [entities.projectId], references: [projects.id] }),
  images: many(entityImages),
  aliases: many(entityAliases),
  relationships: many(entityRelationships),
  appearances: many(entityAppearances),
}));

export const entityImagesRelations = relations(entityImages, ({ one }) => ({
  entity: one(entities, { fields: [entityImages.entityId], references: [entities.id] }),
}));

export const entityAliasesRelations = relations(entityAliases, ({ one }) => ({
  entity: one(entities, { fields: [entityAliases.entityId], references: [entities.id] }),
}));

export const entityRelationshipsRelations = relations(entityRelationships, ({ one }) => ({
  entity: one(entities, { fields: [entityRelationships.entityId], references: [entities.id] }),
}));

export const entityAppearancesRelations = relations(entityAppearances, ({ one }) => ({
  entity: one(entities, { fields: [entityAppearances.entityId], references: [entities.id] }),
}));

export const canonFactsRelations = relations(canonFacts, ({ one, many }) => ({
  project: one(projects, { fields: [canonFacts.projectId], references: [projects.id] }),
  knowledge: many(characterKnowledge),
}));

export const characterKnowledgeRelations = relations(characterKnowledge, ({ one }) => ({
  fact: one(canonFacts, { fields: [characterKnowledge.factId], references: [canonFacts.id] }),
  entity: one(entities, { fields: [characterKnowledge.entityId], references: [entities.id] }),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  project: one(projects, { fields: [milestones.projectId], references: [projects.id] }),
}));

export const characterStatesRelations = relations(characterStates, ({ one }) => ({
  project: one(projects, { fields: [characterStates.projectId], references: [projects.id] }),
}));
