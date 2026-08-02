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
    return `web-novel-publish-audit:${String(metadata.method)}:${String(metadata.path)}`;
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
        novelSlug: (params.slug ?? '-').slice(0, 128),
        outcome: this.toOutcome(error),
        ...this.extractCaller(request),
        ordinal: this.toInt4(params.ordinal !== undefined ? Number(params.ordinal) : undefined),
        contentHash: typeof body.contentHash === 'string' ? body.contentHash.slice(0, 128) : undefined,
        incomingRevision: this.toInt4(body.revision),
        error: error.message,
      };

      const result = await tryCatch(() => this.auditService.record(entry));
      if (!result.success) this.logger.error('failed to record publish audit row for rejected call', { action: audit.action, error: result.error });
    };

    /** Arity 3 marks the hook promise-style for fastify; the router's handler type models only (req, res) */
    return handler as unknown as RouteHandler;
  }

  /** The audit columns are int4 — a rejected call carrying a pathological number must not sink its own audit row (found by e2e: 3e9 revision overflowed the trailer's insert) */
  private toInt4(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
    return Math.abs(value) <= 2_147_483_647 ? value : undefined;
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
    /** Truncated to the audit columns' varchar(128) so an over-long claim can't overflow the insert and sink the row (mirrors `contentHash`) */
    return { callerSub: typeof sub === 'string' ? sub.slice(0, 128) : undefined, callerClientId: typeof clientId === 'string' ? clientId.slice(0, 128) : undefined };
  }
}
