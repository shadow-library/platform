import { createHash, randomBytes } from 'node:crypto';

import { type AuthenticationResponseJSON, type AuthenticatorAttachment, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import { Injectable } from '@shadow-library/app';
import { Config, Logger, ValidationError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME, ERROR_MESSAGES } from '@server/constants';
import { ADMIN_PERMISSIONS, PLATFORM_ORG_NAME } from '@server/modules/admin/admin.constants';
import { FederatedIdentityService, IdentityProviderService, UpstreamIdentity, UpstreamOidcService } from '@server/modules/auth/federation';
import { MfaService, RecoveryCodeService, WebauthnAssertion, WebauthnService } from '@server/modules/auth/mfa';
import { SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { PasswordPolicyService, PasswordService } from '@server/modules/identity/credentials';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserEmailService, UserService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { User, UserSession } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';
import { AuthModeService } from '@server/modules/system/auth-mode';

import { AuthFlowContext, AuthFlowService, DeviceContext, FederatedFlowState, sanitizeReturnTo } from './auth-flow.service';
import { OTP_RESEND_BUDGET } from './challenge-flow.service';
import { ChallengeService } from './challenge.service';
import { FlowStepResult } from './flow.types';
import { SignInEventService } from './sign-in-event.service';
import { SuspiciousLoginService } from './suspicious-login.service';

export interface LoginInitInput {
  identifier: string;
  device: DeviceContext;
  returnTo?: string;
}

export interface FederatedLoginOption {
  authorizationUrl: string;
  enforced: boolean;
}

export interface LoginInitResult {
  flowId: string;
  status: string;
  hasAlternativeMethods: boolean;
  federated?: FederatedLoginOption;
}

export interface MfaProof {
  code?: string;
  recoveryCode?: string;
}

interface CompletionOptions {
  aal?: UserSession.Aal;
  authMode?: User.AuthProvider;
  mfaMode?: User.AuthProvider;
}

export interface WebauthnChallenge {
  flowId: string;
  options: PublicKeyCredentialRequestOptionsJSON;
}

const MAX_FLOW_FAILURES = 3;
const AWAITING_PASSWORD = 'AWAITING_PASSWORD';
const AWAITING_TOTP = 'AWAITING_TOTP';
const AWAITING_MFA_WEBAUTHN = 'AWAITING_MFA_WEBAUTHN';
const AWAITING_WEBAUTHN = 'AWAITING_WEBAUTHN';
const AWAITING_FEDERATED = 'AWAITING_FEDERATED';
const AWAITING_SMS_OTP = 'AWAITING_SMS_OTP';
const AWAITING_LINK_OTP = 'AWAITING_LINK_OTP';
const AWAITING_PASSWORD_RESET = 'AWAITING_PASSWORD_RESET';
const MFA_STATUSES = [AWAITING_TOTP, AWAITING_MFA_WEBAUTHN];
const OTP_STATUSES = ['AWAITING_EMAIL_OTP', 'AWAITING_SMS_OTP'];
const LOGIN_OTP_TEMPLATE = 'auth.login.otp';
const PASSWORD_CHANGED_TEMPLATE = 'auth.password.changed';

@Injectable()
export class LoginService {
  private readonly logger = Logger.getLogger(APP_NAME, LoginService.name);
  private readonly issuer = Config.get('oauth.issuer');
  private platformOrganisationId: string | null = null;

  constructor(
    private readonly authFlowService: AuthFlowService,
    private readonly userService: UserService,
    private readonly userEmailService: UserEmailService,
    private readonly passwordService: PasswordService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly sessionService: SessionService,
    private readonly signInEventService: SignInEventService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly mfaService: MfaService,
    private readonly recoveryCodeService: RecoveryCodeService,
    private readonly webauthnService: WebauthnService,
    private readonly challengeService: ChallengeService,
    private readonly suspiciousLoginService: SuspiciousLoginService,
    private readonly identityProviderService: IdentityProviderService,
    private readonly upstreamOidcService: UpstreamOidcService,
    private readonly federatedIdentityService: FederatedIdentityService,
    private readonly organisationService: OrganisationService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly authModeService: AuthModeService,
  ) {}

  async init(input: LoginInitInput): Promise<LoginInitResult> {
    const user = await this.userService.getUser(input.identifier);
    if (!user) throw AppErrorCode.AUTH_008.create();
    this.userService.assertLoginAllowed(await this.userService.resolveEffectiveStatus(user));
    if (this.isFullyLocked(user)) throw AppErrorCode.AUTH_012.create();
    const provider = input.identifier.includes('@') ? await this.identityProviderService.routeForEmail(input.identifier.toLowerCase()) : null;

    let federated: FederatedFlowState | undefined;
    let status = AWAITING_PASSWORD;
    if (provider) {
      const breakGlass = await this.isPlatformAdmin(user.id);
      const enforced = provider.enforced && !breakGlass;
      federated = { identityProviderId: provider.id, nonce: randomBytes(16).toString('base64url'), codeVerifier: randomBytes(32).toString('base64url'), enforced };
      if (enforced) status = AWAITING_FEDERATED;
    }

    /** A phone identifier has no password step to fall back on that the member expects, so an enabled mobile mode becomes the first challenge — enforced federation still outranks it. */
    const smsFirst = status === AWAITING_PASSWORD && input.identifier.startsWith('+') && (await this.authModeService.isEnabled('SMS_OTP'));
    if (smsFirst) status = AWAITING_SMS_OTP;

    const flow = await this.authFlowService.create('LOGIN', status, {
      identifier: input.identifier,
      userId: user.id.toString(),
      authMethod: 'PASSWORD',
      device: input.device,
      returnTo: this.sanitizeReturnTo(input.returnTo),
      federated,
      resendsLeft: smsFirst ? OTP_RESEND_BUDGET : undefined,
      lastOtpSentAt: smsFirst ? Date.now() : undefined,
    });
    if (smsFirst) await this.challengeService.issue({ flowId: flow.flowId, type: 'SMS_OTP', target: input.identifier, userId: user.id, templateKey: LOGIN_OTP_TEMPLATE });

    const result: LoginInitResult = { flowId: flow.flowId, status: flow.status, hasAlternativeMethods: true };
    if (provider && federated) {
      const codeChallenge = createHash('sha256').update(federated.codeVerifier).digest('base64url');
      result.federated = {
        authorizationUrl: this.upstreamOidcService.buildAuthorizationUrl(provider, { state: flow.flowId, nonce: federated.nonce, codeChallenge }),
        enforced: federated.enforced,
      };
    }
    return result;
  }

  private sanitizeReturnTo(returnTo: string | undefined): string | undefined {
    return sanitizeReturnTo(returnTo, this.issuer);
  }

  private async isPlatformAdmin(userId: bigint): Promise<boolean> {
    if (!this.platformOrganisationId) {
      const organisation = await this.organisationService.findTeamByName(PLATFORM_ORG_NAME);
      if (!organisation) return false;
      this.platformOrganisationId = organisation.id.toString();
    }
    const principal = { type: 'USER' as const, id: userId.toString() };
    const decision = await this.policyDecisionService.check({ principal, organisationId: this.platformOrganisationId, action: ADMIN_PERMISSIONS.usersManage });
    return decision.decision === 'PERMIT';
  }

  async verifyPassword(flowId: string, password: string): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId);
    if (flow.federated?.enforced) throw AppErrorCode.AUTH_007.create();
    if (flow.status !== AWAITING_PASSWORD) throw AppErrorCode.AUTH_002.create();

    const userId = flow.userId ? BigInt(flow.userId) : null;
    const valid = await this.passwordService.verifyForUser(userId, password);
    if (!valid || !userId) return this.handleFailure(flow, userId, 'INVALID_CREDENTIALS');

    const user = await this.userService.getUser(userId);
    if (!user || user.status !== 'ACTIVE') return this.handleFailure(flow, userId, 'INVALID_CREDENTIALS');
    if (this.isOtpLocked(user)) return this.handleFailure(flow, userId, 'INVALID_CREDENTIALS');
    if (user.passwordResetRequired) {
      const next = await this.authFlowService.update(flow, { status: AWAITING_PASSWORD_RESET });
      return { outcome: 'CONTINUE', flowId: flow.flowId, status: next.status };
    }

    const factors = await this.mfaService.getFactors(userId);
    if (factors.totp || factors.webauthn) {
      const next = await this.authFlowService.update(flow, { status: factors.totp ? AWAITING_TOTP : AWAITING_MFA_WEBAUTHN });
      return { outcome: 'CONTINUE', flowId: flow.flowId, status: next.status };
    }
    return this.complete(flow, userId, {});
  }

  async resetPassword(flowId: string, currentPassword: string, newPassword: string): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId);
    if (flow.status !== AWAITING_PASSWORD_RESET) throw AppErrorCode.AUTH_002.create();

    const userId = flow.userId ? BigInt(flow.userId) : null;
    const valid = await this.passwordService.verifyForUser(userId, currentPassword);
    if (!valid || !userId) return this.handleFailure(flow, userId, 'INVALID_CREDENTIALS');

    const user = await this.userService.getUser(userId);
    if (!user || user.status !== 'ACTIVE') return this.handleFailure(flow, userId, 'INVALID_CREDENTIALS');

    await this.passwordPolicyService.assertAcceptable(newPassword);
    if (await this.passwordService.isReused(userId, newPassword)) throw new ValidationError('password', ERROR_MESSAGES.REUSED_PASSWORD);

    const email = (await this.userEmailService.getPrimaryEmail(userId)) ?? flow.identifier;
    await this.passwordService.changePassword(userId, newPassword, email);
    await this.sessionService.terminateAllForUser(userId);
    await this.auditService.record({ action: 'auth.login.password_reset', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString(), ipAddress: flow.device.ipAddress });
    await this.notificationService.enqueue({ templateKey: PASSWORD_CHANGED_TEMPLATE, recipients: { email }, payload: { ipAddress: flow.device.ipAddress } });

    const factors = await this.mfaService.getFactors(userId);
    if (factors.totp || factors.webauthn) {
      const next = await this.authFlowService.update(flow, { status: factors.totp ? AWAITING_TOTP : AWAITING_MFA_WEBAUTHN });
      return { outcome: 'CONTINUE', flowId: flow.flowId, status: next.status };
    }
    return this.complete(flow, userId, {});
  }

  async verifyOtp(flowId: string, code: string): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId);
    const pendingSubject = flow.status === AWAITING_LINK_OTP ? flow.federated?.pendingSubject : undefined;
    if (!pendingSubject) {
      if (flow.federated?.enforced) throw AppErrorCode.AUTH_007.create();
      if (!OTP_STATUSES.includes(flow.status)) throw AppErrorCode.AUTH_002.create();
    }

    const userId = flow.userId ? BigInt(flow.userId) : null;
    const valid = Boolean(userId) && (await this.challengeService.verify(flowId, code));
    if (!valid || !userId) return this.handleFailure(flow, userId, 'INVALID_CREDENTIALS');

    const user = await this.userService.getUser(userId);
    if (!user || user.status !== 'ACTIVE') return this.handleFailure(flow, userId, 'INVALID_CREDENTIALS');

    if (pendingSubject && flow.federated) {
      await this.federatedIdentityService.link(flow.federated.identityProviderId, userId, pendingSubject);
      await this.joinProviderOrganisation(flow.federated.identityProviderId, userId);
      await this.auditService.record({
        action: 'auth.federated.linked',
        outcome: 'SUCCESS',
        actorType: 'USER',
        actorId: userId.toString(),
        targetType: 'identity_provider',
        targetId: flow.federated.identityProviderId,
        ipAddress: flow.device.ipAddress,
      });
    }

    const factors = await this.mfaService.getFactors(userId);
    if (factors.totp || factors.webauthn) {
      const next = await this.authFlowService.update(flow, { status: factors.totp ? AWAITING_TOTP : AWAITING_MFA_WEBAUTHN });
      return { outcome: 'CONTINUE', flowId: flow.flowId, status: next.status };
    }
    return this.complete(flow, userId, { authMode: pendingSubject ? 'FEDERATED' : 'OTP' });
  }

  async continueFederated(flowId: string, identity: UpstreamIdentity): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId);
    const federated = flow.federated;
    if (!federated || ![AWAITING_FEDERATED, AWAITING_PASSWORD].includes(flow.status)) throw AppErrorCode.AUTH_002.create();

    const link = await this.federatedIdentityService.findBySubject(federated.identityProviderId, identity.subject);
    if (link) {
      const user = await this.userService.getUser(link.userId);
      if (!user || user.status !== 'ACTIVE') return this.handleFailure(flow, link.userId, 'INVALID_CREDENTIALS');
      flow.userId = link.userId.toString();
      flow.identifier = flow.identifier || identity.email;
      return this.continueAfterFederatedProof(flow, link.userId);
    }

    const existing = await this.userService.getUser(identity.email);
    if (existing) {
      if (existing.status !== 'ACTIVE') return this.handleFailure(flow, existing.id, 'INVALID_CREDENTIALS');
      const next = await this.authFlowService.update(flow, {
        status: AWAITING_LINK_OTP,
        userId: existing.id.toString(),
        identifier: identity.email,
        federated: { ...federated, pendingSubject: identity.subject },
      });
      await this.challengeService.issue({ flowId: flow.flowId, type: 'EMAIL_OTP', target: identity.email, userId: existing.id, templateKey: LOGIN_OTP_TEMPLATE });
      return { outcome: 'CONTINUE', flowId: flow.flowId, status: next.status };
    }

    const provider = await this.identityProviderService.getById(federated.identityProviderId);
    if (provider && !provider.allowSignUp) throw AppErrorCode.FED_006.create();

    const created = await this.userService.createProvisionedUser({ email: identity.email, emailVerified: true, status: 'ACTIVE' });
    await this.joinProviderOrganisation(federated.identityProviderId, created.id);
    await this.federatedIdentityService.link(federated.identityProviderId, created.id, identity.subject);
    await this.auditService.record({
      action: 'auth.federated.jit_provisioned',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: created.id.toString(),
      targetType: 'identity_provider',
      targetId: federated.identityProviderId,
      ipAddress: flow.device.ipAddress,
    });
    flow.userId = created.id.toString();
    flow.identifier = identity.email;
    return this.continueAfterFederatedProof(flow, created.id);
  }

  private async continueAfterFederatedProof(flow: AuthFlowContext, userId: bigint): Promise<FlowStepResult> {
    const factors = await this.mfaService.getFactors(userId);
    if (factors.totp || factors.webauthn) {
      const next = await this.authFlowService.update(flow, {
        status: factors.totp ? AWAITING_TOTP : AWAITING_MFA_WEBAUTHN,
        userId: userId.toString(),
        identifier: flow.identifier,
      });
      return { outcome: 'CONTINUE', flowId: flow.flowId, status: next.status };
    }
    return this.complete(flow, userId, { authMode: 'FEDERATED' });
  }

  private async joinProviderOrganisation(identityProviderId: string, userId: bigint): Promise<void> {
    const provider = await this.identityProviderService.getById(identityProviderId);
    if (provider?.organisationId) await this.organisationService.ensureMember(provider.organisationId, userId, 'MEMBER');
  }

  private isOtpLocked(user: User): boolean {
    return user.lockMode === 'OTP_ONLY' && user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
  }

  private isFullyLocked(user: User): boolean {
    return user.lockMode === 'FULL' && (user.lockedUntil === null || user.lockedUntil.getTime() > Date.now());
  }

  async verifyMfa(flowId: string, proof: MfaProof): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId);
    if (!MFA_STATUSES.includes(flow.status)) throw AppErrorCode.AUTH_002.create();
    if (proof.code && flow.status !== AWAITING_TOTP) throw AppErrorCode.AUTH_002.create();

    const userId = flow.userId ? BigInt(flow.userId) : null;
    if (!userId) return this.handleFailure(flow, null, 'MFA_FAILED');

    const valid = await this.verifyProof(userId, proof);
    if (!valid) return this.handleFailure(flow, userId, 'MFA_FAILED');
    return this.complete(flow, userId, { aal: 'AAL2', mfaMode: proof.recoveryCode ? 'RECOVERY_CODE' : 'TOTP' });
  }

  async webauthnOptions(flowId: string | undefined, device: DeviceContext): Promise<WebauthnChallenge> {
    if (!flowId) {
      const flow = await this.authFlowService.create('LOGIN', AWAITING_WEBAUTHN, { identifier: '', authMethod: 'WEBAUTHN', device });
      const options = await this.webauthnService.startAuthentication(flow.flowId, null, true);
      return { flowId: flow.flowId, options };
    }

    const flow = await this.requireFlow(flowId);
    const firstFactor = flow.status === AWAITING_WEBAUTHN;
    if (!firstFactor && !MFA_STATUSES.includes(flow.status)) throw AppErrorCode.AUTH_002.create();
    const userId = flow.userId ? BigInt(flow.userId) : null;
    const options = await this.webauthnService.startAuthentication(flowId, userId, firstFactor);
    return { flowId, options };
  }

  async verifyWebauthn(flowId: string, assertion: WebauthnAssertion): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId);
    const firstFactor = flow.status === AWAITING_WEBAUTHN;
    if (!firstFactor && !MFA_STATUSES.includes(flow.status)) throw AppErrorCode.AUTH_002.create();

    const flowUserId = flow.userId ? BigInt(flow.userId) : null;
    const result = await this.webauthnService.finishAuthentication(flowId, this.toAuthenticationResponse(assertion), firstFactor);
    if (!result) return this.handleFailure(flow, flowUserId, firstFactor ? 'INVALID_CREDENTIALS' : 'MFA_FAILED');

    if (firstFactor) {
      const user = await this.userService.getUser(result.userId);
      if (!user || user.status !== 'ACTIVE') return this.handleFailure(flow, result.userId, 'INVALID_CREDENTIALS');
      flow.userId = result.userId.toString();
      flow.identifier = user.username ?? `user_${result.userId}`;
      return this.complete(flow, result.userId, { aal: 'AAL2', authMode: 'WEBAUTHN' });
    }

    if (flowUserId === null || flowUserId !== result.userId) return this.handleFailure(flow, flowUserId, 'MFA_FAILED');
    return this.complete(flow, result.userId, { aal: 'AAL2', mfaMode: 'WEBAUTHN' });
  }

  private toAuthenticationResponse(assertion: WebauthnAssertion): AuthenticationResponseJSON {
    return {
      id: assertion.id,
      rawId: assertion.rawId,
      type: assertion.type,
      response: {
        clientDataJSON: assertion.response.clientDataJSON,
        authenticatorData: assertion.response.authenticatorData,
        signature: assertion.response.signature,
        userHandle: assertion.response.userHandle,
      },
      clientExtensionResults: {},
      authenticatorAttachment: assertion.authenticatorAttachment as AuthenticatorAttachment | undefined,
    };
  }

  private async verifyProof(userId: bigint, proof: MfaProof): Promise<boolean> {
    if (proof.code) return this.mfaService.verifyTotp(userId, proof.code);
    if (proof.recoveryCode) return this.recoveryCodeService.consume(userId, proof.recoveryCode);
    return false;
  }

  private async complete(flow: AuthFlowContext, userId: bigint, options: CompletionOptions): Promise<FlowStepResult> {
    const user = await this.userService.getUser(userId);
    if (user && this.isFullyLocked(user)) throw AppErrorCode.AUTH_012.create();
    await this.suspiciousLoginService.assessLogin(userId, flow.device);
    await this.signInEventService.record({
      flowId: flow.flowId,
      userId,
      identifier: flow.identifier,
      status: 'SUCCESS',
      authMode: options.authMode ?? 'PASSWORD',
      mfaMode: options.mfaMode ?? null,
      device: this.deviceFields(flow),
    });
    const { cookies } = await this.sessionService.create({
      userId,
      aal: options.aal ?? 'AAL1',
      signInEventId: flow.flowId.replace(/^flow_auth_/, ''),
      deviceFingerprint: flow.device.fingerprint,
      ipAddress: flow.device.ipAddress,
      ipCountry: flow.device.ipCountry,
      userAgent: flow.device.userAgent,
    });
    await this.auditService.record({ action: 'auth.login.succeeded', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString(), ipAddress: flow.device.ipAddress });
    await this.authFlowService.delete(flow.flowId);
    this.logger.info('login completed', { userId });
    return { outcome: 'COMPLETED', flowId: flow.flowId, cookies };
  }

  private async handleFailure(flow: AuthFlowContext, userId: bigint | null, status: 'INVALID_CREDENTIALS' | 'MFA_FAILED'): Promise<FlowStepResult> {
    const failureCount = flow.failureCount + 1;
    await this.signInEventService.record({
      flowId: flow.flowId,
      userId,
      identifier: flow.identifier,
      status,
      authMode: 'PASSWORD',
      device: this.deviceFields(flow),
    });
    if (userId) await this.signInEventService.evaluateLock(userId);
    if (flow.device.ipAddress) await this.suspiciousLoginService.recordFailure(flow.device.ipAddress);
    await this.auditService.record({ action: 'auth.login.failed', outcome: 'FAILURE', actorType: 'USER', actorId: userId?.toString() ?? null, ipAddress: flow.device.ipAddress });

    if (failureCount >= MAX_FLOW_FAILURES) {
      await this.authFlowService.delete(flow.flowId);
      throw AppErrorCode.AUTH_004.create();
    }

    await this.authFlowService.update(flow, { failureCount, globalFailureCount: flow.globalFailureCount + 1 });
    return { outcome: 'FAILED', status: flow.status, flowId: flow.flowId, attemptsLeft: MAX_FLOW_FAILURES - failureCount };
  }

  private async requireFlow(flowId: string): Promise<AuthFlowContext> {
    const flow = await this.authFlowService.get(flowId);
    if (!flow || flow.kind !== 'LOGIN') throw AppErrorCode.AUTH_001.create();
    return flow;
  }

  private deviceFields(flow: AuthFlowContext): Omit<DeviceContext, 'fingerprint'> {
    return { ipAddress: flow.device.ipAddress, ipCountry: flow.device.ipCountry, userAgent: flow.device.userAgent };
  }
}
