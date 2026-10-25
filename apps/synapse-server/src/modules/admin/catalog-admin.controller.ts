import { RequirePermission } from '@shadow-library/auth/module';
import { type JSONSchema } from '@shadow-library/class-schema';
import { AppError } from '@shadow-library/common';
import {
  Body,
  Delete,
  ErrorResponseDto,
  Get,
  HttpController,
  type HttpResponse,
  HttpStatus,
  Params,
  Post,
  Put,
  Query,
  Res,
  RespondFor,
  ServerErrorCode,
} from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { type Catalog } from '@server/database';

import { SYNAPSE_PERMISSIONS } from '@modules/auth';
import { catalogIssuesOf, CatalogVersionService, type CatalogVersionSummary } from '@modules/catalog';

import { AliasImpactService } from './alias-impact.service';
import {
  AliasImpactQuery,
  AliasImpactResponse,
  AliasParams,
  CatalogInvalidResponse,
  CatalogVersionDetailResponse,
  CatalogVersionListResponse,
  CatalogVersionSummaryResponse,
  DiscardDraftQuery,
  DraftDiffResponse,
  DraftResponse,
  PublishBody,
  PublishBudgetsBody,
  SaveDraftBody,
  SaveDraftResponse,
  ValidateDraftResponse,
  VersionParams,
} from './catalog-admin.dto';
import { CallerService } from './caller.service';
import { DRAFT_PERMISSIONS, DRAFT_SENSITIVE_PERMISSIONS, draftAuthorizer } from './draft-authorizer';
import { IdentityDirectoryService } from './identity-directory.service';

type VersionSummary = Omit<CatalogVersionSummaryResponse, 'createdByName'>;
type VersionDetail = Omit<CatalogVersionDetailResponse, 'createdByName'>;

const NO_CONTENT = 204;
const UNPROCESSABLE = 422;
const CONFLICT = 409;
const NO_DRAFT: JSONSchema = { $id: 'NoDraftResponse', type: 'null', description: 'No draft exists' };
/** The draft path checks budget writes against the short PDP cache too, so revoking the permission takes effect within a minute on both */
const HIGH_RISK = { highRisk: true };

function summaryOf(row: CatalogVersionSummary): VersionSummary {
  return {
    version: row.version,
    state: row.state,
    ...(row.note !== null && { note: row.note }),
    ...(row.createdBy !== null && { createdBy: row.createdBy }),
    createdAt: row.createdAt,
    ...(row.publishedAt !== null && { publishedAt: row.publishedAt }),
  };
}

function detailOf(row: Catalog.Version): VersionDetail {
  return { ...summaryOf(row), document: row.document as Record<string, unknown> };
}

@HttpController('/api/v1/admin/catalog')
export class CatalogAdminController {
  constructor(
    private readonly caller: CallerService,
    private readonly catalog: CatalogVersionService,
    private readonly impact: AliasImpactService,
    private readonly directory: IdentityDirectoryService,
  ) {}

  @Get('/versions')
  @RequirePermission(SYNAPSE_PERMISSIONS.catalogRead)
  @RespondFor(200, CatalogVersionListResponse)
  async listVersions(): Promise<CatalogVersionListResponse> {
    this.caller.user();
    const versions = await this.catalog.listVersions();
    return { items: await this.directory.withEditorNames(versions.map(summaryOf)) };
  }

  @Get('/versions/:version')
  @RequirePermission(SYNAPSE_PERMISSIONS.catalogRead)
  @RespondFor(200, CatalogVersionDetailResponse)
  async getVersion(@Params() params: VersionParams): Promise<CatalogVersionDetailResponse> {
    this.caller.user();
    const row = await this.catalog.getVersion(params.version);
    return this.directory.withEditorName(detailOf(row ?? ServerErrorCode.S009.throw()));
  }

  @Get('/draft')
  @RequirePermission(SYNAPSE_PERMISSIONS.catalogRead)
  @HttpStatus(200)
  @RespondFor(200, DraftResponse)
  @RespondFor(NO_CONTENT, NO_DRAFT)
  async getDraft(@Res() response: HttpResponse): Promise<DraftResponse | HttpResponse> {
    this.caller.user();
    const view = await this.catalog.getDraft();
    if (!view) return response.status(NO_CONTENT).send();
    return { draft: await this.directory.withEditorName(detailOf(view.draft)), fingerprint: view.fingerprint };
  }

  @Put('/draft')
  @RequirePermission(SYNAPSE_PERMISSIONS.catalogWrite)
  @RespondFor(200, SaveDraftResponse)
  @RespondFor(CONFLICT, ErrorResponseDto)
  @RespondFor(UNPROCESSABLE, CatalogInvalidResponse)
  async saveDraft(@Body() body: SaveDraftBody, @Res() response: HttpResponse): Promise<SaveDraftResponse | HttpResponse> {
    const user = this.caller.user();
    if (body.expectedFingerprint !== undefined && body.expectNoDraft) {
      throw AppErrorCode.SYN_INVALID_REQUEST.create({ param: 'expectNoDraft', reason: 'a save expects either an existing draft or none, not both' });
    }
    if (body.expectedActiveVersion !== undefined && !body.expectNoDraft) {
      throw AppErrorCode.SYN_INVALID_REQUEST.create({ param: 'expectedActiveVersion', reason: 'pinning the active version requires expectNoDraft' });
    }
    const expected = {
      ...(body.expectedFingerprint !== undefined && { fingerprint: body.expectedFingerprint }),
      ...(body.expectNoDraft && { noDraft: true }),
      ...(body.expectedActiveVersion !== undefined && { activeVersion: body.expectedActiveVersion }),
    };
    const granted = await this.caller.permissions(user, DRAFT_PERMISSIONS, DRAFT_SENSITIVE_PERMISSIONS);
    return this.withIssues(response, async () => {
      const saved = await this.catalog.saveDraft(body.document, body.note, user.sub, draftAuthorizer(granted), expected);
      return { draft: await this.directory.withEditorName(detailOf(saved.draft)), fingerprint: saved.fingerprint, issues: saved.issues };
    });
  }

