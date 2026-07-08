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
  export type EntityAlias = InferSelectModel<typeof entityAliases>;
  export type EntityRelationship = InferSelectModel<typeof entityRelationships>;
  export type EntityAppearance = InferSelectModel<typeof entityAppearances>;
  export type RelationshipObservation = InferSelectModel<typeof relationshipObservations>;
  export type EntityType = InferEnum<typeof entityType>;
  export type EntitySignificance = InferEnum<typeof entitySignificance>;
  export type EntityOrigin = InferEnum<typeof entityOrigin>;
}

/**
 * Declaring the constants
 */

export const entityType = pgEnum('entity_type', ['character', 'faction', 'location', 'power_rule', 'item', 'concept']);
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

export const entitiesRelations = relations(entities, ({ one, many }) => ({
  project: one(projects, { fields: [entities.projectId], references: [projects.id] }),
  aliases: many(entityAliases),
  relationships: many(entityRelationships),
  appearances: many(entityAppearances),
  observations: many(relationshipObservations),
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
