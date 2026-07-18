/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { DatabaseService } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export type AuthFlowKind = 'LOGIN' | 'REGISTRATION' | 'RECOVERY';

export interface DeviceContext {
  fingerprint?: string;
  ipAddress?: string;
  ipCountry?: string;
  userAgent?: string;
}

/** Server-side state of an in-flight federated login (T-702); secrets never leave the flow store. */
export interface FederatedFlowState {
  identityProviderId: string;
  nonce: string;
  codeVerifier: string;
  /** True when the org enforces federation and no break-glass applies: local credential steps refuse. */
  enforced: boolean;
  /** Upstream subject awaiting an email-OTP proof before it may link to an existing local account. */
  pendingSubject?: string;
}

export interface AuthFlowContext {
  flowId: string;
  kind: AuthFlowKind;
  status: string;
  identifier: string;
  userId?: string;
  authMethod?: string;
  failureCount: number;
  globalFailureCount: number;
  device: DeviceContext;
  regData?: Record<string, unknown>;
  /** Remaining OTP re-deliveries for this flow (Tier-2 per-flow budget) */
  resendsLeft?: number;
  /** Epoch millis of the last OTP delivery, driving the resend cooldown */
  lastOtpSentAt?: number;
  /** Post-login destination (validated: relative or same-origin) carried through federated detours */
  returnTo?: string;
  federated?: FederatedFlowState;
  createdAt: number;
}

/**
 * Declaring the constants
 */

/**
 * Stores the ephemeral state of an in-progress authentication (login, registration, recovery) in
 * Redis, keyed by an opaque flow id with a bounded TTL. Only non-secret progress data lives here;
 * challenge codes are stored hashed in Postgres, never in the flow context.
 */
@Injectable()
export class AuthFlowService {
  private readonly redis: Redis;
  private readonly ttlSeconds = Config.get('auth.flow.ttl');

  constructor(databaseService: DatabaseService) {
    this.redis = databaseService.getRedisClient();
  }

  private key(flowId: string): string {
    return `auth_flow:${flowId}`;
  }

  async create(kind: AuthFlowKind, status: string, data: Partial<AuthFlowContext> = {}): Promise<AuthFlowContext> {
    const context: AuthFlowContext = {
      flowId: `flow_auth_${randomUUID()}`,
      kind,
      status,
      identifier: data.identifier ?? '',
      userId: data.userId,
      authMethod: data.authMethod,
      failureCount: 0,
      globalFailureCount: 0,
      device: data.device ?? {},
      regData: data.regData,
      resendsLeft: data.resendsLeft,
      lastOtpSentAt: data.lastOtpSentAt,
      returnTo: data.returnTo,
      federated: data.federated,
      createdAt: Date.now(),
    };
    await this.persist(context);
    return context;
  }

  async get(flowId: string): Promise<AuthFlowContext | null> {
    const raw = await this.redis.get(this.key(flowId));
    return raw ? (JSON.parse(raw) as AuthFlowContext) : null;
  }

  async update(context: AuthFlowContext, patch: Partial<AuthFlowContext>): Promise<AuthFlowContext> {
    const next = { ...context, ...patch };
    await this.persist(next);
    return next;
  }

  async delete(flowId: string): Promise<void> {
    await this.redis.del(this.key(flowId));
  }

  private async persist(context: AuthFlowContext): Promise<void> {
    await this.redis.set(this.key(context.flowId), JSON.stringify(context), 'EX', this.ttlSeconds);
  }
}
