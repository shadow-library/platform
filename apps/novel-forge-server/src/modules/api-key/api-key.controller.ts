import { Authenticated, RequirePermission } from '@shadow-library/auth/module';
import { ApiOperation, Body, Delete, Get, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

import { CURATE_PERMISSION } from '@server/constants';

import { ApiKeyAuthenticated } from './api-key.decorators';
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

/**
 * Self-revocation lives on its own controller because `@ApiKeyAuthenticated()` and the sibling's
 * class-level `@Authenticated()` are mutually exclusive — the package `AuthGuard` sorts ahead of
 * `ApiKeyGuard` and would reject a key-only caller with `IAM_001`. `/current` is a static segment, so
 * the router prefers it over the sibling's `/:id` no matter which controller registers first.
 */
@ApiKeyAuthenticated({ skipOwnerCheck: true })
@HttpController('/api/v1/api-keys')
export class ApiKeySelfController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Delete('/current')
  @HttpStatus(204)
  @ApiOperation({
    description:
      'Revokes the key presented in the `x-api-key` header, so a client rotating its credential can retire the old one holding nothing but that old one. Not idempotent: a repeat call is answered 401 `KEY_002` by the authentication guard, which a client should treat as already-retired rather than as a failure.',
  })
  revokeCurrentApiKey(): Promise<void> {
    return this.apiKeyService.revokeSelf();
  }
}
