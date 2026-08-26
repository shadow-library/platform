import { type AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

// Maps postgres constraint names to user-facing errors; anything unmapped surfaces as a 500 from
// DatabaseService.translateError, so every user-triggerable constraint belongs here.
export const constraintErrorMap: Record<string, AppError> = {
  // Two turns racing on one conversation compute the same next ordinal and the loser hits this unique
  // index; it is a lost race, not a broken request.
  chat_messages_session_id_ordinal_unique: AppErrorCode.CHT_006.create(),
};
