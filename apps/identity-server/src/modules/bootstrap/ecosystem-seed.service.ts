/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { ServiceAccessService } from '@server/modules/authz';
import { type Application, OAuthClient } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

/**
 * Defining types
 */

interface EcosystemApp {
  /** Application name; doubles as the browser relying-party client name */
  name: 'pulse' | 'novel-forge' | 'webnovel';
  subDomain: string;
  displayName: string;
  /**
   * Public browser origins seeded onto the application the first time it is created. Thereafter the
   * stored `public_urls` are authoritative and edited through the admin console — these are only the
   * bootstrap defaults, so a fresh cluster or CI run has working redirect URIs out of the box.
   */
  defaultPublicUrls: string[];
}

type FixedCredentialKey = `ecosystem.${EcosystemApp['name']}.${'rp' | 'server'}-client-${'id' | 'secret'}` | `ecosystem.identity-server.client-${'id' | 'secret'}`;

interface FixedCredentials {
  /** Client id (UUID) the seed assigns at creation; existing clients always keep their id */
  id?: string;
  /** Secret the client converges onto every boot; never logged */
  secret?: string;
}

/**
 * Declaring the constants
 */
const PLATFORM_RESOURCE = 'shadow-identity';
const AUTHZ_CHECK_SCOPE = 'authz:check';
const AUTHZ_ROLES_SYNC_SCOPE = 'authz:roles:sync';
const WEBNOVEL_PUBLISH_SCOPE = 'webnovel:publish';
const PULSE_NOTIFICATIONS_SEND_SCOPE = 'notifications:send';

const IDENTITY_SERVICE_CLIENT = 'identity-server';
const OAUTH_CALLBACK_PATH = '/api/auth/callback';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RP_GRANT_TYPES = ['authorization_code', 'refresh_token'];
const SERVICE_GRANT_TYPES = ['client_credentials'];

