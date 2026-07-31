/**
 * Importing npm packages
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type ValidatedSession } from '@server/modules/auth/session';
import { RefreshTokenService } from '@server/modules/auth/token';
import { AuditService } from '@server/modules/infrastructure/audit';
import { Consent, DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationMemberService, ApplicationService } from '@server/modules/system/application';

import { OAuthClientService } from './oauth-client.service';

/**
 * Defining types
 */

interface ConsentCaller {
  session: ValidatedSession;
  ip: string;
}

export interface ConsentScopeData {
  name: string;
  description?: string;
  isSensitive: boolean;
}

export interface ConsentPromptData {
  clientName: string;
  isFirstParty: boolean;
  alreadyGranted: boolean;
  scopes: ConsentScopeData[];
}

export interface ConsentRecordData {
  clientId: string;
  clientName: string;
  applicationName: string;
  scopeNames: string[];
  source: Consent.Source;
  grantedAt: Date;
}

export interface ConsentDecisionInput {
  clientId: string;
  scopeNames: string[];
  decision: 'APPROVE' | 'DENY';
  redirectUri?: string;
  state?: string;
}

export interface ConsentDecisionData {
  decision: 'APPROVE' | 'DENY';
  redirectTo?: string;
}

/**
 * Declaring the constants
 *
 * Standard OIDC scopes never live in the scopes table (they belong to the protocol, not an API
 * resource), so the prompt describes them from this fixed map.
 */
const OIDC_SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: 'Confirm your identity',
  profile: 'Read your basic profile (name)',
  email: 'Read your primary email address',
  offline_access: 'Stay signed in and refresh access without asking again',
};

