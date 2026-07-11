/**
 * Importing npm packages
 */
import { Config } from '@shadow-library/common';
import { Body, Get, Header, HttpController, Post, Query, Req, Res, RespondFor, ServerError } from '@shadow-library/fastify';
import { type FastifyReply, type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { KeyService } from '@server/modules/auth/keys';
import { SESSION_COOKIE_NAME } from '@server/modules/auth/session';
import { UserEmailService } from '@server/modules/identity/user';

import { AccessTokenService } from './access-token.service';
import { AuthorizeQuery, DiscoveryResponse, TokenRequestBody, TokenResponse, UserInfoResponse } from './oauth.dto';
import { ClientCredential, OAuthService } from './oauth.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController()
export class OAuthController {
  private readonly issuer = Config.get('oauth.issuer');
  private readonly loginUrl = Config.get('oauth.login-url');

  constructor(
    private readonly oauthService: OAuthService,
    private readonly accessTokenService: AccessTokenService,
    private readonly keyService: KeyService,
    private readonly userEmailService: UserEmailService,
  ) {}

  @Get('/.well-known/openid-configuration')
  @Header('cache-control', 'public, max-age=300')
  @RespondFor(200, DiscoveryResponse)
  discovery(): DiscoveryResponse {
    return {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/oauth2/authorize`,
      token_endpoint: `${this.issuer}/oauth2/token`,
      userinfo_endpoint: `${this.issuer}/oauth2/userinfo`,
      jwks_uri: `${this.issuer}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['EdDSA'],
      code_challenge_methods_supported: ['S256'],
    };
  }

  @Get('/oauth2/authorize')
  async authorize(@Query() query: AuthorizeQuery, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const sessionSecret = request.cookies[SESSION_COOKIE_NAME];
    const result = await this.oauthService.authorize(
      {
        clientId: query.client_id,
        redirectUri: query.redirect_uri,
        responseType: query.response_type,
        scope: query.scope ?? 'openid',
        state: query.state,
        nonce: query.nonce,
        codeChallenge: query.code_challenge,
        codeChallengeMethod: query.code_challenge_method,
        resource: query.resource,
      },
      sessionSecret,
    );

    if (result.kind === 'login') {
      const returnTo = encodeURIComponent(`${this.issuer}${request.url}`);
      reply.status(302).redirect(`${this.loginUrl}?return_to=${returnTo}`);
      return;
    }
    reply.status(302).redirect(result.url);
  }

  @Post('/oauth2/token')
  @RespondFor(200, TokenResponse)
  async token(@Body() body: TokenRequestBody, @Req() request: FastifyRequest): Promise<TokenResponse> {
    const credential = this.parseClientCredential(request, body);
    const result = await this.oauthService.token(
      {
        grantType: body.grant_type,
        code: body.code,
        redirectUri: body.redirect_uri,
        codeVerifier: body.code_verifier,
        refreshToken: body.refresh_token,
        scope: body.scope,
        resource: body.resource,
      },
      credential,
    );
    return {
      access_token: result.accessToken,
      token_type: result.tokenType,
      expires_in: result.expiresIn,
      scope: result.scope,
      id_token: result.idToken,
      refresh_token: result.refreshToken,
    };
  }

  @Get('/oauth2/userinfo')
  @RespondFor(200, UserInfoResponse)
  async userinfo(@Req() request: FastifyRequest): Promise<UserInfoResponse> {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const claims = token ? this.keyService.verify(token) : null;
    if (!claims || typeof claims.sub !== 'string' || typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) throw new ServerError(AppErrorCode.OAU_002);

    const email = await this.userEmailService.getPrimaryEmail(BigInt(claims.sub));
    return { sub: claims.sub, email: email ?? undefined, email_verified: email ? true : undefined };
  }

  private parseClientCredential(request: FastifyRequest, body: TokenRequestBody): ClientCredential {
    const header = request.headers.authorization;
    if (header?.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString();
      const separator = decoded.indexOf(':');
      if (separator !== -1) return { clientId: decoded.slice(0, separator), clientSecret: decoded.slice(separator + 1) };
    }
    if (!body.client_id) throw new ServerError(AppErrorCode.OAU_002);
    return { clientId: body.client_id, clientSecret: body.client_secret };
  }
}