const ECOSYSTEM_APPS: EcosystemApp[] = [
  { name: 'pulse', subDomain: 'pulse', displayName: 'Shadow Pulse', defaultPublicUrls: ['http://pulse.shadow-apps.test', 'http://localhost:3000'] },
  { name: 'novel-forge', subDomain: 'novel-forge', displayName: 'Novel Forge', defaultPublicUrls: ['http://novel-forge.shadow-apps.test', 'http://localhost:3001'] },
  { name: 'webnovel', subDomain: 'webnovel', displayName: 'Webnovel', defaultPublicUrls: ['http://webnovel.shadow-apps.test', 'http://localhost:3002'] },
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
 *
 * Optionally, `ECOSYSTEM_*_CLIENT_ID` / `ECOSYSTEM_*_CLIENT_SECRET` environment variables fix a
 * client's credentials so a fresh cluster can pre-declare them: the id (a UUID) binds only when
 * the seed first creates the client, while the secret converges on every boot — rotating the env
 * value rotates the client. Env-provided secrets are never logged.
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
      await this.ensureRelyingPartyClient(app, application);
      const serviceCredentials = this.fixedCredentials(`ecosystem.${app.name}.server-client-id` as const, `ecosystem.${app.name}.server-client-secret` as const);
      const serviceClientId = await this.ensureServiceClient(this.serviceClientName(app), application.id, serviceCredentials);
      await this.oauthClientService.grantScope(serviceClientId, authzCheckScopeId);
      await this.oauthClientService.grantScope(serviceClientId, rolesSyncScopeId);
      serviceClientIds.set(this.serviceClientName(app), serviceClientId);
    }

    /** Identity's own outbound M2M client — the caller behind its pulse-server notification calls. */
    const identityCredentials = this.fixedCredentials('ecosystem.identity-server.client-id', 'ecosystem.identity-server.client-secret');
    const identityClientId = await this.ensureServiceClient(IDENTITY_SERVICE_CLIENT, platform.id, identityCredentials);

    /** identity-server's notification tokens carry pulse's send scope (FC-1), so the scope and its grant must exist. */
    const pulse = this.applicationService.getApplicationOrThrow('pulse');
    const notificationsSendScopeId = await this.oauthClientService.ensureScope(pulse.id, 'pulse-server', PULSE_NOTIFICATIONS_SEND_SCOPE);
    await this.oauthClientService.grantScope(identityClientId, notificationsSendScopeId);

    /** novel-forge-server may request `webnovel:publish` when minting tokens for webnovel-server. */
    const webnovel = this.applicationService.getApplicationOrThrow('webnovel');
    const publishScopeId = await this.oauthClientService.ensureScope(webnovel.id, 'webnovel-server', WEBNOVEL_PUBLISH_SCOPE);
    const novelForgeServerId = serviceClientIds.get('novel-forge-server') as string;
    await this.oauthClientService.grantScope(novelForgeServerId, publishScopeId);

    /** Deny-by-default M2M allowlist (D-17): without these rules the target service 403s the caller. */
    await this.serviceAccessService.create({ applicationId: pulse.id, callerClientId: identityClientId, method: 'POST', pathPattern: '/api/v1/notifications', createdBy: 'ecosystem-seed' });
    await this.serviceAccessService.create({ applicationId: webnovel.id, callerClientId: novelForgeServerId, method: '*', pathPattern: '/internal/*', createdBy: 'ecosystem-seed' });
  }

  private serviceClientName(app: EcosystemApp): string {
    return `${app.name}-server`;
  }

  /** Derives a relying party's callback redirect URIs from an application's stored public origins. */
  private redirectUris(publicUrls: string[]): string[] {
    return publicUrls.map(origin => origin.trim().replace(/\/$/, '')).filter(Boolean).map(origin => `${origin}${OAUTH_CALLBACK_PATH}`);
  }

  private async ensureApplication(app: EcosystemApp): Promise<Application> {
    const existing = this.applicationService.getApplication(app.name);
    if (existing) {
      if (existing.publicUrls.length > 0) return existing;
      /** Upgrade path: an application created before `public_urls` existed adopts the bootstrap defaults once. */
      return this.applicationService.updateApplication(app.name, { publicUrls: app.defaultPublicUrls });
    }
    return this.applicationService.createApplication({ name: app.name, subDomain: app.subDomain, displayName: app.displayName, publicUrls: app.defaultPublicUrls });
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

  private async ensureRelyingPartyClient(app: EcosystemApp, application: Application): Promise<void> {
    const label = `relying-party client '${app.name}'`;
    const redirectUris = this.redirectUris(application.publicUrls);
    const fixed = this.fixedCredentials(`ecosystem.${app.name}.rp-client-id` as const, `ecosystem.${app.name}.rp-client-secret` as const);
    const existing = await this.findClient(application.id, app.name, 'WEB_CONFIDENTIAL');

    if (!existing) {
      const registered = await this.oauthClientService.register({ applicationId: application.id, id: fixed.id, name: app.name, kind: 'WEB_CONFIDENTIAL', isFirstParty: true, redirectUris, grantTypes: RP_GRANT_TYPES });
      await this.finalizeRegistration(label, registered, fixed);
      return;
    }

    this.refuseRekey(label, existing.id, fixed.id);
    await this.convergeFixedSecret(label, existing.id, fixed.secret);

    /**
     * Redirect URIs are now owned by the DB (edited through the console), so the seed no longer
     * overwrites them on every boot — it only backfills a client that has none, e.g. the first boot
     * after `public_urls` was introduced.
     */
    const detail = await this.oauthClientService.getClientDetail(existing.id);
    if ((detail?.redirectUris ?? []).length === 0 && redirectUris.length > 0) {
      await this.oauthClientService.updateClient(existing.id, { redirectUris });
      this.logger.info(`Backfilled redirect URIs of relying-party client '${app.name}'`, { clientId: existing.id, redirectUris });
    }
  }

  private async ensureServiceClient(name: string, applicationId: number, fixed: FixedCredentials): Promise<string> {
    const label = `service client '${name}'`;
    const existing = await this.findClient(applicationId, name, 'SERVICE');
    if (existing) {
      this.refuseRekey(label, existing.id, fixed.id);
      await this.convergeFixedSecret(label, existing.id, fixed.secret);
      return existing.id;
    }

    const registered = await this.oauthClientService.register({ applicationId, id: fixed.id, name, kind: 'SERVICE', isFirstParty: true, grantTypes: SERVICE_GRANT_TYPES });
    await this.finalizeRegistration(label, registered, fixed);
    return registered.clientId;
  }

  /**
   * Reads a client's optional fixed credentials from the environment, treating empty values as
   * unset so blank vault entries fall back to the random-per-cluster behaviour.
   */
  private fixedCredentials(idKey: FixedCredentialKey, secretKey: FixedCredentialKey): FixedCredentials {
    const id = Config.get(idKey) || undefined;
    const secret = Config.get(secretKey) || undefined;
    if (id && !UUID_REGEX.test(id)) throw AppError.internal(`Environment variable '${idKey.toUpperCase().replace(/[.-]/g, '_')}' must be a UUID; received '${id}'`);
    return { id, secret };
  }

  /**
   * Fixed ids bind only at creation: re-keying a live client would orphan every consent, grant and
   * token referencing it, so a mismatch keeps the existing id and surfaces loudly instead.
   */
  private refuseRekey(label: string, existingId: string, fixedId: string | undefined): void {
    if (!fixedId || fixedId === existingId) return;
    this.logger.warn(`${label} already exists as clientId=${existingId}; refusing to re-key it to the configured fixed id — fixed client ids apply only when the seed first creates the client`, {
      clientId: existingId,
      configuredClientId: fixedId,
    });
  }

  /**
   * Converges the client onto the env-provided secret: a no-op when unset or already verifying, a
   * revoke-and-replace otherwise, so rotating the env value rotates the client on the next boot.
   */
  private async convergeFixedSecret(label: string, clientId: string, secret: string | undefined): Promise<void> {
    if (!secret) return;
    if (await this.oauthClientService.verifySecret(clientId, secret)) return;
    await this.oauthClientService.setSecret(clientId, secret);
    this.logger.info(`Converged ${label} onto the environment secret — using provided secret`, { clientId });
  }

  /** Replaces the registration-minted secret with the env one when fixed; the random secret is logged the one time it exists, env secrets never are. */
  private async finalizeRegistration(label: string, registered: { clientId: string; secret?: string }, fixed: FixedCredentials): Promise<void> {
    if (!fixed.secret) {
      this.logger.warn(`Registered ${label} — the secret is shown only this once: clientId=${registered.clientId} secret=${registered.secret}`);
      return;
    }
    await this.oauthClientService.setSecret(registered.clientId, fixed.secret);
    this.logger.warn(`Registered ${label} — using provided secret: clientId=${registered.clientId}`);
  }
}
