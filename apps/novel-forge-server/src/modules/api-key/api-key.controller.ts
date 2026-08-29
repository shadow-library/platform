import { Authenticated, RequirePermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

import { CURATE_PERMISSION } from '@server/constants';

import { ApiKeyParams, CreateApiKeyBody, CreateApiKeyResponse, ListApiKeysResponse } from './api-key.dto';
import { ApiKeyService } from './api-key.service';

@Authenticated()
@RequirePermission(CURATE_PERMISSION)
@HttpController('/api/v1/api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @RespondFor(201, CreateApiKeyResponse)
  createApiKey(@Body() body: CreateApiKeyBody): Promise<CreateApiKeyResponse> {
    return this.apiKeyService.create(body.name);
  }

  @Get()
  @RespondFor(200, ListApiKeysResponse)
  listApiKeys(): Promise<ListApiKeysResponse> {
    return this.apiKeyService.list();
  }

  @Delete('/:id')
  @HttpStatus(204)
  revokeApiKey(@Params() params: ApiKeyParams): Promise<void> {
    return this.apiKeyService.revoke(params.id);
  }
}