@Injectable()
export class ConsentService {
  private readonly logger = Logger.getLogger(APP_NAME, ConsentService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly clientService: OAuthClientService,
    private readonly applicationService: ApplicationService,
    private readonly applicationMemberService: ApplicationMemberService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /* --------------------------- caller-facing orchestration --------------------------- */

  /** Describes a pending consent prompt: who is asking and for what, in user terms. */
  async buildPrompt(userId: bigint, clientId: string, scope: string): Promise<ConsentPromptData> {
    const client = await this.clientService.getClient(clientId);
    if (!client || !client.isActive) throw AppErrorCode.OAU_001.create();

    /** Only user-holdable scopes reach a consent screen; service-only scopes are dropped. */
    const requested = await this.clientService.filterScopesForPrincipal(scope.split(' ').filter(Boolean), 'user');
    const active = await this.getActive(userId, client.id);
    const alreadyGranted = active !== null && requested.every(name => active.scopeNames.includes(name));

    const resourceScopes = requested.length > 0 ? await this.db.query.scopes.findMany({ where: inArray(schema.scopes.name, requested) }) : [];
    const scopes: ConsentScopeData[] = requested.map(name => {
      const match = resourceScopes.find(candidate => candidate.name === name);
      return { name, description: match?.description ?? OIDC_SCOPE_DESCRIPTIONS[name], isSensitive: match?.isSensitive ?? false };
    });
    return { clientName: client.name, isFirstParty: client.isFirstParty, alreadyGranted, scopes };
  }

  /** Records the user's decision; denials answer with the validated `access_denied` redirect. */
  async decide(caller: ConsentCaller, input: ConsentDecisionInput): Promise<ConsentDecisionData> {
    const client = await this.clientService.getClient(input.clientId);
    if (!client || !client.isActive) throw AppErrorCode.OAU_001.create();
    const target = { actorType: 'USER' as const, actorId: caller.session.userId.toString(), targetType: 'oauth_client', targetId: client.id, ipAddress: caller.ip };

    if (input.decision === 'APPROVE') {
      await this.record(caller.session.userId, client.id, input.scopeNames, 'USER');
      await this.auditService.record({ action: 'oauth.consent.granted', outcome: 'SUCCESS', ...target });
      return { decision: 'APPROVE' };
    }

    let redirectTo: string | undefined;
    if (input.redirectUri && (await this.clientService.isRedirectUriAllowed(client.id, input.redirectUri))) {
      const url = new URL(input.redirectUri);
      url.searchParams.set('error', 'access_denied');
      if (input.state) url.searchParams.set('state', input.state);
      redirectTo = url.toString();
    }
    await this.auditService.record({ action: 'oauth.consent.denied', outcome: 'SUCCESS', ...target });
    return { decision: 'DENY', redirectTo };
  }

  /** The user's active grants enriched with the owning application's display name, for the connected-apps surface. */
  async listConsentRecords(userId: bigint): Promise<ConsentRecordData[]> {
    const consents = await this.listForUser(userId);
    return Promise.all(
      consents.map(async consent => {
        const client = await this.clientService.getClient(consent.clientId);
        const application = client ? this.applicationService.getApplicationById(client.applicationId) : null;
        return {
          clientId: consent.clientId,
          clientName: client?.name ?? 'Unknown application',
          applicationName: application?.displayName ?? application?.name ?? client?.name ?? 'Unknown application',
          scopeNames: consent.scopeNames,
          source: consent.source,
          grantedAt: consent.grantedAt,
        };
      }),
    );
  }

  async withdrawForUser(caller: ConsentCaller, clientId: string): Promise<void> {
    await this.withdraw(caller.session.userId, clientId);
    await this.auditService.record({
      action: 'oauth.consent.withdrawn',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: caller.session.userId.toString(),
      targetType: 'oauth_client',
      targetId: clientId,
      ipAddress: caller.ip,
    });
  }

  private activeCondition(userId: bigint, clientId: string) {
    return and(eq(schema.consents.userId, userId), eq(schema.consents.clientId, clientId), isNull(schema.consents.revokedAt));
  }

  async getActive(userId: bigint, clientId: string): Promise<Consent | null> {
    const consent = await this.db.query.consents.findFirst({ where: this.activeCondition(userId, clientId) });
    return consent ?? null;
  }

  /** Records a consent grant idempotently, adding any newly requested scopes to the active record. */
  async record(userId: bigint, clientId: string, scopeNames: string[], source: Consent.Source): Promise<void> {
    const existing = await this.getActive(userId, clientId);
    if (!existing) {
      await this.db.insert(schema.consents).values({ userId, clientId, scopeNames, source });
      await this.provisionMembership(userId, clientId);
      return;
    }
    const merged = Array.from(new Set([...existing.scopeNames, ...scopeNames]));
    if (merged.length !== existing.scopeNames.length) await this.db.update(schema.consents).set({ scopeNames: merged }).where(eq(schema.consents.id, existing.id));
  }

  /**
   * First-use provisioning: a fresh grant enrols the user into the client's application. Best-effort
   * by design — a usage record must never break the authorization it rides on, so a failure is
   * logged and swallowed rather than surfaced to the OAuth flow.
   */
  private async provisionMembership(userId: bigint, clientId: string): Promise<void> {
    try {
      const client = await this.clientService.getClient(clientId);
      if (client) await this.applicationMemberService.ensureMembership(client.applicationId, userId);
    } catch (error) {
      this.logger.warn('Failed to provision application membership on consent', { userId, clientId, error });
    }
  }

  async listForUser(userId: bigint): Promise<Consent[]> {
    return this.db.query.consents.findMany({ where: and(eq(schema.consents.userId, userId), isNull(schema.consents.revokedAt)) });
  }

  /** Withdraws consent and revokes every token the client holds for the user. */
  async withdraw(userId: bigint, clientId: string): Promise<void> {
    await this.db.update(schema.consents).set({ revokedAt: new Date() }).where(this.activeCondition(userId, clientId));
    await this.refreshTokenService.revokeForUserClient(userId, clientId);
    this.logger.info('Consent withdrawn', { userId, clientId });
  }
}
