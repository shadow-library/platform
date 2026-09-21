import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

import { ILLUSTRATIONS_WRITE_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import {
  CloneProjectBody,
  CostResponse,
  CreateProjectBody,
  ListProjectResponse,
  ListProjectsQuery,
  ProjectDetailResponse,
  ProjectParams,
  ProjectResponse,
  ProjectStatusResponse,
  ResetBody,
  ResetResponse,
  UpdateProjectBody,
  UploadImageBody,
} from './project.dto';
import { ProjectService } from './project.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post()
  @RespondFor(201, ProjectResponse)
  createProject(@Body() body: CreateProjectBody): Promise<ProjectResponse> {
    return this.projectService.create(body);
  }

  @Get()
  @RespondFor(200, ListProjectResponse)
  listProjects(@Query() query: ListProjectsQuery): Promise<ListProjectResponse> {
    return this.projectService.list(query);
  }

  @Get('/:projectId')
  @RespondFor(200, ProjectDetailResponse)
  getProject(@Params() params: ProjectParams): Promise<ProjectDetailResponse> {
    return this.projectService.getDetail(params.projectId);
  }

  @Get('/:projectId/status')
  @RespondFor(200, ProjectStatusResponse)
  getProjectStatus(@Params() params: ProjectParams): Promise<ProjectStatusResponse> {
    return this.projectService.status(params.projectId);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Patch('/:projectId')
  @RespondFor(200, ProjectResponse)
  updateProject(@Params() params: ProjectParams, @Body() body: UpdateProjectBody): Promise<ProjectResponse> {
    return this.projectService.update(params.projectId, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:projectId/clone')
  @RespondFor(201, ProjectResponse)
  cloneProject(@Params() params: ProjectParams, @Body() body: CloneProjectBody): Promise<ProjectResponse> {
    return this.projectService.clone(params.projectId, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Delete('/:projectId')
  @HttpStatus(204)
  deleteProject(@Params() params: ProjectParams): Promise<void> {
    return this.projectService.delete(params.projectId);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:projectId/reset')
  @RespondFor(200, ResetResponse)
  resetProject(@Params() params: ProjectParams, @Body() body: ResetBody): Promise<ResetResponse> {
    return this.projectService.reset(params.projectId, body.stage);
  }

  @Get('/:projectId/cost')
  @RespondFor(200, CostResponse)
  getProjectCost(@Params() params: ProjectParams): Promise<CostResponse> {
    return this.projectService.cost(params.projectId);
  }

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @Post('/:projectId/cover')
  @RespondFor(200, ProjectResponse)
  uploadCover(@Params() params: ProjectParams, @Body() body: UploadImageBody): Promise<ProjectResponse> {
    return this.projectService.setCover(params.projectId, body.image, body.mime);
  }

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @Delete('/:projectId/cover')
  @RespondFor(200, ProjectResponse)
  deleteCover(@Params() params: ProjectParams): Promise<ProjectResponse> {
    return this.projectService.clearCover(params.projectId);
  }
}
