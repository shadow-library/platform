/**
 * Importing npm packages
 */
import { createHash, randomBytes } from 'node:crypto';

import { type AuthenticationResponseJSON, type AuthenticatorAttachment, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { ADMIN_PERMISSIONS, PLATFORM_ORG_NAME } from '@server/modules/admin/admin.constants';
import { FederatedIdentityService, IdentityProviderService, UpstreamIdentity, UpstreamOidcService } from '@server/modules/auth/federation';
import { MfaService, RecoveryCodeService, WebauthnAssertion, WebauthnService } from '@server/modules/auth/mfa';
import { SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { PasswordService } from '@server/modules/identity/credentials';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { User, UserSession } from '@server/modules/infrastructure/datastore';

import { AuthFlowContext, AuthFlowService, DeviceContext, FederatedFlowState } from './auth-flow.service';
import { ChallengeService } from './challenge.service';
import { FlowStepResult } from './flow.types';
import { SignInEventService } from './sign-in-event.service';
import { SuspiciousLoginService } from './suspicious-login.service';

/**
 * Defining types
 */

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

/**
 * Declaring the constants
 *
 * A flow is terminated after this many failed submissions (Tier-3, docs/auth/overview.md §8).
 */
const MAX_FLOW_FAILURES = 3;
const AWAITING_PASSWORD = 'AWAITING_PASSWORD';
const AWAITING_TOTP = 'AWAITING_TOTP';
const AWAITING_MFA_WEBAUTHN = 'AWAITING_MFA_WEBAUTHN';
const AWAITING_WEBAUTHN = 'AWAITING_WEBAUTHN';
const AWAITING_FEDERATED = 'AWAITING_FEDERATED';
const AWAITING_LINK_OTP = 'AWAITING_LINK_OTP';
const MFA_STATUSES = [AWAITING_TOTP, AWAITING_MFA_WEBAUTHN];
const OTP_STATUSES = ['AWAITING_EMAIL_OTP', 'AWAITING_SMS_OTP'];
const LINK_OTP_TEMPLATE = 'auth.login.otp';

@Injectable()
export class LoginService {
  private readonly logger = Logger.getLogger(APP_NAME, LoginService.name);
  private readonly issuer = Config.get('oauth.issuer');
  private platformOrganisationId: string | null = null;

  constructor(
    private readonly authFlowService: AuthFlowService,
    private readonly userService: UserService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly signInEventService: SignInEventService,
    private readonly auditService: AuditService,
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
  ) {}

  /**
   * Starts a login flow. The response is identical whether or not the identifier maps to an account
   * (D-12): the resolved user id is kept in the server-side flow context only, never returned.
   * Home-realm discovery (T-702): an email under a VERIFIED org domain with an active IdP gets a
   * federated option; when the org enforces federation, local credential steps refuse — except for
   * platform administrators (break-glass), so a broken upstream cannot lock operators out.
   */
  async init(input: LoginInitInput): Promise<LoginInitResult> {
    const user = await this.userService.getUser(input.identifier);
    const provider = input.identifier.includes('@') ? await this.identityProviderService.routeForEmail(input.identifier.toLowerCase()) : null;

    let federated: FederatedFlowState | undefined;
    let status = AWAITING_PASSWORD;
    if (provider) {
      const breakGlass = user ? await this.isPlatformAdmin(user.id) : false;
      const enforced = provider.enforced && !breakGlass;
      federated = { identityProviderId: provider.id, nonce: randomBytes(16).toString('base64url'), codeVerifier: randomBytes(32).toString('base64url'), enforced };
      if (enforced) status = AWAITING_FEDERATED;
    }

    const flow = await this.authFlowService.create('LOGIN', status, {
      identifier: input.identifier,
      userId: user?.id.toString(),
      authMethod: 'PASSWORD',
      device: input.device,
      returnTo: this.sanitizeReturnTo(input.returnTo),
      federated,
    });

    /** Passkeys (and OTP for email/phone identifiers) are always advertised, so alternatives always exist. */
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

  /** Post-login destinations must stay on this origin: a relative path or a URL under the issuer. */
  private sanitizeReturnTo(returnTo: string | undefined): string | undefined {
    if (!returnTo) return undefined;
    if (returnTo.startsWith('/') && !returnTo.startsWith('//')) return returnTo;
    return returnTo.startsWith(`${this.issuer}/`) ? returnTo : undefined;
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
    /** Tier-4 lock: a locked account only accepts OTP methods until the lock expires (§13.2). */
    if (this.isOtpLocked(user)) return this.handleFailure(flow, userId, 'INVALID_CREDENTIALS');
    /**
     * An admin-forced reset refuses even the correct password until recovery replaces it (T-602).
     * The caller has just proven the credential, so naming the reason leaks nothing — and it must
     * not burn failure budget or trip lockouts.
     */
    if (user.passwordResetRequired) {
      await this.auditService.record({ action: 'auth.login.reset_required', outcome: 'FAILURE', actorType: 'USER', actorId: userId.toString(), ipAddress: flow.device.ipAddress });
      await this.authFlowService.delete(flow.flowId);
      return { outcome: 'FAILED', flowId: flow.flowId, status: 'PASSWORD_RESET_REQUIRED', attemptsLeft: 0 };
    }

    const factors = await this.mfaService.getFactors(userId);
    if (factors.totp || factors.webauthn) {
      const next = await this.authFlowService.update(flow, { status: factors.totp ? AWAITING_TOTP : AWAITING_MFA_WEBAUTHN });
      return { outcome: 'CONTINUE', flowId: flow.flowId, status: next.status };
    }
    return this.complete(flow, userId, {});
  }

  /**
   * Completes the OTP first factor a `challenge/change` switched to, or the email-OTP proof that
   * links a federated identity to an existing local account. MFA-enrolled accounts still continue
   * to their second factor: an emailed code alone must never satisfy an MFA account.
   */
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

    /** The OTP proved control of the email — only now may the upstream identity attach to the account. */
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

  /**
   * Continues a login after the upstream IdP verified the user (T-702). Returning identities match
   * on (provider, subject); a first-time subject whose email belongs to an existing local account
   * must prove control via email OTP before linking (silent auto-link on email equality is an
   * account-takeover vector); anyone else is JIT-provisioned into the organisation.
   */
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
      await this.challengeService.issue({ flowId: flow.flowId, type: 'EMAIL_OTP', target: identity.email, userId: existing.id, templateKey: LINK_OTP_TEMPLATE });
      return { outcome: 'CONTINUE', flowId: flow.flowId, status: next.status };
    }

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

  /** Federated proof is a first factor: MFA-enrolled accounts still walk their local second factor. */
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
    if (provider) await this.organisationService.ensureMember(provider.organisationId, userId, 'MEMBER');
  }

  private isOtpLocked(user: User): boolean {
    return user.lockMode === 'OTP_ONLY' && user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
  }

  /**
   * Completes the MFA step of a login flow with a TOTP code or a single-use recovery code;
   * sessions born here carry AAL2.
   */
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

  /**
   * Issues WebAuthn assertion options. Without a flow this begins a usernameless (discoverable
   * credential) login; with one it serves the flow's MFA step. Options are shaped identically
   * whether or not credentials exist (D-12).
   */
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

  /** Completes a login with a passkey assertion, as either the first factor or the MFA step. */
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
      /** A user-verified passkey is possession + knowledge/biometric in one ceremony → AAL2. */
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
    /** Assessed before the success is recorded so "previously seen" excludes this very login. */
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
