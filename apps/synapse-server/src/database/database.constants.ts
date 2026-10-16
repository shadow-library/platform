import { type AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

export const constraintErrorMap: Record<string, AppError> = {
  catalog_versions_pkey: AppErrorCode.SYN_CATALOG_CONFLICT.create(),
  catalog_versions_version_unique: AppErrorCode.SYN_CATALOG_CONFLICT.create(),
  catalog_versions_single_draft_idx: AppErrorCode.SYN_CATALOG_CONFLICT.create(),
  ledger_pkey: AppErrorCode.SYN_DUPLICATE_REQUEST.create(),
};
