import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@shadow-library/app';

import { AppErrorCode } from '@server/classes';
import { FederatedIdentityService, IdentityProviderService, type UpstreamIdentity, UpstreamOidcService } from '@server/modules/auth/federation';
import { MfaService } from '@server/modules/auth/mfa';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { SessionService, type ValidatedSession } from '@server/modules/auth/session';
import { AuditService } from '@server/modules/infrastructure/audit';

import { type AuthFlowContext, AuthFlowService, type DeviceContext } from './auth-flow.service';

export interface FederatedStepUpStart {
  flowId: string;
  authorizationUrl: string;
}

export interface FederatedStepUpElevation {
  aal: 'AAL1' | 'AAL2';
  elevatedUntil: Date;
}

export const AWAITING_FEDERATED_STEP_UP = 'AWAITING_FEDERATED_STEP_UP';

/**
 * Bounds how long a step-up re-auth has to complete before the browser must restart it, playing the
 * same role for the federated factor that a TOTP code's own validity window plays for that factor —
 * short enough that a completion is provably a fresh act, not a redirect resumed hours later.
 */
export const FEDERATED_STEP_UP_FLOW_TTL_SECONDS = 300;

@Injectable()
export class FederatedStepUpService {
  constructor(
    private readonly authFlowService: AuthFlowService,
    private readonly mfaService: MfaService,
    private readonly federatedIdentityService: FederatedIdentityService,
    private readonly identityProviderService: IdentityProviderService,
    private readonly upstreamOidcService: UpstreamOidcService,
    private readonly sessionService: SessionService,
    private readonly clientService: OAuthClientService,
    private readonly auditService: AuditService,
  ) {}

  async start(session: ValidatedSession, device: DeviceContext, proof: { clientId?: string; resource?: string }): Promise<FederatedStepUpStart> {
    const methods = await this.mfaService.getStepUpMethods(session.userId);
    if (methods.length === 0) throw AppErrorCode.MFA_004.create();
    if (!methods.includes('FEDERATED')) throw AppErrorCode.MFA_003.create();

    const links = await this.federatedIdentityService.listForUser(session.userId);
    const link = links.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!link) throw AppErrorCode.MFA_004.create();

    const provider = await this.identityProviderService.getById(link.identityProviderId);
    if (!provider || !provider.isActive) throw AppErrorCode.MFA_004.create();

    const elevationIntent = await this.clientService.resolveElevationIntent(proof.clientId, proof.resource);
    const federated = { identityProviderId: provider.id, nonce: randomBytes(16).toString('base64url'), codeVerifier: randomBytes(32).toString('base64url'), enforced: false };
    const flow = await this.authFlowService.create(
      'STEP_UP',
      AWAITING_FEDERATED_STEP_UP,
      { userId: session.userId.toString(), sessionId: session.id.toString(), device, federated, elevationIntent: elevationIntent ?? undefined },
      FEDERATED_STEP_UP_FLOW_TTL_SECONDS,
    );

    const codeChallenge = createHash('sha256').update(federated.codeVerifier).digest('base64url');
    const authorizationUrl = this.upstreamOidcService.buildAuthorizationUrl(provider, { state: flow.flowId, nonce: federated.nonce, codeChallenge });
    return { flowId: flow.flowId, authorizationUrl };
  }

  async complete(flow: AuthFlowContext, identity: UpstreamIdentity): Promise<FederatedStepUpElevation> {
    const federated = flow.federated;
    if (!federated || flow.status !== AWAITING_FEDERATED_STEP_UP || !flow.sessionId || !flow.userId) throw AppErrorCode.AUTH_002.create();

    const link = await this.federatedIdentityService.findBySubject(federated.identityProviderId, identity.subject);
    if (!link || link.userId.toString() !== flow.userId) throw AppErrorCode.AUTH_003.create();

    const elevated = await this.sessionService.elevate(BigInt(flow.sessionId), flow.elevationIntent);
    if (!elevated || !elevated.elevatedUntil) throw AppErrorCode.AUTH_005.create();

    await this.auditService.record({
      action: 'auth.mfa.step_up',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: flow.userId,
      detail: { method: 'FEDERATED', intentClientId: flow.elevationIntent?.clientId ?? null, intentResource: flow.elevationIntent?.resource ?? null },
    });
    await this.authFlowService.delete(flow.flowId);
    return { aal: elevated.aal, elevatedUntil: new Date(elevated.elevatedUntil) };
  }
}
