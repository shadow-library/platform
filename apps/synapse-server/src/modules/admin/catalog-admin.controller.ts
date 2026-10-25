import { RequirePermission } from '@shadow-library/auth/module';
import { AppError } from '@shadow-library/common';
import { Body, ErrorResponseDto, Get, HttpController, type HttpResponse, Params, Post, Put, Query, Res, RespondFor, ServerErrorCode } from '@shadow-library/fastify';

import { type Catalog } from '@server/database';

import { SYNAPSE_PERMISSIONS } from '@modules/auth';
import { catalogIssuesOf, CatalogVersionService, type CatalogVersionSummary } from '@modules/catalog';

import { AliasImpactService } from './alias-impact.service';
import {
  AliasImpactQuery,
  AliasImpactResponse,
  AliasParams,
  ApplyChangeBody,
  CatalogInvalidResponse,
  CatalogVersionDetailResponse,
  CatalogVersionListResponse,
  CatalogVersionSummaryResponse,
  PublishBudgetsBody,
  RollbackBody,
  VersionParams,
} from './catalog-admin.dto';
import { CallerService } from './caller.service';
import { CHANGE_PERMISSIONS, CHANGE_SENSITIVE_PERMISSIONS, changeAuthorizer } from './change-authorizer';
import { IdentityDirectoryService } from './identity-directory.service';

type VersionSummary = Omit<CatalogVersionSummaryResponse, 'createdByName'>;
type VersionDetail = Omit<CatalogVersionDetailResponse, 'createdByName'>;

const UNPROCESSABLE = 422;
const CONFLICT = 409;
/** Changes and rollbacks check budget writes against the short PDP cache too, so revoking the permission takes effect within a minute on all three */
const HIGH_RISK = { highRisk: true };

function summaryOf(row: CatalogVersionSummary): VersionSummary {
  if (row.state === 'DRAFT') throw AppError.internal(`Catalog row ${row.id} is a draft, which no response may carry`);
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

  @Post('/changes')
  @RequirePermission(SYNAPSE_PERMISSIONS.catalogWrite)
  @RespondFor(200, CatalogVersionSummaryResponse)
  @RespondFor(CONFLICT, ErrorResponseDto)
  @RespondFor(UNPROCESSABLE, CatalogInvalidResponse)
  async applyChange(@Body() body: ApplyChangeBody, @Res() response: HttpResponse): Promise<CatalogVersionSummaryResponse | HttpResponse> {
    const user = this.caller.user();
    const authorize = changeAuthorizer(await this.caller.permissions(user, CHANGE_PERMISSIONS, CHANGE_SENSITIVE_PERMISSIONS));
    return this.withIssues(response, async () =>
      this.directory.withEditorName(summaryOf(await this.catalog.applyChange(body.document, body.expectedVersion, body.note, user.sub, authorize))),
    );
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
  @RequirePermission(SYNAPSE_PERMISSIONS.catalogWrite)
  @RespondFor(200, CatalogVersionSummaryResponse)
  @RespondFor(CONFLICT, ErrorResponseDto)
  @RespondFor(UNPROCESSABLE, CatalogInvalidResponse)
  async rollback(@Params() params: VersionParams, @Body() body: RollbackBody, @Res() response: HttpResponse): Promise<CatalogVersionSummaryResponse | HttpResponse> {
    const user = this.caller.user();
    const authorize = changeAuthorizer(await this.caller.permissions(user, CHANGE_PERMISSIONS, CHANGE_SENSITIVE_PERMISSIONS));
    return this.withIssues(response, async () => this.directory.withEditorName(summaryOf(await this.catalog.rollback(params.version, body.expectedVersion, user.sub, authorize))));
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
