import { eq } from 'drizzle-orm';
import { AppError, Logger } from '@shadow-library/common';
import { Body, ContextService, Get, HttpController, type HttpResponse, HttpStatus, Params, Put, Res, RespondFor } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { ApiKeyAuthenticated } from '@modules/api-key';
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { OriginalChapterBody, OriginalsManifestResponse, TranslationChapterParams, TranslationParams } from '../translation/translation.dto';
import { TranslationService } from '../translation/translation.service';
import { type IngestAction, IngestAuditService, type IngestOutcome } from './ingest-audit.service';

/**
 * The external translation app's door onto the originals (translation design D9), authenticated by an API
 * key alone and deliberately NOT `@Authenticated()` — the constraint documented on `CuratedIngestController`.
 *
 * Unlike that controller this one IS project-id addressed, so the app-global `ProjectOwnershipGuard` also
 * runs and answers a foreign or absent project with `PRJ_001` before the handler is reached. The ownership
 * check below is therefore the audited one rather than the only one: it keeps the trail truthful if the
 * guard's path matching ever changes, and answers with the `ING_001` shape the rest of the ingest surface uses.
 */
@ApiKeyAuthenticated()
@HttpController('/api/v1/ingest/projects/:projectId')
export class OriginalsIngestController {
  private readonly logger = Logger.getLogger(APP_NAME, OriginalsIngestController.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly translationService: TranslationService,
    private readonly context: ContextService,
    private readonly audit: IngestAuditService,
    databaseService: DatabaseService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  @Put('/originals/:chapter')
  @HttpStatus(201)
  async pushOriginal(@Params() params: TranslationChapterParams, @Body() body: OriginalChapterBody, @Res() res: HttpResponse): Promise<void> {
    const { projectId, chapter } = params;
    await this.requireOwned(projectId, 'original.push');

    const outcome = await this.translationService.upsertOriginal(projectId, chapter, body).catch(async (error: unknown) => {
      await this.record('original.push', projectId, this.outcomeOf(error));
      throw error;
    });

    await this.record('original.push', projectId, outcome.outcome === 'created' ? 'created' : outcome.outcome === 'updated' ? 'landed' : 'noop');
    if (outcome.outcome === 'updated') res.status(200);
    if (outcome.outcome === 'unchanged') res.status(204);
  }

  @Get('/originals')
  @RespondFor(200, OriginalsManifestResponse)
  async getOriginalsManifest(@Params() params: TranslationParams): Promise<OriginalsManifestResponse> {
    await this.requireOwned(params.projectId, 'originals.manifest');
    const manifest = await this.translationService.originalsManifest(params.projectId);
    await this.record('originals.manifest', params.projectId, 'applied');
    return manifest;
  }

  /** A project held by a different owner is answered exactly as one that does not exist, so the surface is not an id oracle. */
  private async requireOwned(projectId: bigint, action: IngestAction): Promise<void> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { ownerId: true } });
    if (project && project.ownerId === BigInt(this.context.getAuthPrincipal().sub)) return;

    if (project) this.logger.warn('originals ingest addressed a project held by another owner', { projectId: projectId.toString() });
    await this.record(action, projectId, 'not_found');
    throw AppErrorCode.ING_001.create();
  }

  private outcomeOf(error: unknown): IngestOutcome {
    if (AppError.is(error, AppErrorCode.TRN_010)) return 'out_of_order';
    if (AppError.is(error, AppErrorCode.TRN_004)) return 'conflict';
    return 'error';
  }

  /** The trail must never displace the answer: a failed audit write is logged and swallowed so the caller still receives its own status. */
  private async record(action: IngestAction, projectId: bigint, outcome: IngestOutcome): Promise<void> {
    const apiKeyId = this.context.getAuthPrincipal().claims?.['api_key_id'];
    await this.audit
      .record({ apiKeyId: typeof apiKeyId === 'string' ? BigInt(apiKeyId) : null, action, sourceRef: `project:${projectId}`, projectId, outcome })
      .catch((cause: Error) => this.logger.error('could not record an originals ingest attempt', { projectId: projectId.toString(), action, reason: cause.message }));
  }
}
