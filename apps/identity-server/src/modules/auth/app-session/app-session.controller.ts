/**
 * Importing npm packages
 */
import { Body, Delete, HttpController, HttpStatus, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { Auth, Context } from '@server/modules/access';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { OAuthClient } from '@server/modules/infrastructure/datastore';
import { M2MBudget, RateLimiterService } from '@server/modules/infrastructure/security';

import { APP_SESSION_SCOPE } from './app-session.constants';
import {
  AppSessionActionResponse,
  AppSessionHandleBody,
  AppSessionResponse,
  AppTokenResponse,
  ClaimElevationBody,
  CreateAppSessionBody,
  ElevationResponse,
  MintAppTokenBody,
} from './app-session.dto';
import { AppSessionService } from './app-session.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The first-party session surface. Every route is machine-to-machine: the application presents its own
 * service token, so possessing a session handle alone never yields a token. This is deliberately not
 * part of `/oauth2/*`, which stays a plain, conforming OAuth surface.
 */
@HttpController('/api/v1/app-sessions')
@Auth({ service: APP_SESSION_SCOPE })
@M2MBudget()
export class AppSessionController {
  constructor(
    private readonly appSessionService: AppSessionService,
    private readonly clientService: OAuthClientService,
    private readonly rateLimiterService: RateLimiterService,
  ) {}

  @Post()
  @HttpStatus(201)
  @RespondFor(201, AppSessionResponse)
  async createAppSession(@Body() body: CreateAppSessionBody): Promise<AppSessionResponse> {
    const client = await this.callingClient();
    const info = Context.getClientInfo();
    const result = await this.appSessionService.create({
      client,
      code: body.code,
      codeVerifier: body.codeVerifier,
      redirectUri: body.redirectUri,
      ipAddress: info.ip,
      userAgent: info.userAgent,
    });
    return { sessionHandle: result.handle, userId: result.userId.toString(), expiresAt: result.expiresAt.toISOString(), scope: result.scope };
  }

  @Post('/token')
  @HttpStatus(200)
  @RespondFor(200, AppTokenResponse)
  async mintToken(@Body() body: MintAppTokenBody): Promise<AppTokenResponse> {
    const client = await this.callingClient();
    const minted = await this.appSessionService.mintToken({
      client,
      handle: body.sessionHandle,
      resource: body.resource,
      scope: body.scope,
      elevated: body.elevated,
    });
    return { accessToken: minted.accessToken, tokenType: 'Bearer', expiresIn: minted.expiresIn, scope: minted.scope, audience: minted.audience, aal: minted.aal };
  }

  @Post('/elevation')
  @HttpStatus(200)
  @RespondFor(200, ElevationResponse)
  async claimElevation(@Body() body: ClaimElevationBody): Promise<ElevationResponse> {
    const client = await this.callingClient();
    const expiresAt = await this.appSessionService.claimElevation(client, body.sessionHandle, body.resource);
    return { expiresAt: expiresAt.toISOString() };
  }

  @Delete()
  @RespondFor(200, AppSessionActionResponse)
  async revokeAppSession(@Body() body: AppSessionHandleBody): Promise<AppSessionActionResponse> {
    const client = await this.callingClient();
    await this.appSessionService.revoke(client, body.sessionHandle);
    return { success: true };
  }

  /**
   * The acting client is taken from the verified service token, never from the request body, and the
   * call is charged to that client's own budget — a fleet of pods behind one egress IP is many
   * callers, not one (T-804).
   */
  private async callingClient(): Promise<OAuthClient> {
    const claims = Context.getServiceToken();
    const clientId = typeof claims.client_id === 'string' ? claims.client_id : '';
    const client = await this.clientService.getClient(clientId);
    if (!client || !client.isActive) throw AppErrorCode.OAU_002.create();
    await this.rateLimiterService.consumeClientBudget(client.id);
    return client;
  }
}
