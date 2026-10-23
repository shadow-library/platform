import { Handler } from '@shadow-library/app';

import { PUBLISH_AUDIT_METADATA, type PublishAction, type PublishAuditRouteMetadata } from './publish.types';

export const PublishAudited = (action: PublishAction): MethodDecorator => Handler({ [PUBLISH_AUDIT_METADATA]: { action } satisfies PublishAuditRouteMetadata });
