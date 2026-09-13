import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, integer, pgEnum, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { projects } from './projects';

export namespace Illustration {
  export type Row = InferSelectModel<typeof illustrations>;
  export type SubjectType = InferEnum<typeof illustrationSubjectType>;
  export type Status = InferEnum<typeof illustrationStatus>;
  export type SaveTarget = 'portrait' | 'gallery' | 'chapter' | 'cover';
  export type Origin = 'generated' | 'uploaded';
  export type ReferenceSource = 'cover' | 'portrait' | 'gallery' | 'chapter-image' | 'candidate';
  export type ReferenceRole = 'likeness' | 'style' | 'edit-source';
  export type ReferenceOrigin = 'auto' | 'attached';

  /** One image sent to the model as a reference, resolved server-side from `source` (+ `sourceId`) to a storage `ref`. */
  export interface Reference {
    source: ReferenceSource;
    sourceId?: string;
    ref: string;
    role: ReferenceRole;
    note?: string;
    origin: ReferenceOrigin;
    /** The auto-rule name that attached this reference, or `'attached'` for a client-chosen one. */
    reason: string;
  }

  /** The composed, editable image prompt. Every regeneration renders its text from this object — never from a concatenated string. */
  export interface PromptSpec {
    basePrompt: string;
    subjectFraming: string;
    styleNotes: string;
    negativePrompt?: string;
    /** The entity's canonical visual description; prepended to every render so re-rolls stay the same character. */
    appearanceAnchor?: string;
    /** True when the composer derived the anchor because the entity carried none — the save flow offers it back to the client. */
    appearanceDerived?: boolean;
    /** Author edits, applied in order. Structured so a refinement can remove or replace one instead of appending forever. */
    instructions: string[];
    promptKey: string;
    promptVersion: string;
  }

  export interface Candidate {
    ref: string;
    createdAt: string;
    /** sha256 of the instruction list that produced this candidate — identifies which revision it belongs to. */
    instructionsHash: string;
    /** Storage refs of the references sent alongside this generation, in the order sent. Backfilled to `[]` for pre-existing candidates by migration 0033. */
    referenceRefs: string[];
  }
}

export const illustrationSubjectType = pgEnum('illustration_subject_type', ['entity', 'chapter', 'cover']);
export const illustrationStatus = pgEnum('illustration_status', ['active', 'saved', 'discarded']);

// One iterative image session, persisted so a saved image can be re-rolled from the exact prompt that
// produced it. `subjectKey` is the entity key for `entity`, the chapter number as text for `chapter`,
// and null for the single project cover.
export const illustrations = pgTable(
  'illustrations',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    subjectType: illustrationSubjectType('subject_type').notNull(),
    subjectKey: varchar('subject_key'),
    status: illustrationStatus('status').notNull().default('active'),
    promptSpec: jsonb('prompt_spec').$type<Illustration.PromptSpec>().notNull(),
    candidates: jsonb('candidates').$type<Illustration.Candidate[]>().notNull(),
    references: jsonb('references').$type<Illustration.Reference[]>().notNull().default([]),
    selectedRef: varchar('selected_ref'),
    revision: integer('revision').notNull().default(1),
    ownerId: bigint('owner_id', { mode: 'bigint' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [index('illustrations_project_id_subject_type_subject_key_idx').on(t.projectId, t.subjectType, t.subjectKey)],
);

export const illustrationsRelations = relations(illustrations, ({ one }) => ({
  project: one(projects, { fields: [illustrations.projectId], references: [projects.id] }),
}));
