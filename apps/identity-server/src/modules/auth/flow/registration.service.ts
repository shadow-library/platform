/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { SessionService } from '@server/modules/auth/session';
import { PasswordPolicyService } from '@server/modules/identity/credentials';
import { UserEmailService, UserService } from '@server/modules/identity/user';
import { User } from '@server/modules/infrastructure/datastore';

import { AuthFlowContext, AuthFlowService, DeviceContext } from './auth-flow.service';
import { ChallengeService } from './challenge.service';
import { FlowStepResult } from './flow.types';

/**
 * Defining types
 */

export interface RegisterInitInput {
  email: string;
  device: DeviceContext;
}

export interface DemographicsInput {
  dateOfBirth?: string;
  gender?: User.Gender;
}

export interface ProfileInput {
  firstName: string;
  lastName: string;
}

/**
 * Declaring the constants
 */
const MAX_FLOW_FAILURES = 3;
const AWAITING_EMAIL_OTP = 'AWAITING_EMAIL_OTP';
const AWAITING_DEMOGRAPHICS = 'AWAITING_DEMOGRAPHICS';
const AWAITING_PROFILE = 'AWAITING_PROFILE';
const AWAITING_PASSWORD_SET = 'AWAITING_PASSWORD_SET';
const OTP_TEMPLATE = 'auth.register.otp';

@Injectable()
export class RegistrationService {
  private readonly logger = Logger.getLogger(APP_NAME, RegistrationService.name);

  constructor(
    private readonly authFlowService: AuthFlowService,
    private readonly challengeService: ChallengeService,
    private readonly userService: UserService,
    private readonly userEmailService: UserEmailService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Starts a registration flow. The response is identical whether or not the email already exists
   * (D-12); when it does, no OTP is issued and any code submission fails generically.
   */
  async init(input: RegisterInitInput): Promise<{ flowId: string; status: string }> {
    const email = input.email.toLowerCase();
    const exists = await this.userEmailService.isEmailExists(email);
    const flow = await this.authFlowService.create('REGISTRATION', AWAITING_EMAIL_OTP, { identifier: email, device: input.device, regData: { email, exists } });
    if (!exists) await this.challengeService.issue({ flowId: flow.flowId, type: 'EMAIL_OTP', target: email, templateKey: OTP_TEMPLATE });
    return { flowId: flow.flowId, status: flow.status };
  }

  async verifyOtp(flowId: string, code: string): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId, AWAITING_EMAIL_OTP);
    const exists = Boolean(flow.regData?.exists);
    const valid = !exists && (await this.challengeService.verify(flowId, code));
    if (!valid) return this.handleFailure(flow);

    const next = await this.authFlowService.update(flow, { status: AWAITING_DEMOGRAPHICS });
    return { outcome: 'CONTINUE', flowId, status: next.status };
  }

  async setDemographics(flowId: string, input: DemographicsInput): Promise<{ flowId: string; status: string }> {
    const flow = await this.requireFlow(flowId, AWAITING_DEMOGRAPHICS);
    const next = await this.authFlowService.update(flow, { status: AWAITING_PROFILE, regData: { ...flow.regData, dateOfBirth: input.dateOfBirth, gender: input.gender } });
    return { flowId, status: next.status };
  }

  async setProfile(flowId: string, input: ProfileInput): Promise<{ flowId: string; status: string }> {
    const flow = await this.requireFlow(flowId, AWAITING_PROFILE);
    const next = await this.authFlowService.update(flow, { status: AWAITING_PASSWORD_SET, regData: { ...flow.regData, firstName: input.firstName, lastName: input.lastName } });
    return { flowId, status: next.status };
  }

  async setPassword(flowId: string, password: string): Promise<FlowStepResult> {
    const flow = await this.requireFlow(flowId, AWAITING_PASSWORD_SET);
    await this.passwordPolicyService.assertAcceptable(password);

    const data = flow.regData ?? {};
    const user = await this.userService.createUserWithPassword({
      email: String(data.email),
      password,
      status: 'ACTIVE',
      emailVerified: true,
      firstName: data.firstName as string | undefined,
      lastName: data.lastName as string | undefined,
      gender: data.gender as User.Gender | undefined,
      dateOfBirth: data.dateOfBirth ? new Date(String(data.dateOfBirth)) : undefined,
    });

    const { cookies } = await this.sessionService.create({
      userId: user.id,
      aal: 'AAL1',
      deviceFingerprint: flow.device.fingerprint,
      ipAddress: flow.device.ipAddress,
      ipCountry: flow.device.ipCountry,
      userAgent: flow.device.userAgent,
    });
    await this.authFlowService.delete(flowId);
    this.logger.info('registration completed', { userId: user.id });
    return { outcome: 'COMPLETED', flowId, cookies };
  }

  private async handleFailure(flow: AuthFlowContext): Promise<FlowStepResult> {
    const failureCount = flow.failureCount + 1;
    if (failureCount >= MAX_FLOW_FAILURES) {
      await this.authFlowService.delete(flow.flowId);
      throw new ServerError(AppErrorCode.AUTH_004);
    }
    await this.authFlowService.update(flow, { failureCount });
    return { outcome: 'FAILED', flowId: flow.flowId, status: flow.status, attemptsLeft: MAX_FLOW_FAILURES - failureCount };
  }

  private async requireFlow(flowId: string, expectedStatus: string): Promise<AuthFlowContext> {
    const flow = await this.authFlowService.get(flowId);
    if (!flow || flow.kind !== 'REGISTRATION') throw new ServerError(AppErrorCode.AUTH_001);
    if (flow.status !== expectedStatus) throw new ServerError(AppErrorCode.AUTH_002);
    return flow;
  }
}
