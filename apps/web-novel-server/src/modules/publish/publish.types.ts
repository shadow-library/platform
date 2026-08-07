export type PublishAction = 'novel.upsert' | 'novel.access' | 'chapter.upsert' | 'chapter.unpublish' | 'wiki.upsert' | 'wiki.delete';

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

export const PUBLISH_AUDIT_METADATA = 'webNovelPublishAudit';
