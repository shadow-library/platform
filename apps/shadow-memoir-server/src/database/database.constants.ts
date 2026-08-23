import { type AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

// Maps postgres constraint names to user-facing errors; anything unmapped surfaces as a 500 from
// DatabaseService.translateError. Grows one entry per schema task as user-triggerable
// `<table>_<cols>_<kind>`-named constraints land — CHECK constraints enforcing internal invariants
// (monotonic counters, minute-of-day ranges) are deliberately absent: no user input reaches them directly.
export const constraintErrorMap: Record<string, AppError> = {
  accounts_identity_sub_unique: AppErrorCode.ACC_001.create(),
};
