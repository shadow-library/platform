import { AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

export const constraintErrorMap: Record<string, AppError> = {
  applications_name_unique: AppErrorCode.APP_002.create(),
  users_username_unique: AppErrorCode.USR_002.create(),
  user_emails_verified_email_unique: AppErrorCode.USR_003.create(),
  user_phones_verified_phone_unique: AppErrorCode.USR_004.create(),
  identity_providers_organisation_unique: AppErrorCode.FED_003.create(),
  identity_providers_global_kind_unique: AppErrorCode.FED_003.create(),
  bots_organisation_handle_unique: AppErrorCode.BOT_003.create(),
  bot_keys_expiry_within_365_days: AppErrorCode.BOT_007.create(),
  bot_ownership_transfers_application_id_applications_id_fk: AppErrorCode.APP_014.create(),
};
