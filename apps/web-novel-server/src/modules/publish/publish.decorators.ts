/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Handler } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { PUBLISH_AUDIT_METADATA, type PublishAction, type PublishAuditRouteMetadata } from './publish.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * Marks an internal mutation route as publish-audited: the service records the row on handled
 * outcomes, and the `PublishAuditTrailer` records one for anything that fails before or outside
 * the service (authz rejections, validation failures, unexpected errors).
 */
export const PublishAudited = (action: PublishAction): MethodDecorator => Handler({ [PUBLISH_AUDIT_METADATA]: { action } satisfies PublishAuditRouteMetadata });
