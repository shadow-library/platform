/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { type HandlerMetadata } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ContextService, type HttpRequest, Middleware, type RouteHandler } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Object-level authorization for every project-scoped route (audit finding NF-BOLA-01). The class-level
 * `@Authenticated()` on each controller proves *who* the caller is; this guard proves the caller *owns*
 * the project the route addresses. It runs just after the package `AuthGuard` (lower weight, same hook,
 * once the principal is in context) and, for any route that carries a project identifier in its path,
 * loads that project's `owner_id` and rejects the request unless it matches the caller. A missing project
 * or a null `owner_id` is treated as a denial — the response is always a 404 (`PRJ_001`) so a probing
 * caller cannot distinguish "not yours" from "does not exist". Routes without a project param (project
 * create/list, jobs, ai) generate no handler and are scoped by their own services instead.
 */

@Middleware({ type: 'preHandler', weight: 50 })
export class ProjectOwnershipGuard {
  private readonly logger = Logger.getLogger(APP_NAME, ProjectOwnershipGuard.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly context: ContextService,
    databaseService: DatabaseService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  cacheKey(metadata: HandlerMetadata): string {
    return `project-ownership:${this.resolveParam(metadata.path) ?? 'none'}`;
  }

  generate(metadata: HandlerMetadata): RouteHandler | undefined {
    const param = this.resolveParam(metadata.path);
    if (!param) return undefined;

    const handler = async (request: HttpRequest): Promise<void> => {
      const principal = this.context.getAuthPrincipal();
      const params = (request.params ?? {}) as Record<string, unknown>;
      await this.assertOwner(params[param], principal.sub);
    };

    return handler as unknown as RouteHandler;
  }

  /** The path segment that names a project — nested routes use `:projectId`; the top-level controller may use `:id`. */
  private resolveParam(path: string | undefined): string | undefined {
    if (typeof path !== 'string') return undefined;
    const segments = path.split('/');
    if (segments.includes(':projectId')) return 'projectId';
    if (path.startsWith('/api/v1/projects/') && segments.includes(':id')) return 'id';
    return undefined;
  }

  private async assertOwner(rawProjectId: unknown, sub: string): Promise<void> {
    const projectId = this.toBigInt(rawProjectId);
    const ownerId = this.toBigInt(sub);
    if (projectId === null || ownerId === null) throw AppErrorCode.PRJ_001.create();

    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { ownerId: true } });
    if (!project || project.ownerId === null || project.ownerId !== ownerId) {
      this.logger.warn('rejected cross-owner project access', { projectId: projectId.toString(), caller: ownerId.toString() });
      throw AppErrorCode.PRJ_001.create();
    }
  }

  // The param may already be a bigint (routes whose DTO transforms it) or a raw string (e.g. the image
  // route). Anything else — or an unparseable value — fails closed.
  private toBigInt(value: unknown): bigint | null {
    try {
      if (typeof value === 'bigint') return value;
      if (typeof value === 'string' || typeof value === 'number') return BigInt(value);
      return null;
    } catch {
      return null;
    }
  }
}
