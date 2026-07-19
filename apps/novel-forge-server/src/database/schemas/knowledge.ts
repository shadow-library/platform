/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { jsonb } from './jsonb';
import { projects } from './projects';

/**
 * Defining types
 */

export namespace Knowledge {
  export type Entity = InferSelectModel<typeof entities>;
  export type EntityImage = InferSelectModel<typeof entityImages>;
  export type EntityAlias = InferSelectModel<typeof entityAliases>;
  export type EntityRelationship = InferSelectModel<typeof entityRelationships>;
  export type EntityAppearance = InferSelectModel<typeof entityAppearances>;
  export type RelationshipObservation = InferSelectModel<typeof relationshipObservations>;
  export type CanonFact = InferSelectModel<typeof canonFacts>;
  export type CharacterKnowledge = InferSelectModel<typeof characterKnowledge>;
  export type EntityType = InferEnum<typeof entityType>;
  export type EntitySignificance = InferEnum<typeof entitySignificance>;
  export type EntityOrigin = InferEnum<typeof entityOrigin>;
  export type FactSource = InferEnum<typeof factSource>;
}

/**
 * Declaring the constants
 */

export const entityType = pgEnum('entity_type', ['character', 'faction', 'location', 'power_rule', 'item', 'concept']);
export const factSource = pgEnum('fact_source', ['brief', 'manual', 'import']);
export const entitySignificance = pgEnum('entity_significance', ['major', 'minor']);
export const entityOrigin = pgEnum('entity_origin', ['extracted', 'seeded', 'generated']);

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
    imagePath: varchar('image_path'),
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

export const relationshipObservations = pgTable(
  'relationship_observations',
  {
    entityId: bigint('entity_id', { mode: 'bigint' })
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'bigint' }).notNull(),
    targetKey: varchar('target_key').notNull(),
    kind: varchar('kind').notNull(),
    chapter: integer('chapter').notNull(),
    note: text('note'),
  },
  t => [primaryKey({ columns: [t.entityId, t.targetKey, t.kind, t.chapter] })],
);

// Spoiler-grade canon lives here, never in bible prose or entity sheets (character-knowledge design
// §1): the drafter only ever sees a fact's `text` once the POV cast has ledgered it. While hidden,
// `constraintNote` supplies POV-safe behavior and `terms` feeds the deterministic leak scan.
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
    terms: jsonb('terms').$type<string[]>(),
    revealChapter: integer('reveal_chapter'),
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
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.factId, t.entityId] }), index('character_knowledge_project_id_idx').on(t.projectId)],
);

export const entitiesRelations = relations(entities, ({ one, many }) => ({
  project: one(projects, { fields: [entities.projectId], references: [projects.id] }),
  images: many(entityImages),
  aliases: many(entityAliases),
  relationships: many(entityRelationships),
  appearances: many(entityAppearances),
  observations: many(relationshipObservations),
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

export const relationshipObservationsRelations = relations(relationshipObservations, ({ one }) => ({
  entity: one(entities, { fields: [relationshipObservations.entityId], references: [entities.id] }),
}));

export const canonFactsRelations = relations(canonFacts, ({ one, many }) => ({
  project: one(projects, { fields: [canonFacts.projectId], references: [projects.id] }),
  knowledge: many(characterKnowledge),
}));

export const characterKnowledgeRelations = relations(characterKnowledge, ({ one }) => ({
  fact: one(canonFacts, { fields: [characterKnowledge.factId], references: [canonFacts.id] }),
  entity: one(entities, { fields: [characterKnowledge.entityId], references: [entities.id] }),
}));
