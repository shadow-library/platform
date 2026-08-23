import { type AppError } from '@shadow-library/common';

// Maps postgres constraint names to user-facing errors; anything unmapped surfaces as a 500 from
// DatabaseService.translateError. Empty until T-08 lands the first tables — grows one entry per
// schema task as `<table>_<cols>_<kind>`-named constraints become user-triggerable.
export const constraintErrorMap: Record<string, AppError> = {};
