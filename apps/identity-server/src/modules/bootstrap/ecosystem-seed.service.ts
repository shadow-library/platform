/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { ServiceAccessService } from '@server/modules/authz';
import { OAuthClient } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

/**
 * Defining types
 */

interface EcosystemApp {
  /** Application name; doubles as the browser relying-party client name */
  name: 'pulse' | 'novel-forge' | 'webnovel';
  subDomain: string;
  displayName: string;
  /** Config key holding the comma-separated public origins that receive `/api/auth/callback` redirect URIs */
  publicUrlsKey: 'ecosystem.pulse.public-urls' | 'ecosystem.novel-forge.public-urls' | 'ecosystem.webnovel.public-urls';
}

/**
 * Declaring the constants
 */
const PLATFORM_RESOURCE = 'shadow-identity';
const AUTHZ_CHECK_SCOPE = 'authz:check';
const AUTHZ_ROLES_SYNC_SCOPE = 'authz:roles:sync';
const WEBNOVEL_PUBLISH_SCOPE = 'webnovel:publish';

const IDENTITY_SERVICE_CLIENT = 'identity-server';
const OAUTH_CALLBACK_PATH = '/api/auth/callback';
const RP_GRANT_TYPES = ['authorization_code', 'refresh_token'];
const SERVICE_GRANT_TYPES = ['client_credentials'];

const ECOSYSTEM_APPS: EcosystemApp[] = [
  { name: 'pulse', subDomain: 'pulse', displayName: 'Shadow Pulse', publicUrlsKey: 'ecosystem.pulse.public-urls' },
  { name: 'novel-forge', subDomain: 'novel-forge', displayName: 'Novel Forge', publicUrlsKey: 'ecosystem.novel-forge.public-urls' },
  { name: 'webnovel', subDomain: 'webnovel', displayName: 'Webnovel', publicUrlsKey: 'ecosystem.webnovel.public-urls' },
];

/**
 * Idempotently provisions the first-party ecosystem: an application, an API resource (the
 * audience, named `<app>-server`), a browser relying-party client (`authorization_code` + PKCE)
 * and an M2M service client (`client_credentials`) for each downstream app, plus the
 * service-access rules and cross-service scope grants the ecosystem depends on. Invoked from
 * {@link BootstrapService} after the platform records exist, so it converges on every boot and on
 * template seeding alike. Client secrets are minted once at registration and logged a single time
 * (mirroring the bootstrap-admin password); thereafter rotation goes through
 * `POST /api/v1/admin/clients/:clientId/rotate-secret`.
 */
@Injectable()
export class EcosystemSeedService {
  private readonly logger = Logger.getLogger(APP_NAME, EcosystemSeedService.name);

  constructor(
    private readonly applicationService: ApplicationService,
    private readonly oauthClientService: OAuthClientService,
    private readonly serviceAccessService: ServiceAccessService,
  ) {}

  async seed(): Promise<void> {
    const platform = this.applicationService.getApplicationOrThrow(APP_NAME);
    const authzCheckScopeId = await this.oauthClientService.ensureScope(platform.id, PLATFORM_RESOURCE, AUTHZ_CHECK_SCOPE);
    const rolesSyncScopeId = await this.oauthClientService.ensureScope(platform.id, PLATFORM_RESOURCE, AUTHZ_ROLES_SYNC_SCOPE);

    const serviceClientIds = new Map<string, string>();
    for (const app of ECOSYSTEM_APPS) {
      const application = await this.ensureApplication(app);
      await this.oauthClientService.ensureResource(application.id, this.serviceClientName(app), `${app.displayName} API`);
      await this.ensureRelyingPartyClient(app, application.id);
      const serviceClientId = await this.ensureServiceClient(this.serviceClientName(app), application.id);
      await this.oauthClientService.grantScope(serviceClientId, authzCheckScopeId);
      await this.oauthClientService.grantScope(serviceClientId, rolesSyncScopeId);
      serviceClientIds.set(this.serviceClientName(app), serviceClientId);
    }

    /** Identity's own outbound M2M client — the caller behind its pulse-server notification calls. */
    const identityClientId = await this.ensureServiceClient(IDENTITY_SERVICE_CLIENT, platform.id);

    /** novel-forge-server may request `webnovel:publish` when minting tokens for webnovel-server. */
    const webnovel = this.applicationService.getApplicationOrThrow('webnovel');
    const publishScopeId = await this.oauthClientService.ensureScope(webnovel.id, 'webnovel-server', WEBNOVEL_PUBLISH_SCOPE);
    const novelForgeServerId = serviceClientIds.get('novel-forge-server') as string;
    await this.oauthClientService.grantScope(novelForgeServerId, publishScopeId);

    /** Deny-by-default M2M allowlist (D-17): without these rules the target service 403s the caller. */
    const pulse = this.applicationService.getApplicationOrThrow('pulse');
    await this.serviceAccessService.create({ applicationId: pulse.id, callerClientId: identityClientId, method: 'POST', pathPattern: '/api/v1/notifications', createdBy: 'ecosystem-seed' });
    await this.serviceAccessService.create({ applicationId: webnovel.id, callerClientId: novelForgeServerId, method: '*', pathPattern: '/internal/*', createdBy: 'ecosystem-seed' });
  }

