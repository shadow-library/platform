import { type AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

// Maps postgres constraint names to user-facing errors; unmapped ones surface as a 500 from DatabaseService.translateError.
// Internal-invariant CHECKs and idempotency constraints (hero_events dedupe, quest_logs occurrence, natural keys) are deliberately absent:
// their writers converge on conflict, so a raised violation there is a bug.
export const constraintErrorMap: Record<string, AppError> = {
  accounts_identity_sub_unique: AppErrorCode.ACC_001.create(),
  reschedule_events_account_id_quest_id_date_unique: AppErrorCode.QST_001.create(),
  expense_categories_account_id_key_unique: AppErrorCode.FIN_001.create(),
  expenses_account_id_linked_subscription_id_billing_cycle_date_unique: AppErrorCode.FIN_002.create(),
  metrics_account_id_name_unique: AppErrorCode.MET_001.create(),
};
