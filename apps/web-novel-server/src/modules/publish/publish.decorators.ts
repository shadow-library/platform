import { Handler } from '@shadow-library/app';

import { PUBLISH_AUDIT_METADATA, type PublishAction, type PublishAuditRouteMetadata } from './publish.types';

/**
 * Marks an internal mutation route as publish-audited: the service records the row on handled
 * outcomes, and the `PublishAuditTrailer` records one for anything that fails before or outside
 * the service (authz rejections, validation failures, unexpected errors).
 */
export const PublishAudited = (action: PublishAction): MethodDecorator => Handler({ [PUBLISH_AUDIT_METADATA]: { action } satisfies PublishAuditRouteMetadata });
