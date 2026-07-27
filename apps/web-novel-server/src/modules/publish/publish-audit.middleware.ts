/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { type HandlerMetadata } from '@shadow-library/app';
import { decodeJwt } from '@shadow-library/auth';
import { AuthGuardErrorCode } from '@shadow-library/auth/module';
import { AppError, Logger, tryCatch } from '@shadow-library/common';
import { type HttpRequest, type HttpResponse, Middleware, type RouteHandler } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';

import { PublishAuditService } from './publish-audit.service';
import { PUBLISH_AUDIT_METADATA, type PublishAuditEntry, type PublishAuditRouteMetadata } from './publish.types';

/**
 * Defining types
 */

interface CallerInfo {
  callerSub?: string;
  callerClientId?: string;
}

/**
 * Declaring the constants
 *
 * Route-level `onError` trailer for the audited internal routes: any mutation call that fails
 * before or outside the publish service (missing/invalid token, missing scope, validation error,
 * unexpected failure) still leaves exactly one audit row. The hook runs before the error response
 * is dispatched, so the trail is durable by the time the caller sees the failure.
 */

@Middleware({ type: 'onError', weight: 50 })
export class PublishAuditTrailer {
  private readonly logger = Logger.getLogger(APP_NAME, PublishAuditTrailer.name);

  constructor(private readonly auditService: PublishAuditService) {}

  cacheKey(metadata: HandlerMetadata): string {
    return `webnovel-publish-audit:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: HandlerMetadata): RouteHandler | undefined {
    const audit = metadata[PUBLISH_AUDIT_METADATA] as PublishAuditRouteMetadata | undefined;
    if (!audit) return undefined;

    const handler = async (request: HttpRequest, _response: HttpResponse, error: Error): Promise<void> => {
      if (request.publishAuditRecorded) return;
      request.publishAuditRecorded = true;

      const params = (request.params ?? {}) as Record<string, string>;
      const body = typeof request.body === 'object' && request.body !== null ? (request.body as Record<string, unknown>) : {};
      const entry: PublishAuditEntry = {
        action: audit.action,
        novelSlug: params.slug ?? '-',
        outcome: this.toOutcome(error),
        ...this.extractCaller(request),
        ordinal: params.ordinal !== undefined ? Number(params.ordinal) : undefined,
        contentHash: typeof body.contentHash === 'string' ? body.contentHash : undefined,
        incomingRevision: typeof body.revision === 'number' ? body.revision : undefined,
        error: error.message,
      };

      const result = await tryCatch(() => this.auditService.record(entry));
      if (!result.success) this.logger.error('failed to record publish audit row for rejected call', { action: audit.action, error: result.error });
    };

    /** Arity 3 marks the hook promise-style for fastify; the router's handler type models only (req, res) */
    return handler as unknown as RouteHandler;
  }

  private toOutcome(error: Error): PublishAuditEntry['outcome'] {
    const isAuthFailure = AppError.is(error, AuthGuardErrorCode.IAM_001) || AppError.is(error, AuthGuardErrorCode.IAM_002);
    return isAuthFailure ? 'unauthorized' : 'error';
  }

  /** Best-effort caller identification from the (possibly unverified) bearer token — audit only */
  private extractCaller(request: HttpRequest): CallerInfo {
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return {};
    const decoded = tryCatch(() => decodeJwt(header.slice(7)));
    if (!decoded.success) return {};
    const { sub, client_id: clientId } = decoded.data.payload;
    return { callerSub: typeof sub === 'string' ? sub : undefined, callerClientId: typeof clientId === 'string' ? clientId : undefined };
  }
}
