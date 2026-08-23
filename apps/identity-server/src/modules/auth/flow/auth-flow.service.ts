import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

import { type ElevationIntent } from '@server/modules/auth/session';
import { DatabaseService } from '@server/modules/infrastructure/datastore';

export type AuthFlowKind = 'LOGIN' | 'REGISTRATION' | 'RECOVERY' | 'STEP_UP';

export interface DeviceContext {
  fingerprint?: string;
  ipAddress?: string;
  ipCountry?: string;
  userAgent?: string;
}

export interface FederatedFlowState {
  identityProviderId: string;
  nonce: string;
  codeVerifier: string;
  enforced: boolean;
  pendingSubject?: string;
}

export interface AuthFlowContext {
  flowId: string;
  kind: AuthFlowKind;
  status: string;
  identifier: string;
  userId?: string;
  /** Set only for STEP_UP flows — the session the completed flow elevates, distinct from `userId`'s login-flow role. */
  sessionId?: string;
  authMethod?: string;
  failureCount: number;
  globalFailureCount: number;
  device: DeviceContext;
  regData?: Record<string, unknown>;
  resendsLeft?: number;
  lastOtpSentAt?: number;
  returnTo?: string;
  federated?: FederatedFlowState;
  elevationIntent?: ElevationIntent;
  createdAt: number;
}

/** Same-origin destinations only: a root-relative path (never protocol-relative) or an absolute url under the issuer. */
export const sanitizeReturnTo = (returnTo: string | undefined, issuer: string): string | undefined => {
  if (!returnTo) return undefined;
  if (returnTo.startsWith('/') && !returnTo.startsWith('//')) return returnTo;
  return returnTo.startsWith(`${issuer}/`) ? returnTo : undefined;
};

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

  async create(kind: AuthFlowKind, status: string, data: Partial<AuthFlowContext> = {}, ttlSeconds: number = this.ttlSeconds): Promise<AuthFlowContext> {
    const context: AuthFlowContext = {
      flowId: `flow_auth_${randomUUID()}`,
      kind,
      status,
      identifier: data.identifier ?? '',
      userId: data.userId,
      sessionId: data.sessionId,
      authMethod: data.authMethod,
      failureCount: 0,
      globalFailureCount: 0,
      device: data.device ?? {},
      regData: data.regData,
      resendsLeft: data.resendsLeft,
      lastOtpSentAt: data.lastOtpSentAt,
      returnTo: data.returnTo,
      federated: data.federated,
      elevationIntent: data.elevationIntent,
      createdAt: Date.now(),
    };
    await this.persist(context, ttlSeconds);
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

  private async persist(context: AuthFlowContext, ttlSeconds: number = this.ttlSeconds): Promise<void> {
    await this.redis.set(this.key(context.flowId), JSON.stringify(context), 'EX', ttlSeconds);
  }
}
