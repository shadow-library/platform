import { describe, expect, it } from 'bun:test';

import { isReleasableAt } from '@server/modules/auth/oauth/scope-release.util';
import { type GrantedScope } from '@server/modules/auth/oauth/oauth-client.service';

import { buildOAuthService, CODE_CHALLENGE, CODE_VERIFIER, REDIRECT_URI } from './oauth-harness';
import { withinRequest } from './request-context';

const MEMOIR = 'api://memoir';
const ACCOUNT: GrantedScope = { name: 'memoir:account', resourceIdentifier: MEMOIR, isSensitive: false };
const DESTRUCTIVE: GrantedScope = { name: 'memoir:destructive', resourceIdentifier: MEMOIR, isSensitive: true };
const CONSENTED = `openid ${ACCOUNT.name} ${DESTRUCTIVE.name}`;
const SECRET = { clientSecret: 'correct-secret' };

describe('sensitive scope release', () => {
  it('should keep a consented sensitive scope on the authorization code, for an elevated app-session mint to release later', async () => {
    const { service, client, codeService } = buildOAuthService({ client: { isFirstParty: true }, scopes: [ACCOUNT, DESTRUCTIVE] });

    const result = await service.authorize(
      { clientId: client.id, redirectUri: REDIRECT_URI, responseType: 'code', scope: CONSENTED, codeChallenge: CODE_CHALLENGE, codeChallengeMethod: 'S256', resource: MEMOIR },
      'session-secret',
    );

    expect(result.kind).toBe('redirect');
    const code = new URL((result as { url: string }).url).searchParams.get('code') ?? '';
    expect((await codeService.consume(code))?.scope).toBe(CONSENTED);
  });

  it('should withhold a sensitive scope from the AAL1 token and refresh family a code exchange issues', async () => {
    const { service, client, minted, issueCode, issueRefresh } = buildOAuthService({ scopes: [ACCOUNT, DESTRUCTIVE] });
    const code = await issueCode(CONSENTED, MEMOIR);

    const result = await withinRequest(() =>
      service.token({ grantType: 'authorization_code', code, redirectUri: REDIRECT_URI, codeVerifier: CODE_VERIFIER }, { clientId: client.id, ...SECRET }),
    );

    expect(result.scope).toBe(`openid ${ACCOUNT.name}`);
    expect(minted[0]?.scope).toBe(`openid ${ACCOUNT.name}`);
    expect(minted[0]?.aal).toBeUndefined();
    expect(issueRefresh.mock.calls[0]?.[0].scope).toBe(`openid ${ACCOUNT.name}`);
  });

  it('should withhold a sensitive scope from a refreshed token even when the family still names it', async () => {
    const { service, client, minted } = buildOAuthService({ scopes: [ACCOUNT, DESTRUCTIVE], refreshFamily: { scope: CONSENTED, audience: MEMOIR } });

    const result = await withinRequest(() => service.token({ grantType: 'refresh_token', refreshToken: 'refresh-secret' }, { clientId: client.id, ...SECRET }));

    expect(result.scope).toBe(`openid ${ACCOUNT.name}`);
    expect(minted[0]?.scope).toBe(`openid ${ACCOUNT.name}`);
  });

  it('should release a sensitive scope only into an AAL2 token, and an ordinary one at either level', () => {
    expect(isReleasableAt(DESTRUCTIVE, 'AAL1')).toBe(false);
    expect(isReleasableAt(DESTRUCTIVE, 'AAL2')).toBe(true);
    expect(isReleasableAt(ACCOUNT, 'AAL1')).toBe(true);
    expect(isReleasableAt(ACCOUNT, 'AAL2')).toBe(true);
  });
});
