/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, customType, index, integer, pgTable, text } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { projects } from './projects';

/**
 * Defining types
 */

export namespace Vector {
  export type ChapterChunk = InferSelectModel<typeof chapterChunks>;
}

/**
 * Declaring the constants
 */

const EMBEDDING_DIM = 1024;

function vectorType(dimensions: number) {
  return customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: string): number[] {
      return value.slice(1, -1).split(',').map(Number);
    },
  });
}

export const chapterChunks = pgTable(
  'chapter_chunks',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    chunkIdx: integer('chunk_idx').notNull(),
    text: text('text').notNull(),
    embedding: vectorType(EMBEDDING_DIM)('embedding'),
  },
  t => [index('chapter_chunks_project_id_chapter_idx').on(t.projectId, t.chapter)],
);

export const chapterChunksRelations = relations(chapterChunks, ({ one }) => ({
  project: one(projects, { fields: [chapterChunks.projectId], references: [projects.id] }),
}));
