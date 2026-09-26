import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import { GENERATION_RUN_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { RefineProjectParams } from '../refinement/refine.dto';
import { AuditFindingDecisionBody, AuditFindingParams, AuditReportParams, BibleAuditJobResponse, BibleAuditReportResponse, ListBibleAuditsResponse } from './bible-audit.dto';
import { BibleAuditService } from './bible-audit.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId')
export class BibleAuditController {
  constructor(private readonly auditService: BibleAuditService) {}

  @Get('/bible/audits')
  @RespondFor(200, ListBibleAuditsResponse)
  async listAudits(@Params() params: RefineProjectParams): Promise<ListBibleAuditsResponse> {
    return { items: await this.auditService.list(params.projectId) };
  }

  @Get('/bible/audits/:reportId')
  @RespondFor(200, BibleAuditReportResponse)
  getAudit(@Params() params: AuditReportParams): Promise<BibleAuditReportResponse> {
    return this.auditService.get(params.projectId, params.reportId);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/bible/audits')
  @RespondFor(202, BibleAuditJobResponse)
  startAudit(@Params() params: RefineProjectParams): Promise<BibleAuditJobResponse> {
    return this.auditService.start(params.projectId);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/bible/audits/:reportId/findings/:findingId/decision')
  @RespondFor(200, BibleAuditReportResponse)
  decideFinding(@Params() params: AuditFindingParams, @Body() body: AuditFindingDecisionBody): Promise<BibleAuditReportResponse> {
    return this.auditService.decide(params.projectId, params.reportId, params.findingId, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/bible/audit')
  @RespondFor(202, BibleAuditJobResponse)
  auditBible(@Params() params: RefineProjectParams): Promise<BibleAuditJobResponse> {
    return this.auditService.start(params.projectId);
  }
}
