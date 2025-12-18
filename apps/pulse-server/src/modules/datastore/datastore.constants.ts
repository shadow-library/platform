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
};
