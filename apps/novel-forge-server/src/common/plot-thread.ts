import { and, eq } from 'drizzle-orm';

import { type DbExecutor, schema } from '@server/database';

/** The chapter numbers a thread touches: where it opened, closed, or was last advanced. Empty when the thread does not exist. */
export async function resolveThreadChapterNumbers(db: Pick<DbExecutor, 'query'>, projectId: bigint, threadKey: string): Promise<Set<number>> {
  const thread = await db.query.plotThreads.findFirst({
    columns: { openedChapter: true, closedChapter: true, lastAdvancedChapter: true },
    where: and(eq(schema.plotThreads.projectId, projectId), eq(schema.plotThreads.threadKey, threadKey)),
  });
  if (!thread) return new Set();
  return new Set([thread.openedChapter, thread.closedChapter, thread.lastAdvancedChapter].filter((n): n is number => n != null));
}
