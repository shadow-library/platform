/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Config, utils } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { UserEmailService } from '@server/modules/identity/user';
import { VerificationChallenge } from '@server/modules/infrastructure/datastore';

import { AuthFlowContext, AuthFlowService } from './auth-flow.service';
import { ChallengeService } from './challenge.service';

/**
 * Defining types
 */

export type ChallengeMethodName = 'PASSWORD' | 'WEBAUTHN' | 'EMAIL_OTP' | 'SMS_OTP';

export interface ChallengeMetadata {
  maskedEmail?: string;
  maskedPhone?: string;
}

export interface ChallengeMethodDescriptor {
  name: ChallengeMethodName;
  metadata?: ChallengeMetadata;
}

export interface MethodChangeResult {
  flowId: string;
  status: string;
  resendsLeft?: number;
  metadata?: ChallengeMetadata;
}

interface ChallengeDelivery {
  target: string;
  templateKey: string;
}

export type ResendResult = { status: 'SENT'; resendsLeft: number; retryAfterSeconds: number } | { status: 'LIMITED'; retryAfterSeconds: number };

/**
 * Declaring the constants
 *
 * Tier-2 per-flow budgets (architecture §13.2): 3 resends per flow beyond the initial send and a
 * 60s cooldown between sends. The per-identifier hourly delivery cap lives in `ChallengeService`
 * so it also covers initial sends and contact-verification traffic.
 */
export const OTP_RESEND_BUDGET = 3;
const RESEND_COOLDOWN_SECONDS = 60;

const LOGIN_OTP_TEMPLATE = 'auth.login.otp';
const REGISTER_OTP_TEMPLATE = 'auth.register.otp';
const RECOVERY_OTP_TEMPLATE = 'auth.recovery.otp';

const OTP_STATUSES: Record<string, 'EMAIL_OTP' | 'SMS_OTP'> = { AWAITING_EMAIL_OTP: 'EMAIL_OTP', AWAITING_SMS_OTP: 'SMS_OTP' };
const MFA_STATUSES = ['AWAITING_TOTP', 'AWAITING_MFA_WEBAUTHN'];

@Injectable()
export class ChallengeFlowService {
  private readonly flowTtlSeconds = Config.get('auth.flow.ttl');

  constructor(
    private readonly authFlowService: AuthFlowService,
    private readonly challengeService: ChallengeService,
    private readonly userEmailService: UserEmailService,
  ) {}

  /**
   * Advertises the authentication methods for a login flow. The list is derived from the shape of
   * the typed identifier and the universally available methods only — never from the resolved
   * account — so known and unknown identifiers produce identical output (D-12).
   */
  async listMethods(flowId: string): Promise<ChallengeMethodDescriptor[]> {
    const flow = await this.requireLoginFlow(flowId);
    const methods: ChallengeMethodDescriptor[] = [{ name: 'PASSWORD' }, { name: 'WEBAUTHN' }];
    if (this.isEmailIdentifier(flow.identifier)) methods.push({ name: 'EMAIL_OTP', metadata: { maskedEmail: utils.string.maskEmail(flow.identifier) } });
    if (this.isPhoneIdentifier(flow.identifier)) methods.push({ name: 'SMS_OTP', metadata: { maskedPhone: this.maskPhone(flow.identifier) } });
    return methods;
  }

  /** Switches a login flow to another first-factor method; OTP methods issue their first code here. */
  async changeMethod(flowId: string, method: ChallengeMethodName): Promise<MethodChangeResult> {
    const flow = await this.requireLoginFlow(flowId);
    /** Enforced federation admits no local first factor — switching methods must not reopen one (T-702). */
    if (flow.federated?.enforced) throw new ServerError(AppErrorCode.AUTH_007);
    if (MFA_STATUSES.includes(flow.status)) throw new ServerError(AppErrorCode.AUTH_002);

    if (method === 'PASSWORD') {
      const next = await this.authFlowService.update(flow, { status: 'AWAITING_PASSWORD' });
      return { flowId, status: next.status };
    }
    if (method === 'WEBAUTHN') {
      const next = await this.authFlowService.update(flow, { status: 'AWAITING_WEBAUTHN' });
      return { flowId, status: next.status };
    }

    const available = method === 'EMAIL_OTP' ? this.isEmailIdentifier(flow.identifier) : this.isPhoneIdentifier(flow.identifier);
    if (!available) throw new ServerError(AppErrorCode.AUTH_002);

    const status = method === 'EMAIL_OTP' ? 'AWAITING_EMAIL_OTP' : 'AWAITING_SMS_OTP';
    const next = await this.authFlowService.update(flow, { status, resendsLeft: OTP_RESEND_BUDGET, lastOtpSentAt: Date.now() });
    if (flow.userId) await this.deliver(flow, method, flow.identifier, LOGIN_OTP_TEMPLATE);

    const metadata = method === 'EMAIL_OTP' ? { maskedEmail: utils.string.maskEmail(flow.identifier) } : { maskedPhone: this.maskPhone(flow.identifier) };
    return { flowId, status: next.status, resendsLeft: next.resendsLeft, metadata };
  }

