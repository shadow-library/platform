import { type AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

// Maps postgres constraint names to user-facing errors; anything unmapped surfaces as a 500 from
// DatabaseService.translateError. Grows one entry per schema task as user-triggerable
// `<table>_<cols>_<kind>`-named constraints land — CHECK constraints enforcing internal invariants
// (monotonic counters, minute-of-day ranges) are deliberately absent: no user input reaches them directly.
// The §10.6 idempotency constraints (hero_events dedupe, quest_logs occurrence, daily_states PK,
// recovery/comeback/returner/shield/achievement/title natural keys) are deliberately absent: their
// writers converge on conflict rather than surfacing an error, so a raised violation there is a bug.
export const constraintErrorMap: Record<string, AppError> = {
  accounts_identity_sub_unique: AppErrorCode.ACC_001.create(),
  reschedule_events_account_id_quest_id_date_unique: AppErrorCode.QST_001.create(),
  cosmetic_unlocks_account_id_cosmetic_id_unique: AppErrorCode.CSM_001.create(),
};