  @Delete('/draft')
  @RequirePermission(SYNAPSE_PERMISSIONS.catalogWrite)
  @HttpStatus(204)
  @RespondFor(CONFLICT, ErrorResponseDto)
  async discardDraft(@Query() query: DiscardDraftQuery): Promise<void> {
    const user = this.caller.user();
    const granted = await this.caller.permissions(user, DRAFT_PERMISSIONS, DRAFT_SENSITIVE_PERMISSIONS);
    await this.catalog.discardDraft(query.fingerprint, user.sub, draftAuthorizer(granted));
  }

  @Post('/draft/validate')
  @RequirePermission(SYNAPSE_PERMISSIONS.catalogWrite)
  @HttpStatus(200)
  @RespondFor(200, ValidateDraftResponse)
  @RespondFor(NO_CONTENT, NO_DRAFT)
  async validateDraft(@Res() response: HttpResponse): Promise<ValidateDraftResponse | HttpResponse> {
    this.caller.user();
    const issues = await this.catalog.validateDraft();
    if (!issues) return response.status(NO_CONTENT).send();
    return { valid: issues.length === 0, issues };
  }

  @Get('/draft/diff')
  @RequirePermission(SYNAPSE_PERMISSIONS.catalogRead)
  @HttpStatus(200)
  @RespondFor(200, DraftDiffResponse)
  @RespondFor(NO_CONTENT, NO_DRAFT)
  async diffDraft(@Res() response: HttpResponse): Promise<DraftDiffResponse | HttpResponse> {
    this.caller.user();
    const diff = await this.catalog.diff();
    if (!diff) return response.status(NO_CONTENT).send();
    return diff;
  }

  @Post('/draft/publish')
  @RequirePermission(SYNAPSE_PERMISSIONS.catalogPublish)
  @RespondFor(200, CatalogVersionSummaryResponse)
  @RespondFor(CONFLICT, ErrorResponseDto)
  @RespondFor(UNPROCESSABLE, CatalogInvalidResponse)
  async publish(@Body() body: PublishBody, @Res() response: HttpResponse): Promise<CatalogVersionSummaryResponse | HttpResponse> {
    const user = this.caller.user();
    const fingerprint = body.fingerprint;
    if (!fingerprint) throw AppErrorCode.SYN_INVALID_REQUEST.create({ param: 'fingerprint', reason: 'the fingerprint of the draft being published is required' });
    return this.withIssues(response, async () => this.directory.withEditorName(summaryOf(await this.catalog.publish(user.sub, fingerprint))));
  }

  @Put('/budgets')
  @RequirePermission(SYNAPSE_PERMISSIONS.budgetsWrite, HIGH_RISK)
  @RespondFor(200, CatalogVersionSummaryResponse)
  @RespondFor(CONFLICT, ErrorResponseDto)
  @RespondFor(UNPROCESSABLE, CatalogInvalidResponse)
  async publishBudgets(@Body() body: PublishBudgetsBody, @Res() response: HttpResponse): Promise<CatalogVersionSummaryResponse | HttpResponse> {
    const user = this.caller.user();
    return this.withIssues(response, async () =>
      this.directory.withEditorName(summaryOf(await this.catalog.publishBudgets(body.budgets, body.expectedVersion, body.note, user.sub))),
    );
  }

  @Post('/versions/:version/rollback')
  @RequirePermission(SYNAPSE_PERMISSIONS.catalogPublish)
  @RespondFor(200, CatalogVersionSummaryResponse)
  @RespondFor(UNPROCESSABLE, CatalogInvalidResponse)
  async rollback(@Params() params: VersionParams, @Res() response: HttpResponse): Promise<CatalogVersionSummaryResponse | HttpResponse> {
    const user = this.caller.user();
    return this.withIssues(response, async () => this.directory.withEditorName(summaryOf(await this.catalog.rollback(params.version, user.sub))));
  }

  @Get('/aliases/:key/impact')
  @RequirePermission(SYNAPSE_PERMISSIONS.catalogRead)
  @RespondFor(200, AliasImpactResponse)
  async aliasImpact(@Params() params: AliasParams, @Query() query: AliasImpactQuery): Promise<AliasImpactResponse> {
    this.caller.user();
    return this.impact.impact(params.key, query.model);
  }

  /** `toResponse()` carries no error data, so the issues are added to the body here. */
  private async withIssues<T>(response: HttpResponse, work: () => Promise<T>): Promise<T | HttpResponse> {
    try {
      return await work();
    } catch (error) {
      const issues = catalogIssuesOf(error);
      if (!issues || !AppError.is(error)) throw error;
      return response.status(error.status).send({ ...error.toResponse(), issues });
    }
  }
}
