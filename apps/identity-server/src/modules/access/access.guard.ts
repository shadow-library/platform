import { type FastifyRequest } from 'fastify';
import { type HandlerMetadata } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { AsyncRouteHandler, Middleware, MiddlewareGenerator } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { AdminAccessService } from '@server/modules/admin';
import { type JwtClaims, KeyService } from '@server/modules/auth/keys';
import { SessionAuthService, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { BOT_KEY_PREFIX, BotKeyExchangeService } from '@server/modules/identity/bot';
import { OrganisationService } from '@server/modules/identity/organisation';
import { ApplicationService } from '@server/modules/system/application';

import { ACCESS_METADATA } from './access.decorator';
import { type AuthContext, type AuthenticatedRequest, type AuthOptions } from './access.types';
import { clientInfoOf } from './auth-context.accessor';

const PLATFORM_AUDIENCE = 'shadow-identity';
const BOT_BEARER_PREFIX = `Bearer ${BOT_KEY_PREFIX}`;

@Middleware({ type: 'preHandler', weight: 100 })
export class AccessGuard implements MiddlewareGenerator {
  private readonly logger = Logger.getLogger(APP_NAME, AccessGuard.name);
  private readonly issuer = Config.get('oauth.issuer');

  constructor(
    private readonly sessionAuthService: SessionAuthService,
    private readonly sessionService: SessionService,
    private readonly adminAccessService: AdminAccessService,
    private readonly organisationService: OrganisationService,
    private readonly keyService: KeyService,
    private readonly botKeyExchangeService: BotKeyExchangeService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly applicationService: ApplicationService,
  ) {}

  cacheKey(metadata: HandlerMetadata): string {
    return `access:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: HandlerMetadata): AsyncRouteHandler | undefined {
    const options = metadata[ACCESS_METADATA] as AuthOptions | undefined;
    if (!options || options.public) return undefined;

    return async (request: FastifyRequest): Promise<void> => {
      const context: AuthContext = { clientInfo: clientInfoOf(request as AuthenticatedRequest) };

      const botKey = this.botKeyOf(request);
      if (botKey !== null) {
        await this.authenticateBot(request, options, botKey, context, String(metadata.path));
        (request as AuthenticatedRequest).auth = context;
        return;
      }

      if (options.service) {
        context.serviceToken = this.verifyServiceToken(request, options.service === true ? undefined : options.service);
        (request as AuthenticatedRequest).auth = context;
        return;
      }

      const session = options.elevated ? await this.sessionAuthService.authenticateElevated(request) : await this.sessionAuthService.authenticate(request);
      context.session = session;
      context.elevated = this.sessionService.isSelfServiceElevated(session);

      if (options.permission) context.actor = await this.adminAccessService.authorize(session, options.permission);

      if (options.orgRole) {
        const { membership, organisation } = await this.organisationService.requireRole(session.userId, this.organisationIdOf(request, options.orgParam), options.orgRole);
        context.membership = membership;
        context.organisation = organisation;
      } else if (options.orgMember) {
        context.membership = await this.organisationService.assertMember(session.userId, this.organisationIdOf(request, options.orgParam));
      }

      (request as AuthenticatedRequest).auth = context;
    };
  }

  private botKeyOf(request: FastifyRequest): string | null {
    const header = request.headers.authorization;
    return typeof header === 'string' && header.startsWith(BOT_BEARER_PREFIX) ? header.slice('Bearer '.length) : null;
  }

  private async authenticateBot(request: FastifyRequest, options: AuthOptions, key: string, context: AuthContext, route: string): Promise<void> {
    const authentication = await this.botKeyExchangeService.authenticate(key, context.clientInfo.ip, 'direct');
    if (authentication.status === 'rate_limited') throw AppErrorCode.SEC_001.create();
    if (authentication.status === 'denied') throw AppErrorCode.AUTH_005.create();

    const { bot } = authentication;
    const denial = { securityEvent: 'bot.access_denied', botId: bot.id.toString(), clientId: bot.clientId, route };
    if (!options.bot || options.elevated || options.permission || options.service) {
      this.logger.warn('bot refused: the route does not admit bots', denial);
      throw AppErrorCode.ORG_007.create();
    }

    const organisationId = this.organisationIdOf(request, options.orgParam);
    if (organisationId !== bot.organisationId) {
      this.logger.warn("bot refused: the route names another organisation than the bot's own", denial);
      throw AppErrorCode.ORG_001.create();
    }

    const organisation = await this.organisationService.getById(organisationId);
    if (!organisation || organisation.status !== 'ACTIVE') throw AppErrorCode.ORG_001.create();

    const principal = { type: 'SERVICE_ACCOUNT' as const, id: bot.clientId };
    const platformApplicationId = this.applicationService.getApplicationOrThrow(APP_NAME).id;
    const decision = await this.policyDecisionService.checkForApplication({ principal, organisationId: organisationId.toString(), action: options.bot }, platformApplicationId);
    if (decision.decision !== 'PERMIT') {
      this.logger.warn('bot refused: permission not granted', { ...denial, permission: options.bot });
      throw AppErrorCode.ORG_007.create();
    }

    context.bot = bot;
    context.organisation = organisation;
  }

  private organisationIdOf(request: FastifyRequest, orgParam = 'organisationId'): bigint {
    const value = (request.params as Record<string, string | undefined>)[orgParam];
    if (!value) throw AppErrorCode.ORG_001.create();
    return BigInt(value);
  }

  private verifyServiceToken(request: FastifyRequest, scope?: string): JwtClaims {
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw AppErrorCode.SEC_003.create();

    const claims = this.keyService.verify(token);
    const now = Math.floor(Date.now() / 1000);
    if (!claims || typeof claims.exp !== 'number' || claims.exp <= now || claims.iss !== this.issuer) throw AppErrorCode.SEC_003.create();

    const scopes = typeof claims.scope === 'string' ? claims.scope.split(' ') : [];
    if (claims.token_type !== 'service' || claims.aud !== PLATFORM_AUDIENCE) throw AppErrorCode.SEC_004.create();
    if (scope !== undefined && !scopes.includes(scope)) throw AppErrorCode.SEC_004.create();
    return claims;
  }
}
