import { type HandlerMetadata } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { HttpMethod, type HttpRequest, type HttpResponse, Middleware, type RouteHandler } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';

const IMPORT_ROUTE = '/api/v1/import';
const IMPORT_PERMITS = 2;
const RETRY_AFTER_SECONDS = 15;
const DEFAULT_RECEIVE_DEADLINE_MS = 60_000;

/**
 * An import peaks near nine times its body, so two at once is what a 1 GiB replica can hold. Admission is taken on `onRequest`, before
 * Fastify reads the body, and a third concurrent import is refused (`IMP_001`, 429) rather than queued, since a queued request would hold
 * its body in memory while it waits. The count is per replica.
 *
 * A permit returns when the response finishes or closes, or when the request is aborted or errors: under Bun an upload the client drops
 * mid-body never closes the response. The request's own `close` is not a release, because Bun fires it once the body is read, while the
 * handler still holds the bundle. A body not fully received within the deadline returns its permit and has its connection destroyed.
 */
@Middleware({ type: 'onRequest', weight: 100 })
export class ImportAdmissionGuard {
  private admitted = 0;

  cacheKey(metadata: HandlerMetadata): string {
    return `import-admission:${this.guards(metadata)}`;
  }

  generate(metadata: HandlerMetadata): RouteHandler | undefined {
    if (!this.guards(metadata)) return undefined;
    const handler = async (request: HttpRequest, response: HttpResponse): Promise<void> => {
      const release = this.admit();
      if (!release) {
        response.header('retry-after', String(RETRY_AFTER_SECONDS));
        throw AppErrorCode.IMP_001.create();
      }
      const deadline = setTimeout(
        () => {
          release();
          request.raw.destroy();
        },
        Config.get('imports.receive-deadline-ms') ?? DEFAULT_RECEIVE_DEADLINE_MS,
      );
      deadline.unref?.();
      const settle = (): void => {
        clearTimeout(deadline);
        release();
      };
      request.raw.once('end', () => clearTimeout(deadline));
      request.raw.once('aborted', settle);
      request.raw.once('error', settle);
      response.raw.once('finish', settle);
      response.raw.once('close', settle);
    };
    return handler as unknown as RouteHandler;
  }

  private admit(): (() => void) | undefined {
    if (this.admitted >= IMPORT_PERMITS) return undefined;
    this.admitted += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.admitted -= 1;
    };
  }

  private guards(metadata: HandlerMetadata): boolean {
    return metadata.path === IMPORT_ROUTE && metadata.method === HttpMethod.POST;
  }
}
