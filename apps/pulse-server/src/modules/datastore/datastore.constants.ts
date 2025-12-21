/**
 * Importing npm packages
 */
import { ServerError } from '@shadow-library/fastify';

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

export const constraintErrorMap: Record<string, ServerError> = {
  template_groups_template_key_unique: new ServerError(AppErrorCode.TPL_GRP_002),
  template_variants_template_group_id_template_groups_id_fk: new ServerError(AppErrorCode.TPL_GRP_001),
  template_variants_template_group_id_channel_locale_unique: new ServerError(AppErrorCode.TPL_VRT_002),
  sender_profile_assignments_sender_profile_id_sender_profiles_id: new ServerError(AppErrorCode.SND_PRF_003),
  sender_profiles_key_unique: new ServerError(AppErrorCode.SND_PRF_002),
  sender_endpoints_channel_provider_identifier_unique: new ServerError(AppErrorCode.SND_EP_002),
  sender_profile_assignments_service_name_message_type_region_pk: new ServerError(AppErrorCode.SND_ASGN_002),
};
