/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { Body, Delete, HttpController, HttpStatus, Params, Post, Req, RespondFor } from '@shadow-library/fastify';
import {
  type AuthenticatorAttachment,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { SessionAuthService, SessionService } from '@server/modules/auth/session';

import { OperationSuccessResponse } from './mfa.dto';
import { MfaService } from './mfa.service';
import { RecoveryCodeService } from './recovery-code.service';
import { WebauthnRegisterResponse, WebauthnRegisterVerifyBody, WebauthnRegistrationOptionsResponse } from './webauthn.dto';
import { WebauthnService } from './webauthn.service';

/**
 * Defining types
 */

@Schema()
export class WebauthnRemoveParams {
  @Field()
  credentialId: string;
}

/**
 * Declaring the constants
 */

@HttpController('/api/v1/me/webauthn')
export class WebauthnController {
  constructor(
    private readonly webauthnService: WebauthnService,
    private readonly mfaService: MfaService,
    private readonly recoveryCodeService: RecoveryCodeService,
    private readonly sessionAuthService: SessionAuthService,
    private readonly sessionService: SessionService,
  ) {}

  /** Adding the first factor needs only a session; changing factors once MFA exists needs step-up. */
  private async authorizeFactorChange(request: FastifyRequest): Promise<bigint> {
    const session = await this.sessionAuthService.authenticate(request);
    if ((await this.mfaService.hasMfa(session.userId)) && !this.sessionService.isElevated(session)) throw AppErrorCode.AUTH_006.create();
    return session.userId;
  }

  @Post('/register/options')
  @HttpStatus(200)
  @RespondFor(200, WebauthnRegistrationOptionsResponse)
  async registerOptions(@Req() request: FastifyRequest): Promise<WebauthnRegistrationOptionsResponse> {
    const userId = await this.authorizeFactorChange(request);
    return this.toRegistrationOptions(await this.webauthnService.startRegistration(userId));
  }

  @Post('/register/verify')
  @HttpStatus(200)
  @RespondFor(200, WebauthnRegisterResponse)
  async registerVerify(@Body() body: WebauthnRegisterVerifyBody, @Req() request: FastifyRequest): Promise<WebauthnRegisterResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    if ((await this.mfaService.hasMfa(session.userId)) && !this.sessionService.isElevated(session)) throw AppErrorCode.AUTH_006.create();

    const response: RegistrationResponseJSON = {
      id: body.id,
      rawId: body.rawId,
      type: body.type,
      response: {
        clientDataJSON: body.response.clientDataJSON,
        attestationObject: body.response.attestationObject,
        transports: body.response.transports as AuthenticatorTransportFuture[] | undefined,
      },
      clientExtensionResults: {},
      authenticatorAttachment: body.authenticatorAttachment as AuthenticatorAttachment | undefined,
    };
    await this.webauthnService.finishRegistration(session.userId, response, body.label);
    await this.sessionService.elevate(session.id);

    const hasCodes = (await this.recoveryCodeService.countRemaining(session.userId)) > 0;
    const recoveryCodes = hasCodes ? undefined : await this.recoveryCodeService.generate(session.userId);
    return { success: true, recoveryCodes };
  }

  @Delete('/:credentialId')
  @RespondFor(200, OperationSuccessResponse)
  async remove(@Params() params: WebauthnRemoveParams, @Req() request: FastifyRequest): Promise<OperationSuccessResponse> {
    const session = await this.sessionAuthService.authenticateElevated(request);
    await this.webauthnService.remove(session.userId, params.credentialId);
    return { success: true };
  }

  private toRegistrationOptions(options: PublicKeyCredentialCreationOptionsJSON): WebauthnRegistrationOptionsResponse {
    return {
      rp: { name: options.rp.name, id: options.rp.id },
      user: options.user,
      challenge: options.challenge,
      pubKeyCredParams: options.pubKeyCredParams.map(param => ({ alg: param.alg, type: param.type })),
      timeout: options.timeout,
      excludeCredentials: options.excludeCredentials?.map(credential => ({ id: credential.id, type: credential.type, transports: credential.transports })),
      authenticatorSelection: options.authenticatorSelection,
      attestation: options.attestation,
      extensions: options.extensions ? { credProps: options.extensions.credProps } : undefined,
    };
  }
}
