import { Authenticated } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import { CreateSeedBody, ListSeedsResponse, SeedProjectParams, SeedResponse } from './ideation.dto';
import { IdeationService } from './ideation.service';

@Authenticated()
@HttpController('/api/v1/seeds')
export class SeedController {
  constructor(private readonly ideationService: IdeationService) {}

  @Post()
  @RespondFor(201, SeedResponse)
  createSeed(@Body() body: CreateSeedBody): Promise<SeedResponse> {
    return this.ideationService.createSeed(body);
  }

  @Get()
  @RespondFor(200, ListSeedsResponse)
  listSeeds(): Promise<ListSeedsResponse> {
    return this.ideationService.listSeeds();
  }
}

@Authenticated()
@HttpController('/api/v1/projects/:projectId')
export class IdeationController {
  constructor(private readonly ideationService: IdeationService) {}

  @Get('/seed')
  @RespondFor(200, SeedResponse)
  getSeed(@Params() params: SeedProjectParams): Promise<SeedResponse> {
    return this.ideationService.getSeed(params.projectId);
  }
}
