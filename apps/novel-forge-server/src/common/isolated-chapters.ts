import { sql, type SQL } from 'drizzle-orm';

/**
 * A project's isolated chapter numbers — whichever of the current draft or the finalized chapter is
 * isolated — as a subquery. Shared between `search_prose` (embeddings, final chapters only) and the
 * chapter text search (drafts and finalized chapters), so the two can never disagree about what's walled off.
 */
export function isolatedChapterNumbers(projectId: bigint): SQL {
  return sql`(
    SELECT number FROM chapters WHERE project_id = ${projectId} AND isolated = true
    UNION
    SELECT chapter FROM drafts WHERE project_id = ${projectId} AND isolated = true
  )`;
}
