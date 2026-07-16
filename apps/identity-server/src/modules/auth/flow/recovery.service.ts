/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger, ValidationError, utils } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME, ERROR_MESSAGES } from '@server/constants';
import { MfaService, RecoveryCodeService } from '@server/modules/auth/mfa';
import { SessionService } from '@server/modules/auth/session';
import { PasswordPolicyService, PasswordService } from '@server/modules/identity/credentials';
import { UserEmailService, UserService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { NotificationService } from '@server/modules/infrastructure/notification';

import { AuthFlowContext, AuthFlowService, DeviceContext } from './auth-flow.service';
import { OTP_RESEND_BUDGET } from './challenge-flow.service';
import { ChallengeService } from './challenge.service';
import { FlowStepResult } from './flow.types';
import { SignInEventService } from './sign-in-event.service';

/**
 * Defining types
 */

export interface RecoverInitInput {
  identifier: string;
  device: DeviceContext;
}

export interface RecoveryInitResult {
  flowId: string;
  status: string;
  resendsLeft: number;
  metadata?: { maskedEmail: string };
}

export interface RecoveryMfaProof {
  code?: string;
  recoveryCode?: string;
}

/**
 * Declaring the constants
 */
const MAX_FLOW_FAILURES = 3;
const AWAITING_EMAIL_OTP = 'AWAITING_EMAIL_OTP';
const AWAITING_TOTP = 'AWAITING_TOTP';
const AWAITING_NEW_PASSWORD = 'AWAITING_NEW_PASSWORD';
const OTP_TEMPLATE = 'auth.recovery.otp';
const CHANGED_TEMPLATE = 'auth.password.changed';

@Injectable()
export class RecoveryService {
  private readonly logger = Logger.getLogger(APP_NAME, RecoveryService.name);

  constructor(
    private readonly authFlowService: AuthFlowService,
    private readonly challengeService: ChallengeService,
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
  ) {}

  /**
   * Starts recovery. Neutral for unknown accounts (D-12): a flow is always created but an OTP is
   * only issued (to the account's verified email) when the identifier resolves to a user.
   */
  async init(input: RecoverInitInput): Promise<RecoveryInitResult> {
    const user = await this.userService.getUser(input.identifier);
    const email = user ? await this.userEmailService.getPrimaryEmail(user.id) : null;
    const flow = await this.authFlowService.create('RECOVERY', AWAITING_EMAIL_OTP, {
      identifier: input.identifier,
      userId: user?.id.toString(),
      device: input.device,
      resendsLeft: OTP_RESEND_BUDGET,
      lastOtpSentAt: Date.now(),
    });
    if (user && email) await this.challengeService.issue({ flowId: flow.flowId, type: 'EMAIL_OTP', target: email, userId: user.id, templateKey: OTP_TEMPLATE });

    /** The masked address is derived from the typed identifier only, never the resolved account (D-12). */
    const metadata = input.identifier.includes('@') ? { maskedEmail: utils.string.maskEmail(input.identifier) } : undefined;
    return { flowId: flow.flowId, status: flow.status, resendsLeft: OTP_RESEND_BUDGET, metadata };
  }

  /**
   * Proves control of the verified email. For MFA-enrolled accounts the flow then demands a
   * second factor: recovery MUST NOT downgrade an MFA account to single-factor takeover
   * (docs/auth/overview.md §5).
   */
  async verifyOtp(flowId: string, code: string): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId, AWAITING_EMAIL_OTP);
    const valid = Boolean(flow.userId) && (await this.challengeService.verify(flowId, code));
    if (!valid) return this.handleFailure(flow);

    const requiresMfa = await this.mfaService.hasMfa(BigInt(flow.userId as string));
    const next = await this.authFlowService.update(flow, { status: requiresMfa ? AWAITING_TOTP : AWAITING_NEW_PASSWORD });
    return { outcome: 'CONTINUE', flowId, status: next.status };
  }

  /** Satisfies the recovery MFA gate with a TOTP code or a single-use recovery code. */
  async verifyMfa(flowId: string, proof: RecoveryMfaProof): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId, AWAITING_TOTP);
    const userId = BigInt(flow.userId ?? '0');

    const valid = proof.code
      ? await this.mfaService.verifyTotp(userId, proof.code)
      : proof.recoveryCode
        ? await this.recoveryCodeService.consume(userId, proof.recoveryCode)
        : false;
    if (!valid) return this.handleFailure(flow);

    const next = await this.authFlowService.update(flow, { status: AWAITING_NEW_PASSWORD });
    return { outcome: 'CONTINUE', flowId, status: next.status };
  }

  async reset(flowId: string, newPassword: string): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId, AWAITING_NEW_PASSWORD);
    const userId = BigInt(flow.userId ?? '0');

    await this.passwordPolicyService.assertAcceptable(newPassword);
    if (await this.passwordService.isReused(userId, newPassword)) throw new ValidationError('password', ERROR_MESSAGES.REUSED_PASSWORD);

    const email = (await this.userEmailService.getPrimaryEmail(userId)) ?? flow.identifier;
    await this.passwordService.changePassword(userId, newPassword, email);
    await this.sessionService.terminateAllForUser(userId);

    await this.signInEventService.record({
      flowId,
      userId,
      identifier: flow.identifier,
      status: 'SUCCESS',
      authMode: 'OTP',
      device: { ipAddress: flow.device.ipAddress, ipCountry: flow.device.ipCountry, userAgent: flow.device.userAgent },
    });
    const { cookies } = await this.sessionService.create({
      userId,
      aal: 'AAL1',
      signInEventId: flowId.replace(/^flow_auth_/, ''),
      deviceFingerprint: flow.device.fingerprint,
      ipAddress: flow.device.ipAddress,
      ipCountry: flow.device.ipCountry,
      userAgent: flow.device.userAgent,
    });

    await this.auditService.record({ action: 'auth.recovery.completed', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString(), ipAddress: flow.device.ipAddress });
    await this.notificationService.enqueue({ templateKey: CHANGED_TEMPLATE, recipients: { email }, payload: { ipAddress: flow.device.ipAddress } });
    await this.authFlowService.delete(flowId);
    this.logger.info('recovery completed', { userId });
    return { outcome: 'COMPLETED', flowId, cookies };
  }

  private async handleFailure(flow: AuthFlowContext): Promise<FlowStepResult> {
    const failureCount = flow.failureCount + 1;
    if (failureCount >= MAX_FLOW_FAILURES) {
      await this.authFlowService.delete(flow.flowId);
      throw AppErrorCode.AUTH_004.create();
    }
    await this.authFlowService.update(flow, { failureCount });
    return { outcome: 'FAILED', flowId: flow.flowId, status: flow.status, attemptsLeft: MAX_FLOW_FAILURES - failureCount };
  }

  private async requireFlow(flowId: string, expectedStatus: string): Promise<AuthFlowContext> {
    const flow = await this.authFlowService.get(flowId);
    if (!flow || flow.kind !== 'RECOVERY') throw AppErrorCode.AUTH_001.create();
    if (flow.status !== expectedStatus) throw AppErrorCode.AUTH_002.create();
    return flow;
  }
}
