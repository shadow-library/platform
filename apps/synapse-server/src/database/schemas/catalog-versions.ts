import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import { bigserial, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';

export namespace Catalog {
  export type Version = InferSelectModel<typeof catalogVersions>;
  export type State = InferEnum<typeof catalogState>;
}

export const catalogState = pgEnum('catalog_state', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);

export const catalogVersions = pgTable(
  'catalog_versions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    version: integer('version').notNull().unique(),
    state: catalogState('state').notNull().default('DRAFT'),
    document: jsonb('document').notNull(),
    note: text('note'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  t => [
    uniqueIndex('catalog_versions_single_draft_idx')
      .on(t.state)
      .where(sql`state = 'DRAFT'`),
  ],
);
