import { type AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

// Maps postgres constraint names to user-facing errors; anything unmapped surfaces as a 500 from
// DatabaseService.translateError, so every user-triggerable constraint belongs here.
export const constraintErrorMap: Record<string, AppError> = {
  // Two turns racing on one conversation compute the same next ordinal and the loser hits this unique
  // index; it is a lost race, not a broken request.
  chat_messages_session_id_ordinal_unique: AppErrorCode.CHT_006.create(),
  // Graduation mints one fact per named betrayal, and the fact endpoints let the author write any key
  // they like — a collision is a conflict the caller can resolve, never a 500 that aborts graduation.
  canon_facts_project_id_fact_key_unique: AppErrorCode.FCT_004.create(),
  // Two projects whose titles slugify identically race for one reader URL; PublishingService walks a
  // suffix ladder off this error, so it is a retry signal there as much as a response here.
  publications_novel_slug_unique: AppErrorCode.PUB_007.create(),
  // Two ingest pushes of the same source ordinal that both read "absent" before either wrote; the row
  // that lands wins, and the loser is told what a serialized retry would have told it.
  chapters_project_id_source_ordinal_unique: AppErrorCode.ING_003.create(),
};
