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
import { PasswordService } from '@server/modules/identity/credentials';
import { UserService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';

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

/**
 * Declaring the constants
 *
 * A flow is terminated after this many failed submissions (Tier-3, docs/auth/overview.md §8).
 */
const MAX_FLOW_FAILURES = 3;
const AWAITING_PASSWORD = 'AWAITING_PASSWORD';

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
    if (valid && userId) return this.complete(flow, userId);
    return this.handleFailure(flow, userId);
  }

  private async complete(flow: AuthFlowContext, userId: bigint): Promise<FlowStepResult> {
    const user = await this.userService.getUser(userId);
    if (!user || user.status !== 'ACTIVE') return this.handleFailure(flow, userId);

    await this.signInEventService.record({ flowId: flow.flowId, userId, identifier: flow.identifier, status: 'SUCCESS', authMode: 'PASSWORD', device: this.deviceFields(flow) });
    const { cookies } = await this.sessionService.create({
      userId,
      aal: 'AAL1',
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

  private async handleFailure(flow: AuthFlowContext, userId: bigint | null): Promise<FlowStepResult> {
    const failureCount = flow.failureCount + 1;
    await this.signInEventService.record({
      flowId: flow.flowId,
      userId,
      identifier: flow.identifier,
      status: 'INVALID_CREDENTIALS',
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
    return { outcome: 'FAILED', status: AWAITING_PASSWORD, flowId: flow.flowId, attemptsLeft: MAX_FLOW_FAILURES - failureCount };
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
