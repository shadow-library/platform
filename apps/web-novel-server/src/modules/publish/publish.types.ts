/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type PublishAction = 'novel.upsert' | 'chapter.upsert' | 'chapter.unpublish';

export type PublishOutcome = 'applied' | 'noop' | 'stale_rejected' | 'unauthorized' | 'error';

export interface PublishAuditEntry {
  action: PublishAction;
  novelSlug: string;
  outcome: PublishOutcome;
  callerSub?: string;
  callerClientId?: string;
  ordinal?: number;
  contentHash?: string;
  incomingRevision?: number;
  storedRevision?: number;
  error?: string;
}

/** Route metadata payload the `@PublishAudited` decorator writes and the trailer middleware reads */
export interface PublishAuditRouteMetadata {
  action: PublishAction;
}

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Set once the publish service has written this request's audit row, so the error trailer
     * never double-records a call that already produced its applied/noop/stale_rejected row.
     */
    publishAuditRecorded?: boolean;
  }
}

/**
 * Declaring the constants
 */

/** Handler-metadata key carrying the `PublishAuditRouteMetadata` for audited internal routes */
export const PUBLISH_AUDIT_METADATA = 'webnovelPublishAudit';
