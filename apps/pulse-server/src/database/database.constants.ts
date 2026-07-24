/**
 * Importing npm packages
 */
import { type AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const constraintErrorMap: Record<string, AppError> = {
  templates_template_key_unique: AppErrorCode.TPL_002.create(),
  template_versions_template_id_version_unique: AppErrorCode.TPL_VER_002.create(),
  template_contents_version_channel_locale_unique: AppErrorCode.TPL_CNT_002.create(),
  layouts_layout_key_unique: AppErrorCode.TPL_LYT_002.create(),
  partials_partial_key_unique: AppErrorCode.TPL_PRT_002.create(),
  sender_routing_rules_sender_profile_id_sender_profiles_id_fk: AppErrorCode.SND_PRF_003.create(),
  sender_profiles_key_unique: AppErrorCode.SND_PRF_002.create(),
  sender_endpoints_channel_provider_identifier_unique: AppErrorCode.SND_EP_002.create(),
  sender_routing_rules_service_region_message_type_unique: AppErrorCode.SND_RTR_002.create(),
};
