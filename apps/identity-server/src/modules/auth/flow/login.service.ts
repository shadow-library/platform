/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { type AuthenticationResponseJSON, type AuthenticatorAttachment, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { MfaService, RecoveryCodeService, WebauthnAssertion, WebauthnService } from '@server/modules/auth/mfa';
import { SessionService } from '@server/modules/auth/session';
import { PasswordService } from '@server/modules/identity/credentials';
import { UserService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { User, UserSession } from '@server/modules/infrastructure/datastore';

import { AuthFlowContext, AuthFlowService, DeviceContext } from './auth-flow.service';
import { FlowStepResult } from './flow.types';
import { SignInEventService } from './sign-in-event.service';

/**
 * Defining types
 */

export interface LoginInitInput {
  identifier: string;
  device: DeviceContext;
}

export interface LoginInitResult {
  flowId: string;
  status: string;
  hasAlternativeMethods: boolean;
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
const MFA_STATUSES = [AWAITING_TOTP, AWAITING_MFA_WEBAUTHN];

@Injectable()
export class LoginService {
  private readonly logger = Logger.getLogger(APP_NAME, LoginService.name);

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
  ) {}

  /**
   * Starts a login flow. The response is identical whether or not the identifier maps to an account
   * (D-12): the resolved user id is kept in the server-side flow context only, never returned.
   */
  async init(input: LoginInitInput): Promise<LoginInitResult> {
    const user = await this.userService.getUser(input.identifier);
    const flow = await this.authFlowService.create('LOGIN', AWAITING_PASSWORD, {
      identifier: input.identifier,
      userId: user?.id.toString(),
      authMethod: 'PASSWORD',
      device: input.device,
    });
    return { flowId: flow.flowId, status: flow.status, hasAlternativeMethods: false };
  }

  async verifyPassword(flowId: string, password: string): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId);
    if (flow.status !== AWAITING_PASSWORD) throw new ServerError(AppErrorCode.AUTH_002);

    const userId = flow.userId ? BigInt(flow.userId) : null;
    const valid = await this.passwordService.verifyForUser(userId, password);
    if (!valid || !userId) return this.handleFailure(flow, userId, 'INVALID_CREDENTIALS');

    const user = await this.userService.getUser(userId);
    if (!user || user.status !== 'ACTIVE') return this.handleFailure(flow, userId, 'INVALID_CREDENTIALS');

    const factors = await this.mfaService.getFactors(userId);
    if (factors.totp || factors.webauthn) {
      const next = await this.authFlowService.update(flow, { status: factors.totp ? AWAITING_TOTP : AWAITING_MFA_WEBAUTHN });
      return { outcome: 'CONTINUE', flowId: flow.flowId, status: next.status };
    }
    return this.complete(flow, userId, {});
  }

  /**
   * Completes the MFA step of a login flow with a TOTP code or a single-use recovery code;
   * sessions born here carry AAL2.
   */
  async verifyMfa(flowId: string, proof: MfaProof): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId);
    if (!MFA_STATUSES.includes(flow.status)) throw new ServerError(AppErrorCode.AUTH_002);
    if (proof.code && flow.status !== AWAITING_TOTP) throw new ServerError(AppErrorCode.AUTH_002);

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
    if (!firstFactor && !MFA_STATUSES.includes(flow.status)) throw new ServerError(AppErrorCode.AUTH_002);
    const userId = flow.userId ? BigInt(flow.userId) : null;
    const options = await this.webauthnService.startAuthentication(flowId, userId, firstFactor);
    return { flowId, options };
  }

  /** Completes a login with a passkey assertion, as either the first factor or the MFA step. */
  async verifyWebauthn(flowId: string, assertion: WebauthnAssertion): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId);
    const firstFactor = flow.status === AWAITING_WEBAUTHN;
    if (!firstFactor && !MFA_STATUSES.includes(flow.status)) throw new ServerError(AppErrorCode.AUTH_002);

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
    await this.auditService.record({ action: 'auth.login.failed', outcome: 'FAILURE', actorType: 'USER', actorId: userId?.toString() ?? null, ipAddress: flow.device.ipAddress });

    if (failureCount >= MAX_FLOW_FAILURES) {
      await this.authFlowService.delete(flow.flowId);
      throw new ServerError(AppErrorCode.AUTH_004);
    }

    await this.authFlowService.update(flow, { failureCount, globalFailureCount: flow.globalFailureCount + 1 });
    return { outcome: 'FAILED', status: flow.status, flowId: flow.flowId, attemptsLeft: MAX_FLOW_FAILURES - failureCount };
  }

  private async requireFlow(flowId: string): Promise<AuthFlowContext> {
    const flow = await this.authFlowService.get(flowId);
    if (!flow || flow.kind !== 'LOGIN') throw new ServerError(AppErrorCode.AUTH_001);
    return flow;
  }

  private deviceFields(flow: AuthFlowContext): { ipAddress?: string; ipCountry?: string; userAgent?: string } {
    return { ipAddress: flow.device.ipAddress, ipCountry: flow.device.ipCountry, userAgent: flow.device.userAgent };
  }
}
