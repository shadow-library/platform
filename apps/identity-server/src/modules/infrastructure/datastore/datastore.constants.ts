import { AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

export const constraintErrorMap: Record<string, AppError> = {
  applications_name_unique: AppErrorCode.APP_002.create(),
  users_username_unique: AppErrorCode.USR_002.create(),
  user_emails_verified_email_unique: AppErrorCode.USR_003.create(),
  user_phones_verified_phone_unique: AppErrorCode.USR_004.create(),
};
