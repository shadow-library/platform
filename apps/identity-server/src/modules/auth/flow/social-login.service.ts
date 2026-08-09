import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { IdentityProviderService, type SocialProviderKind, UpstreamOidcService } from '@server/modules/auth/federation';
import { AUTH_MODE_REGISTRY, AuthMode, AuthModeService, SOCIAL_AUTH_MODES } from '@server/modules/system/auth-mode';

import { AuthFlowService, DeviceContext, sanitizeReturnTo } from './auth-flow.service';

export interface SocialProviderOption {
  provider: SocialProviderKind;
  label: string;
}

export interface AvailableAuthMethods {
  password: boolean;
  passkey: boolean;
  emailOtp: boolean;
  smsOtp: boolean;
  social: SocialProviderOption[];
}

export interface SocialLoginStart {
  flowId: string;
  authorizationUrl: string;
}

export interface StartSocialLoginInput {
  provider: SocialProviderKind;
  device: DeviceContext;
  returnTo?: string;
}

const AWAITING_FEDERATED = 'AWAITING_FEDERATED';

@Injectable()
export class SocialLoginService {
  private readonly issuer = Config.get('oauth.issuer');

  constructor(
    private readonly authFlowService: AuthFlowService,
    private readonly authModeService: AuthModeService,
    private readonly identityProviderService: IdentityProviderService,
    private readonly upstreamOidcService: UpstreamOidcService,
  ) {}

  async listAvailableMethods(): Promise<AvailableAuthMethods> {
    const modes = await this.authModeService.list();
    const enabled = new Set(modes.filter(mode => mode.enabled).map(mode => mode.method));
    const social = SOCIAL_AUTH_MODES.filter(mode => enabled.has(mode)).map(mode => ({ provider: mode as SocialProviderKind, label: AUTH_MODE_REGISTRY[mode].label }));
    return { password: enabled.has('PASSWORD'), passkey: enabled.has('WEBAUTHN'), emailOtp: enabled.has('EMAIL_OTP'), smsOtp: enabled.has('SMS_OTP'), social };
  }

  /**
   * The upstream identity is unknown until the callback returns, so the flow starts with no identifier
   * and no user; `LoginService.continueFederated` fills both in once the id token is verified.
   */
  async start(input: StartSocialLoginInput): Promise<SocialLoginStart> {
    if (!(await this.authModeService.isEnabled(input.provider as AuthMode))) throw AppErrorCode.FED_002.create();

    const provider = await this.identityProviderService.getGlobal(input.provider);
    if (!provider?.isActive) throw AppErrorCode.FED_002.create();

    const federated = { identityProviderId: provider.id, nonce: randomBytes(16).toString('base64url'), codeVerifier: randomBytes(32).toString('base64url'), enforced: false };
    const returnTo = sanitizeReturnTo(input.returnTo, this.issuer);
    const flow = await this.authFlowService.create('LOGIN', AWAITING_FEDERATED, { authMethod: provider.kind, device: input.device, returnTo, federated });
    const codeChallenge = createHash('sha256').update(federated.codeVerifier).digest('base64url');
    const authorizationUrl = this.upstreamOidcService.buildAuthorizationUrl(provider, { state: flow.flowId, nonce: federated.nonce, codeChallenge });
    return { flowId: flow.flowId, authorizationUrl };
  }
}
