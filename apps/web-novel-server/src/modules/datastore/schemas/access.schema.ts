import { InferSelectModel } from 'drizzle-orm';
import { bigint, index, pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core';

import { novels } from './novels.schema';

export type NovelGrant = InferSelectModel<typeof novelGrants>;

/**
 * Who may read a `RESTRICTED` novel. Part of the forge-owned projection, not audience data: the
 * author decides the share list in novel-forge and it arrives over `PUT /internal/novels/:slug/access`
 * as a full replacement, so dropping this table and re-pushing converges to identical state.
 *
 * Only resolved identity subjects land here — the forge does the email → subject resolution at share
 * time, so no address the author typed is ever stored in the reader's database.
 */

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