  /**
   * Re-issues the pending OTP for a flow, bounded by the per-flow budget and the send cooldown.
   * The per-identifier cap is enforced silently: the response still reads SENT, delivery is just
   * skipped, because a distinguishable refusal would leak delivery activity for the identifier.
   */
  async resend(flowId: string, method: 'EMAIL_OTP' | 'SMS_OTP'): Promise<ResendResult> {
    const flow = await this.requireFlow(flowId);
    if (OTP_STATUSES[flow.status] !== method) throw new ServerError(AppErrorCode.AUTH_002);

    const cooldownRemaining = this.cooldownRemaining(flow);
    if (cooldownRemaining > 0) return { status: 'LIMITED', retryAfterSeconds: cooldownRemaining };

    const resendsLeft = flow.resendsLeft ?? OTP_RESEND_BUDGET;
    if (resendsLeft <= 0) return { status: 'LIMITED', retryAfterSeconds: this.flowTtlRemaining(flow) };

    const delivery = await this.resolveDelivery(flow);
    if (delivery) await this.deliver(flow, method, delivery.target, delivery.templateKey);

    const next = await this.authFlowService.update(flow, { resendsLeft: resendsLeft - 1, lastOtpSentAt: Date.now() });
    return { status: 'SENT', resendsLeft: next.resendsLeft ?? 0, retryAfterSeconds: RESEND_COOLDOWN_SECONDS };
  }

  private async deliver(flow: AuthFlowContext, method: 'EMAIL_OTP' | 'SMS_OTP', target: string, templateKey: string): Promise<void> {
    const type: VerificationChallenge.Type = method;
    await this.challengeService.issue({ flowId: flow.flowId, type, target, userId: flow.userId ? BigInt(flow.userId) : null, templateKey });
  }

  /** Resolves where a resent code goes; null means the flow has no real recipient and delivery is pretend-only. */
  private async resolveDelivery(flow: AuthFlowContext): Promise<ChallengeDelivery | null> {
    if (flow.kind === 'REGISTRATION') return flow.regData?.exists ? null : { target: flow.identifier, templateKey: REGISTER_OTP_TEMPLATE };
    if (flow.kind === 'LOGIN') return flow.userId ? { target: flow.identifier, templateKey: LOGIN_OTP_TEMPLATE } : null;

    /** RECOVERY codes go to the account's primary email, which only resolved users have. */
    if (!flow.userId) return null;
    const target = await this.userEmailService.getPrimaryEmail(BigInt(flow.userId));
    return target ? { target, templateKey: RECOVERY_OTP_TEMPLATE } : null;
  }

  private cooldownRemaining(flow: AuthFlowContext): number {
    if (!flow.lastOtpSentAt) return 0;
    const elapsed = (Date.now() - flow.lastOtpSentAt) / 1000;
    return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed));
  }

  private flowTtlRemaining(flow: AuthFlowContext): number {
    const elapsed = (Date.now() - flow.createdAt) / 1000;
    return Math.max(1, Math.ceil(this.flowTtlSeconds - elapsed));
  }

  private isEmailIdentifier(identifier: string): boolean {
    return identifier.includes('@');
  }

  private isPhoneIdentifier(identifier: string): boolean {
    return identifier.startsWith('+');
  }

  private maskPhone(phone: string): string {
    return `**${phone.slice(-2)}`;
  }

  private async requireLoginFlow(flowId: string): Promise<AuthFlowContext> {
    const flow = await this.requireFlow(flowId);
    if (flow.kind !== 'LOGIN') throw new ServerError(AppErrorCode.AUTH_002);
    return flow;
  }

  private async requireFlow(flowId: string): Promise<AuthFlowContext> {
    const flow = await this.authFlowService.get(flowId);
    if (!flow) throw new ServerError(AppErrorCode.AUTH_001);
    return flow;
  }
}
