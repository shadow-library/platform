import { type HandlerMetadata } from '@shadow-library/app';
import { HttpMethod, type HttpRequest, type HttpResponse, Middleware, type RouteHandler } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';

const IMPORT_ROUTE = '/api/v1/import';
const IMPORT_PERMITS = 2;
const RETRY_AFTER_SECONDS = 15;

/**
 * An import peaks near nine times its body, so two at once is what a 1 GiB replica can hold. Admission is taken on `onRequest`, before
 * Fastify reads the body, and held until the response closes; a third concurrent import is refused (`IMP_001`, 429) rather than
 * queued, since a queued request would hold its body in memory while it waits. The count is per replica.
 */
@Middleware({ type: 'onRequest', weight: 100 })
export class ImportAdmissionGuard {
  private admitted = 0;

  cacheKey(metadata: HandlerMetadata): string {
    return `import-admission:${this.guards(metadata)}`;
  }

  generate(metadata: HandlerMetadata): RouteHandler | undefined {
    if (!this.guards(metadata)) return undefined;
    const handler = async (_request: HttpRequest, response: HttpResponse): Promise<void> => {
      const release = this.admit();
      if (!release) {
        response.header('retry-after', String(RETRY_AFTER_SECONDS));
        throw AppErrorCode.IMP_001.create();
      }
      response.raw.once('close', release);
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
