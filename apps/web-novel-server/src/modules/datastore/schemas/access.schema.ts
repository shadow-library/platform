import { InferSelectModel } from 'drizzle-orm';
import { bigint, index, pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core';

import { novels } from './novels.schema';

export type NovelGrant = InferSelectModel<typeof novelGrants>;

/** Who may read a `RESTRICTED` novel; replaced wholesale by `PUT /internal/novels/:slug/access`. Holds resolved identity subjects only, never emails. */

export const novelGrants = pgTable(
  'novel_grants',
  {
    novelId: bigint('novel_id', { mode: 'bigint' })
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    subjectId: varchar('subject_id', { length: 128 }).notNull(),
  },
  table => [primaryKey({ name: 'novel_grants_novel_id_subject_id_pk', columns: [table.novelId, table.subjectId] }), index('novel_grants_subject_id_idx').on(table.subjectId)],
);