  private serviceClientName(app: EcosystemApp): string {
    return `${app.name}-server`;
  }

  private redirectUris(app: EcosystemApp): string[] {
    return Config.get(app.publicUrlsKey)
      .split(',')
      .map(origin => origin.trim().replace(/\/$/, ''))
      .filter(Boolean)
      .map(origin => `${origin}${OAUTH_CALLBACK_PATH}`);
  }

  private async ensureApplication(app: EcosystemApp): Promise<{ id: number }> {
    const existing = this.applicationService.getApplication(app.name);
    if (existing) return existing;
    return this.applicationService.createApplication({ name: app.name, subDomain: app.subDomain, displayName: app.displayName });
  }

  /**
   * Client lookups are by (application, name): client ids are database-generated UUIDs, so name is
   * the seed's stable identity. Creation is not constraint-guarded, so simultaneous first boots of
   * multiple replicas could duplicate a client; every later boot converges on the first match.
   */
  private async findClient(applicationId: number, name: string, kind: OAuthClient.Kind): Promise<OAuthClient | null> {
    const clients = await this.oauthClientService.listClients();
    return clients.find(client => client.applicationId === applicationId && client.name === name && client.kind === kind) ?? null;
  }

  private async ensureRelyingPartyClient(app: EcosystemApp, applicationId: number): Promise<void> {
    const redirectUris = this.redirectUris(app);
    const existing = await this.findClient(applicationId, app.name, 'WEB_CONFIDENTIAL');

    if (!existing) {
      const registered = await this.oauthClientService.register({ applicationId, name: app.name, kind: 'WEB_CONFIDENTIAL', isFirstParty: true, redirectUris, grantTypes: RP_GRANT_TYPES });
      this.logger.warn(`Registered relying-party client '${app.name}' — the secret is shown only this once: clientId=${registered.clientId} secret=${registered.secret}`);
      return;
    }

    /** Redirect URIs follow the environment, so an env change converges on the next boot. */
    const detail = await this.oauthClientService.getClientDetail(existing.id);
    const current = [...(detail?.redirectUris ?? [])].sort();
    if (current.join('\n') === [...redirectUris].sort().join('\n')) return;
    await this.oauthClientService.updateClient(existing.id, { redirectUris });
    this.logger.info(`Converged redirect URIs of relying-party client '${app.name}'`, { clientId: existing.id, redirectUris });
  }

  private async ensureServiceClient(name: string, applicationId: number): Promise<string> {
    const existing = await this.findClient(applicationId, name, 'SERVICE');
    if (existing) return existing.id;

    const registered = await this.oauthClientService.register({ applicationId, name, kind: 'SERVICE', isFirstParty: true, grantTypes: SERVICE_GRANT_TYPES });
    this.logger.warn(`Registered service client '${name}' — the secret is shown only this once: clientId=${registered.clientId} secret=${registered.secret}`);
    return registered.clientId;
  }
}
