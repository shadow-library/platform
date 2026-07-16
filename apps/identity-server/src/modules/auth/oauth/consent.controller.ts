/**
 * Importing npm packages
 */

import { Body, Get, HttpController, HttpStatus, Post, Query, Req, RespondFor } from '@shadow-library/fastify';
import { inArray } from 'drizzle-orm';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { SessionAuthService } from '@server/modules/auth/session';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

import { ConsentDecisionBody, ConsentDecisionResponse, ConsentPromptQuery, ConsentPromptResponse, ConsentScopeDto } from './consent.dto';
import { ConsentService } from './consent.service';
import { OAuthClientService } from './oauth-client.service';

/**
 * Defining types
 */

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

@HttpController('/api/v1/auth/consent')
export class ConsentController {
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly sessionAuthService: SessionAuthService,
    private readonly consentService: ConsentService,
    private readonly clientService: OAuthClientService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /** Describes a pending consent prompt: who is asking and for what, in user terms. */
  @Get()
  @RespondFor(200, ConsentPromptResponse)
  async prompt(@Query() query: ConsentPromptQuery, @Req() request: FastifyRequest): Promise<ConsentPromptResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const client = await this.clientService.getClient(query.clientId);
    if (!client || !client.isActive) throw AppErrorCode.OAU_001.create();

    const requested = query.scope.split(' ').filter(Boolean);
    const active = await this.consentService.getActive(session.userId, client.id);
    const alreadyGranted = active !== null && requested.every(name => active.scopeNames.includes(name));

    const resourceScopes = requested.length > 0 ? await this.db.query.scopes.findMany({ where: inArray(schema.scopes.name, requested) }) : [];
    const scopes: ConsentScopeDto[] = requested.map(name => {
      const match = resourceScopes.find(scope => scope.name === name);
      return { name, description: match?.description ?? OIDC_SCOPE_DESCRIPTIONS[name], isSensitive: match?.isSensitive ?? false };
    });

    return { clientName: client.name, isFirstParty: client.isFirstParty, alreadyGranted, scopes };
  }

  /** Records the user's decision; denials answer with the validated `access_denied` redirect. */
  @Post()
  @HttpStatus(200)
  @RespondFor(200, ConsentDecisionResponse)
  async decide(@Body() body: ConsentDecisionBody, @Req() request: FastifyRequest): Promise<ConsentDecisionResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const client = await this.clientService.getClient(body.clientId);
    if (!client || !client.isActive) throw AppErrorCode.OAU_001.create();

    const actor = { actorType: 'USER' as const, actorId: session.userId.toString(), targetType: 'oauth_client', targetId: client.id, ipAddress: request.ip };

    if (body.decision === 'APPROVE') {
      await this.consentService.record(session.userId, client.id, body.scopeNames, 'USER');
      await this.auditService.record({ action: 'oauth.consent.granted', outcome: 'SUCCESS', ...actor });
      return { decision: 'APPROVE' };
    }

    let redirectTo: string | undefined;
    if (body.redirectUri && (await this.clientService.isRedirectUriAllowed(client.id, body.redirectUri))) {
      const url = new URL(body.redirectUri);
      url.searchParams.set('error', 'access_denied');
      if (body.state) url.searchParams.set('state', body.state);
      redirectTo = url.toString();
    }
    await this.auditService.record({ action: 'oauth.consent.denied', outcome: 'SUCCESS', ...actor });
    return { decision: 'DENY', redirectTo };
  }
}
