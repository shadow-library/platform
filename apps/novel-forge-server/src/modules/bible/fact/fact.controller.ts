import { Authenticated } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Put, RespondFor } from '@shadow-library/fastify';

import { FactKeyParams, FactKnowledgeParams, FactProjectParams, FactResponse, ListFactsResponse, RevealFactBody, UpsertFactBody } from './fact.dto';
import { FactService } from './fact.service';

@Authenticated()
@HttpController('/api/v1/projects/:projectId/facts')
export class FactController {
  constructor(private readonly factService: FactService) {}

  @Get()
  @RespondFor(200, ListFactsResponse)
  async listFacts(@Params() params: FactProjectParams): Promise<ListFactsResponse> {
    const facts = await this.factService.list(params.projectId);
    return { facts };
  }

  @Get('/:factKey')
  @RespondFor(200, FactResponse)
  getFact(@Params() params: FactKeyParams): Promise<FactResponse> {
    return this.factService.get(params.projectId, params.factKey);
  }

  @Put('/:factKey')
  @RespondFor(200, FactResponse)
  upsertFact(@Params() params: FactKeyParams, @Body() body: UpsertFactBody): Promise<FactResponse> {
    return this.factService.upsert(params.projectId, params.factKey, body);
  }

  @Delete('/:factKey')
  @HttpStatus(204)
  deleteFact(@Params() params: FactKeyParams): Promise<void> {
    return this.factService.delete(params.projectId, params.factKey);
  }

  @Post('/:factKey/reveal')
  @RespondFor(200, FactResponse)
  revealFact(@Params() params: FactKeyParams, @Body() body: RevealFactBody): Promise<FactResponse> {
    return this.factService.reveal(params.projectId, params.factKey, body);
  }

  @Delete('/:factKey/knowledge/:entityKey')
  @RespondFor(200, FactResponse)
  retractKnowledge(@Params() params: FactKnowledgeParams): Promise<FactResponse> {
    return this.factService.retract(params.projectId, params.factKey, params.entityKey);
  }
}
