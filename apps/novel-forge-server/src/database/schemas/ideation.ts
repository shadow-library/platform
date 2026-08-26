import { InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { projects } from './projects';

export namespace Ideation {
  export type StorySeed = InferSelectModel<typeof storySeeds>;

  export type FieldKey = keyof SeedFields;
  export type FieldSource = 'author' | 'studio' | 'crossed';
  export type ConstraintKind = 'shape' | 'scope' | 'promise';
  export type ConstraintLockedBy = 'author' | 'inferred';
  /** `offered` is the state a freshly generated card sits in until the author reacts to it. */
  export type ConceptFate = 'offered' | 'kept' | 'killed' | 'crossed';
  export type ReadinessVerdict = 'strong' | 'thin' | 'empty';

  /**
   * The sheet — idea altitude only. No field holds places, chapter structure, or volume detail;
   * `serializationNotes` stays short prose rather than a plan (ideation-studio design §2.2).
   */
  export interface SeedFields {
    genre?: string;
    themes?: string[];
    premise?: string;
    hook?: string;
    /** Lead count plus configuration — 'one lead', 'dual leads, bonded', an ensemble of four. */
    castShape?: string;
    progressionSystem?: string;
    protagonistDrive?: string;
    stakes?: string;
    serializationNotes?: string;
    voice?: string;
    workingTitle?: string;
  }

  export interface FieldProvenance {
    /** Who decided the field: the author, the studio's own suggestion, or a crossed concept card. */
    source: FieldSource;
    /** The chat ordinal that settled it, so the graduation screen can report how recent the decision is; null when no conversational turn settled it. */
    turnOrdinal: number | null;
  }

  export type SeedProvenance = Partial<Record<FieldKey, FieldProvenance>>;

  export interface SeedConstraint {
    key: string;
    kind: ConstraintKind;
    text: string;
    /** The matching constraint playbook, absent when nothing in the library recognised the constraint. */
    playbookKey?: string;
    lockedBy: ConstraintLockedBy;
  }

  export interface TasteAnchors {
    /** Comparable works the author named at the Taste stage. */
    comps: string[];
    /** The preferences derived from those comps, in editor terms. */
    preferences: string[];
  }

  export interface ConceptCard {
    round: number;
    title: string;
    logline: string;
    engine: string;
    ladder: string;
    posture: string;
    fate: ConceptFate;
    reason?: string;
  }

  export interface ReadinessEntry {
    dimension: string;
    verdict: ReadinessVerdict;
    note: string;
    fix?: string;
  }
}

// One row per seed project, alive only while the project is in `seed` status — graduation folds its
// content into the project and bible documents and deletes the row (ideation-studio design §2.2/§5).
// `revision` + `contentHash` make the sheet an ordinary artifact for the proposal engine's baseline
// and conflict machinery.
export const storySeeds = pgTable(
  'story_seeds',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    fields: jsonb('fields').$type<Ideation.SeedFields>(),
    provenance: jsonb('provenance').$type<Ideation.SeedProvenance>(),
    constraints: jsonb('constraints').$type<Ideation.SeedConstraint[]>(),
    tasteAnchors: jsonb('taste_anchors').$type<Ideation.TasteAnchors>(),
    concepts: jsonb('concepts').$type<Ideation.ConceptCard[]>(),
    readiness: jsonb('readiness').$type<Ideation.ReadinessEntry[]>(),
    askedQuestions: jsonb('asked_questions').$type<string[]>(),
    revision: integer('revision').notNull().default(1),
    contentHash: text('content_hash'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('story_seeds_project_id_unique').on(t.projectId)],
);

export const storySeedsRelations = relations(storySeeds, ({ one }) => ({
  project: one(projects, { fields: [storySeeds.projectId], references: [projects.id] }),
}));
