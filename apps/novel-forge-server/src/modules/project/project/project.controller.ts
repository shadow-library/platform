/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import {
  CloneProjectBody,
  CostResponse,
  CreateProjectBody,
  ListProjectResponse,
  ListProjectsQuery,
  ProjectParams,
  ProjectResponse,
  ProjectStatusResponse,
  ResetBody,
  ResetResponse,
  UpdateProjectBody,
  UploadImageBody,
} from './project.dto';
import { ProjectService } from './project.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Authenticated()
@HttpController('/api/v1/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

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
  @RespondFor(200, ProjectResponse)
  getProject(@Params() params: ProjectParams): Promise<ProjectResponse> {
    return this.projectService.getOrThrow(params.projectId);
  }

  @Get('/:projectId/status')
  @RespondFor(200, ProjectStatusResponse)
  getProjectStatus(@Params() params: ProjectParams): Promise<ProjectStatusResponse> {
    return this.projectService.status(params.projectId);
  }

  @Patch('/:projectId')
  @RespondFor(200, ProjectResponse)
  updateProject(@Params() params: ProjectParams, @Body() body: UpdateProjectBody): Promise<ProjectResponse> {
    return this.projectService.update(params.projectId, body);
  }

  @Post('/:projectId/clone')
  @RespondFor(201, ProjectResponse)
  cloneProject(@Params() params: ProjectParams, @Body() body: CloneProjectBody): Promise<ProjectResponse> {
    return this.projectService.clone(params.projectId, body);
  }

  @Delete('/:projectId')
  @HttpStatus(204)
  deleteProject(@Params() params: ProjectParams): Promise<void> {
    return this.projectService.delete(params.projectId);
  }

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

  @Post('/:projectId/cover')
  @RespondFor(200, ProjectResponse)
  uploadCover(@Params() params: ProjectParams, @Body() body: UploadImageBody): Promise<ProjectResponse> {
    return this.projectService.setCover(params.projectId, body.image, body.mime);
  }

  @Delete('/:projectId/cover')
  @RespondFor(200, ProjectResponse)
  deleteCover(@Params() params: ProjectParams): Promise<ProjectResponse> {
    return this.projectService.clearCover(params.projectId);
  }
}
