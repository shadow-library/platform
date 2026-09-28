import { type Mock, mock } from 'bun:test';

import { FakeDatabaseService, InMemoryRedis } from '@shadow-library/modules/testing';
import { setConfig } from '@shadow-library/common/testing';

import { type AccessTokenInput, type AccessTokenService } from '@server/modules/auth/oauth/access-token.service';
import { AuthorizationCodeService } from '@server/modules/auth/oauth/authorization-code.service';
import { type GrantedScope, type OAuthClientService } from '@server/modules/auth/oauth/oauth-client.service';
import { OAuthService } from '@server/modules/auth/oauth/oauth.service';
import { type RefreshTokenService } from '@server/modules/auth/token';
import { type OAuthClient } from '@server/modules/infrastructure/datastore';
import { RateLimiterService } from '@server/modules/infrastructure/security/rate-limiter.service';
import { type ApplicationAccessService } from '@server/modules/system/application';

export const USER_ID = '42';
export const SESSION_ID = '7';
export const REDIRECT_URI = 'https://app.example.com/callback';
export const CODE_VERIFIER = 'a'.repeat(43);
export const CODE_CHALLENGE = 'ZtNPunH49FD35FWYhT5Tv8I7vRKQJ8uxMaL0_9eHjNA';

export interface HarnessOptions {
  client?: Partial<OAuthClient>;
  scopes?: GrantedScope[];
}

export interface OAuthHarness {
  service: OAuthService;
  client: OAuthClient;
  redis: InMemoryRedis;
  minted: AccessTokenInput[];
  issueCode(scope: string, resource?: string): Promise<string>;
  issueRefresh: Mock<RefreshTokenService['issue']>;
  revokeFamily: Mock<RefreshTokenService['revokeFamily']>;
  rateLimiterService: RateLimiterService;
}

export function oauthClient(overrides: Partial<OAuthClient> = {}): OAuthClient {
  return {
    id: 'third-party-app',
    applicationId: 9,
    name: 'third-party-app',
    kind: 'WEB_CONFIDENTIAL',
    isFirstParty: false,
    tokenEndpointAuthMethod: 'client_secret_basic',
    grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
    requirePkce: true,
    workloadSubjects: null,
    accessTokenTtl: 600,
    refreshTokenTtl: null,
    organisationId: null,
    backchannelLogoutUri: null,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

export function buildOAuthService(options: HarnessOptions = {}): OAuthHarness {
  setConfig({ 'rate-limit.enabled': true, 'rate-limit.ip-allowlist': '', 'oauth.login-url': 'https://identity.example.com/login' });
  const client = oauthClient(options.client);
  const scopes = options.scopes ?? [];
  const redis = new InMemoryRedis();
  const databaseService = new FakeDatabaseService({ redis });

  const minted: AccessTokenInput[] = [];
  const accessTokenService = {
    mintAccessToken: (input: AccessTokenInput) => (minted.push(input), { token: `token-${minted.length}`, expiresIn: input.ttlSeconds }),
    mintIdToken: () => 'id-token',
  } as unknown as AccessTokenService;

  const clientService = {
    getClient: (id: string) => Promise.resolve(id === client.id ? client : null),
    isBotClient: () => Promise.resolve(false),
    verifySecret: (_id: string, secret: string) => Promise.resolve(secret === 'correct-secret'),
    getAvailableScopes: (_client: OAuthClient, audience: string) =>
      Promise.resolve(new Map(scopes.filter(scope => scope.resourceIdentifier === audience).map(scope => [scope.name, scope]))),
    isOwnAudience: () => Promise.resolve(false),
    filterScopesForPrincipal: (names: string[]) => Promise.resolve(names),
  } as unknown as OAuthClientService;

  const issueRefresh = mock<RefreshTokenService['issue']>(() => Promise.resolve({ secret: 'refresh-secret', familyId: 'family-1', tokenId: 'token-1' } as never));
  const revokeFamily = mock<RefreshTokenService['revokeFamily']>(() => Promise.resolve());
  const refreshTokenService = { issue: issueRefresh, revokeFamily } as unknown as RefreshTokenService;

  const applicationAccessService = {
    resolveActiveOrganisationId: () => Promise.resolve(3n),
    assertUserAccess: () => Promise.resolve(),
  } as unknown as ApplicationAccessService;

  const rateLimiterService = new RateLimiterService(databaseService);
  const codeService = new AuthorizationCodeService(databaseService);
  const userService = { getUser: () => Promise.resolve({ id: BigInt(USER_ID), status: 'ACTIVE' }) };
  const userEmailService = { getPrimaryEmail: () => Promise.resolve(null) };
  const policyService = { resolve: () => Promise.resolve(600) };

  const service = new OAuthService(
    clientService,
    codeService,
    accessTokenService,
    refreshTokenService,
    {} as never,
    userService as never,
    userEmailService as never,
    { record: () => Promise.resolve() } as never,
    {} as never,
    {} as never,
    {} as never,
    policyService as never,
    rateLimiterService,
    applicationAccessService,
    {} as never,
  );

  const issueCode = (scope: string, resource?: string): Promise<string> =>
    codeService.issue({
      clientId: client.id,
      redirectUri: REDIRECT_URI,
      codeChallenge: CODE_CHALLENGE,
      codeChallengeMethod: 'S256',
      scope,
      resource,
      userId: USER_ID,
      sessionId: SESSION_ID,
    });

  return { service, client, redis, minted, issueCode, issueRefresh, revokeFamily, rateLimiterService };
}
