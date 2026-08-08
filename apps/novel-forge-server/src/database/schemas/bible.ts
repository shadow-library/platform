import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, integer, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { projects } from './projects';

export namespace Bible {
  export type Document = InferSelectModel<typeof bibleDocuments>;
  export type Section = InferEnum<typeof bibleSection>;
}

export const bibleSection = pgEnum('bible_section', ['project', 'world', 'power', 'plot', 'story_state', 'ai', 'lore']);

export const bibleDocuments = pgTable(
  'bible_documents',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    section: bibleSection('section').notNull(),
    slug: varchar('slug').notNull(),
    frontmatter: jsonb('frontmatter').$type<Record<string, unknown>>(),
    body: text('body'),
    // Monotonic revision + content hash so dependents can detect when canon they were validated against changed.
    revision: integer('revision').notNull().default(1),
    contentHash: varchar('content_hash'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('bible_documents_project_id_section_slug_unique').on(t.projectId, t.section, t.slug)],
);

export const bibleDocumentsRelations = relations(bibleDocuments, ({ one }) => ({
  project: one(projects, { fields: [bibleDocuments.projectId], references: [projects.id] }),
}));
