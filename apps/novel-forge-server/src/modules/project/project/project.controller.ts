/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

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
} from './project.dto';
import { ProjectService } from './project.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @RespondFor(201, ProjectResponse)
  createProject(@Body() body: CreateProjectBody): Promise<ProjectResponse> {
    return this.projectService.create(body) as unknown as Promise<ProjectResponse>;
  }

  @Get()
  @RespondFor(200, ListProjectResponse)
  listProjects(@Query() query: ListProjectsQuery): Promise<ListProjectResponse> {
    return this.projectService.list(query) as unknown as Promise<ListProjectResponse>;
  }

  @Get('/:projectId')
  @RespondFor(200, ProjectResponse)
  async getProject(@Params() params: ProjectParams): Promise<ProjectResponse> {
    const project = await this.projectService.get(params.projectId);
    if (!project) throw new ServerError(AppErrorCode.PRJ_001);
    return project as unknown as ProjectResponse;
  }

  @Get('/:projectId/status')
  @RespondFor(200, ProjectStatusResponse)
  getProjectStatus(@Params() params: ProjectParams): Promise<ProjectStatusResponse> {
    return this.projectService.status(params.projectId) as unknown as Promise<ProjectStatusResponse>;
  }

  @Patch('/:projectId')
  @RespondFor(200, ProjectResponse)
  updateProject(@Params() params: ProjectParams, @Body() body: UpdateProjectBody): Promise<ProjectResponse> {
    return this.projectService.update(params.projectId, body) as unknown as Promise<ProjectResponse>;
  }

  @Post('/:projectId/clone')
  @RespondFor(201, ProjectResponse)
  cloneProject(@Params() params: ProjectParams, @Body() body: CloneProjectBody): Promise<ProjectResponse> {
    return this.projectService.clone(params.projectId, body) as unknown as Promise<ProjectResponse>;
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
}
