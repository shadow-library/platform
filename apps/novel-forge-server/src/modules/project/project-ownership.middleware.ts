import { eq, sql } from 'drizzle-orm';
import { type PgPreparedQuery, type PreparedQueryConfig } from 'drizzle-orm/pg-core';
import { type HandlerMetadata } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { type HttpRequest, Middleware, type RouteHandler } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { ActorService } from '@modules/actor';

import { ProjectAccessService, type ProjectOwnership } from './project-access.service';

/**
 * Object-level authorization for every project-scoped route (audit finding NF-BOLA-01). The class-level
 * `@Authenticated()` on each controller proves *who* the caller is; this guard proves the caller may reach
 * the project the route addresses. It runs after the package `AuthGuard`, which authenticates a stage
 * earlier on `preValidation`, and, for any route that carries a project identifier in its path, loads that
 * project's owner and rejects the request unless the caller owns it — or is an organisation curator on a
 * project its bot owner shared. A missing project or a null `owner_id` is treated as a denial — the
 * response is always a 404 (`PRJ_001`) so a probing caller cannot distinguish "not yours" from "does not
 * exist". Routes without a project param (project create/list, jobs, ai) generate no handler and are
 * scoped by their own services instead.
 */

@Middleware({ type: 'preHandler', weight: 50 })
export class ProjectOwnershipGuard {
  private readonly logger = Logger.getLogger(APP_NAME, ProjectOwnershipGuard.name);
  private readonly db: PrimaryDatabase;
  /** Prepared because this guard runs on every project-scoped request; the driver builds no server-side statement, the saving is Drizzle's per-call SQL generation. */
  private readonly projectOwnerQuery: PgPreparedQuery<PreparedQueryConfig & { execute: ProjectOwnership | undefined }>;

  constructor(
    private readonly actorService: ActorService,
    private readonly access: ProjectAccessService,
    databaseService: DatabaseService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
    this.projectOwnerQuery = this.db.query.projects
      .findFirst({
        where: eq(schema.projects.id, sql.placeholder('projectId')),
        columns: { ownerKind: true, ownerId: true, organisationId: true, sharedWithOrg: true },
      })
      .prepare('novel_forge_project_owner');
  }

  cacheKey(metadata: HandlerMetadata): string {
    return `project-ownership:${this.resolveParam(metadata.path) ?? 'none'}`;
  }

  generate(metadata: HandlerMetadata): RouteHandler | undefined {
    const param = this.resolveParam(metadata.path);
    if (!param) return undefined;

    const handler = async (request: HttpRequest): Promise<void> => {
      const params = (request.params ?? {}) as Record<string, unknown>;
      await this.assertPermitted(params[param]);
    };

    return handler as unknown as RouteHandler;
  }

  private resolveParam(path: string | undefined): string | undefined {
    if (typeof path !== 'string') return undefined;
    const segments = path.split('/');
    if (segments.includes(':projectId')) return 'projectId';
    if (path.startsWith('/api/v1/projects/') && segments.includes(':id')) return 'id';
    return undefined;
  }

  private async assertPermitted(rawProjectId: unknown): Promise<void> {
    const projectId = this.toBigInt(rawProjectId);
    if (projectId === null) throw AppErrorCode.PRJ_001.create();

    const actor = this.actorService.current();
    const project = await this.projectOwnerQuery.execute({ projectId });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (await this.access.canReach(project, actor)) return;

    this.logger.warn('rejected cross-owner project access', { projectId: projectId.toString(), callerKind: actor.kind, caller: actor.id.toString() });
    throw AppErrorCode.PRJ_001.create();
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
