import { RequirePermission } from '@shadow-library/auth/module';
import { AppError } from '@shadow-library/common';
import { Body, Delete, ErrorResponseDto, Get, HttpController, type HttpResponse, Params, Post, Put, Res, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';

import { SYNAPSE_PERMISSIONS } from '@modules/auth';
import { CredentialService } from '@modules/credentials';

import { CallerService } from './caller.service';
import {
  CreateCredentialBody,
  CredentialInUseResponse,
  CredentialListResponse,
  CredentialParams,
  CredentialResponse,
  CredentialTestResponse,
  KeyringStatusResponse,
  RotateCredentialBody,
} from './credentials.dto';

const CONFLICT = 409;
const MANAGE = SYNAPSE_PERMISSIONS.credentialsManage;
/** The short PDP cache, so taking the permission away takes effect within a minute */
const HIGH_RISK = { highRisk: true };

@HttpController('/api/v1/admin/credentials')
export class CredentialsController {
  constructor(
    private readonly caller: CallerService,
    private readonly credentials: CredentialService,
  ) {}

  @Get()
  @RequirePermission(MANAGE, HIGH_RISK)
  @RespondFor(200, CredentialListResponse)
  async listCredentials(): Promise<CredentialListResponse> {
    this.caller.user();
    return { items: await this.credentials.list() };
  }

  @Post()
  @RequirePermission(MANAGE, HIGH_RISK)
  @RespondFor(201, CredentialResponse)
  @RespondFor(CONFLICT, ErrorResponseDto)
  createCredential(@Body() body: CreateCredentialBody): Promise<CredentialResponse> {
    const user = this.caller.user();
    return this.credentials.create(body, user.sub);
  }

  @Get('/status/keyring')
  @RequirePermission(MANAGE, HIGH_RISK)
  @RespondFor(200, KeyringStatusResponse)
  getKeyringStatus(): Promise<KeyringStatusResponse> {
    this.caller.user();
    return this.credentials.keyringStatus();
  }

  @Get('/:id')
  @RequirePermission(MANAGE, HIGH_RISK)
  @RespondFor(200, CredentialResponse)
  getCredential(@Params() params: CredentialParams): Promise<CredentialResponse> {
    this.caller.user();
    return this.credentials.get(params.id);
  }

  @Put('/:id/secret')
  @RequirePermission(MANAGE, HIGH_RISK)
  @RespondFor(200, CredentialResponse)
  @RespondFor(CONFLICT, ErrorResponseDto)
  rotateCredential(@Params() params: CredentialParams, @Body() body: RotateCredentialBody): Promise<CredentialResponse> {
    const user = this.caller.user();
    return this.credentials.rotate(params.id, body.secret, user.sub);
  }

  @Post('/:id/test')
  @RequirePermission(MANAGE, HIGH_RISK)
  @RespondFor(200, CredentialTestResponse)
  testCredential(@Params() params: CredentialParams): Promise<CredentialTestResponse> {
    this.caller.user();
    return this.credentials.test(params.id);
  }

  /** `toResponse()` carries no error data, so the referencing providers are added to the 409 body here. */
  @Delete('/:id')
  @RequirePermission(MANAGE, HIGH_RISK)
  @RespondFor(200, CredentialResponse)
  @RespondFor(CONFLICT, CredentialInUseResponse)
  async revokeCredential(@Params() params: CredentialParams, @Res() response: HttpResponse): Promise<CredentialResponse | HttpResponse> {
    const user = this.caller.user();
    try {
      return await this.credentials.revoke(params.id, user.sub);
    } catch (error) {
      if (!AppError.is(error, AppErrorCode.CRED_IN_USE)) throw error;
      const referencedBy: unknown = error.data?.referencedBy;
      return response.status(error.status).send({ ...error.toResponse(), referencedBy: Array.isArray(referencedBy) ? referencedBy : [] });
    }
  }
}
