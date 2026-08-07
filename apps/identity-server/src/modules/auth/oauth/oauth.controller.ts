import { type FastifyReply, type FastifyRequest } from 'fastify';
import { Config } from '@shadow-library/common';
import { Body, Get, Header, HttpController, HttpStatus, Post, Query, Req, Res, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { OIDC_PROFILE_SCOPE } from '@server/constants';
import { Auth } from '@server/modules/access';
import { KeyService } from '@server/modules/auth/keys';
import { SESSION_COOKIE_NAME } from '@server/modules/auth/session';
import { UserEmailService, UserService } from '@server/modules/identity/user';
import { M2MBudget } from '@server/modules/infrastructure/security';

import { AccessTokenService } from './access-token.service';
import { OAuthClientService } from './oauth-client.service';
import { TOKEN_EXCHANGE_GRANT } from './oauth.constants';
import { AuthorizeQuery, DiscoveryResponse, IntrospectionResponseDto, RevocationResponse, TokenActionBody, TokenRequestBody, TokenResponse, UserInfoResponse } from './oauth.dto';
import { ClientCredential, OAuthService } from './oauth.service';

interface ClientAuthenticationBody {
  client_id?: string;
  client_secret?: string;
  client_assertion_type?: string;
  client_assertion?: string;
}

const JWT_BEARER_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

@HttpController()
export class OAuthController {
  private readonly issuer = Config.get('oauth.issuer');
  private readonly loginUrl = Config.get('oauth.login-url');

  constructor(
    private readonly oauthService: OAuthService,
    private readonly accessTokenService: AccessTokenService,
    private readonly clientService: OAuthClientService,
    private readonly keyService: KeyService,
    private readonly userEmailService: UserEmailService,
    private readonly userService: UserService,
  ) {}

  @Get('/.well-known/openid-configuration')
  @Auth({ public: true })
  @Header('cache-control', 'public, max-age=300')
  @RespondFor(200, DiscoveryResponse)
  async getOpenidConfiguration(): Promise<DiscoveryResponse> {
    return {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/oauth2/authorize`,
      token_endpoint: `${this.issuer}/oauth2/token`,
      userinfo_endpoint: `${this.issuer}/oauth2/userinfo`,
      jwks_uri: `${this.issuer}/.well-known/jwks.json`,
      revocation_endpoint: `${this.issuer}/oauth2/revoke`,
      introspection_endpoint: `${this.issuer}/oauth2/introspect`,
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'private_key_jwt', 'none'],
      scopes_supported: await this.clientService.listActiveScopeNames(),
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials', TOKEN_EXCHANGE_GRANT],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['EdDSA'],
      code_challenge_methods_supported: ['S256'],
      backchannel_logout_supported: true,
      backchannel_logout_session_supported: true,
      step_up_endpoint: `${this.issuer}/step-up`,
      app_session_endpoint: `${this.issuer}/api/v1/app-sessions`,
    };
  }

  @Get('/oauth2/authorize')
  @Auth({ public: true })
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
  @Auth({ public: true })
  @M2MBudget()
  @RespondFor(200, TokenResponse)
  async exchangeToken(@Body() body: TokenRequestBody, @Req() request: FastifyRequest): Promise<TokenResponse> {
    this.assertFormEncoded(request);
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
        subjectToken: body.subject_token,
        subjectTokenType: body.subject_token_type,
        requestedTokenType: body.requested_token_type,
        actorToken: body.actor_token,
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
      issued_token_type: result.issuedTokenType,
    };
  }

  @Get('/oauth2/userinfo')
  @Auth({ public: true })
  @RespondFor(200, UserInfoResponse)
  async getUserInfo(@Req() request: FastifyRequest): Promise<UserInfoResponse> {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const claims = token ? this.keyService.verify(token) : null;
    if (!claims || typeof claims.sub !== 'string' || typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) throw AppErrorCode.OAU_002.create();
    if (claims.token_type === 'service') throw AppErrorCode.OAU_002.create();

    const userId = BigInt(claims.sub);
    const scopes = new Set(typeof claims.scope === 'string' ? claims.scope.split(' ').filter(Boolean) : []);
    const email = await this.userEmailService.getPrimaryEmail(userId);
    const profile = scopes.has(OIDC_PROFILE_SCOPE) ? await this.userService.getProfileClaims(userId) : {};
    return { sub: claims.sub, email: email ?? undefined, email_verified: email ? true : undefined, ...profile };
  }

  @Post('/oauth2/revoke')
  @Auth({ public: true })
  @HttpStatus(200)
  @RespondFor(200, RevocationResponse)
  async revokeToken(@Body() body: TokenActionBody, @Req() request: FastifyRequest): Promise<RevocationResponse> {
    this.assertFormEncoded(request);
    await this.oauthService.revoke(body.token, this.parseClientCredential(request, body));
    return { revoked: true };
  }

  @Post('/oauth2/introspect')
  @Auth({ public: true })
  @HttpStatus(200)
  @RespondFor(200, IntrospectionResponseDto)
  async introspectToken(@Body() body: TokenActionBody, @Req() request: FastifyRequest): Promise<IntrospectionResponseDto> {
    this.assertFormEncoded(request);
    const result = await this.oauthService.introspect(body.token, this.parseClientCredential(request, body));
    return { active: result.active, sub: result.sub, scope: result.scope, aud: result.aud, exp: result.exp, client_id: result.clientId, token_type: result.tokenType };
  }

  private assertFormEncoded(request: FastifyRequest): void {
    const contentType = request.headers['content-type'] ?? '';
    if (!contentType.startsWith(FORM_CONTENT_TYPE)) throw AppErrorCode.OAU_001.create();
  }

  private parseClientCredential(request: FastifyRequest, body: ClientAuthenticationBody): ClientCredential {
    const header = request.headers.authorization;
    if (header?.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString();
      const separator = decoded.indexOf(':');
      if (separator !== -1) return { clientId: decoded.slice(0, separator), clientSecret: decoded.slice(separator + 1) };
    }
    if (body.client_assertion) {
      if (body.client_assertion_type !== JWT_BEARER_ASSERTION_TYPE) throw AppErrorCode.OAU_002.create();
      return { clientId: body.client_id, clientAssertion: body.client_assertion };
    }
    if (!body.client_id) throw AppErrorCode.OAU_002.create();
    return { clientId: body.client_id, clientSecret: body.client_secret };
  }
}
