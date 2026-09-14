import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger, throwError } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { applicationAudience, OAUTH_CALLBACK_PATH, OAuthClientService } from '@server/modules/auth/oauth';
import { PolicyDecisionService, ServiceAccessService } from '@server/modules/authz';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { announceSecretOnce } from './bootstrap-secrets.util';
import { ECOSYSTEM_SEED, type SeedApplication, type SeedScopeGrant, type SeedServiceClient } from './ecosystem-seed.constants';

export interface EcosystemOperator {
  adminUserId: bigint;
  platformOrganisationId: bigint;
}

const workloadSubject = (app: string): string => `system:serviceaccount:${app}:${app}-server`;

const scopeKey = (resource: string, scope: string): string => `${resource}::${scope}`;

@Injectable()
export class EcosystemSeedService {
  private readonly logger = Logger.getLogger(APP_NAME, EcosystemSeedService.name);

  constructor(
    private readonly applicationService: ApplicationService,
    private readonly applicationRoleService: ApplicationRoleService,
    private readonly oauthClientService: OAuthClientService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly serviceAccessService: ServiceAccessService,
  ) {}

  async seed(operator: EcosystemOperator): Promise<void> {
    const newApplications = ECOSYSTEM_SEED.applications.filter(application => !this.applicationService.getApplication(application.name));
    const existingApplications = ECOSYSTEM_SEED.applications.filter(application => this.applicationService.getApplication(application.name));
    const newServiceClients: SeedServiceClient[] = [];
    for (const client of ECOSYSTEM_SEED.serviceClients) {
      if (!(await this.oauthClientService.getClient(client.id))) newServiceClients.push(client);
    }

    const scopes = await this.loadScopeCatalogue();
    for (const application of newApplications) await this.createApplication(application, operator, scopes);
    for (const client of newServiceClients) await this.createServiceClient(client);

    for (const application of newApplications) await this.bindApplication(application, scopes);
    for (const application of existingApplications) await this.reconcileApplication(application, scopes);

    /**
     * Every service client, not only the ones just created: a grant added to the seed after a deployment
     * exists would otherwise never reach it, and the caller would be denied forever with nothing to show
     * for it. `grantScope` inserts on conflict do nothing, so re-running costs a no-op per grant, and a
     * seeded grant an operator revokes comes back on the next restart, as a seeded application grant
     * already does. This runs last because `reconcileApplication` is what adds a newly declared scope to
     * `scopes`.
     */
    for (const client of ECOSYSTEM_SEED.serviceClients) await this.grantScopes(client.id, client.grants, scopes);
  }

  private async loadScopeCatalogue(): Promise<Map<string, string>> {
    const resources = await this.oauthClientService.listResources();
    const catalogue = new Map<string, string>();
    for (const resource of resources) {
      for (const scope of resource.scopes) catalogue.set(scopeKey(resource.identifier, scope.name), scope.id);
    }
    return catalogue;
  }

  private appPublicOrigins(seed: SeedApplication): { primary: string; origins: string[] } {
    const root = new URL(Config.get('oauth.issuer')).hostname.split('.').slice(1).join('.');
    const primary = `https://${seed.publicHost ?? seed.name}.${root}`;
    return { primary, origins: Config.isProd() ? [primary] : [primary, 'http://localhost:8080'] };
  }

  private redirectUris(seed: SeedApplication): string[] {
    return this.appPublicOrigins(seed).origins.map(origin => `${origin}${OAUTH_CALLBACK_PATH}`);
  }

  /** The URI the old name-derived rule would have seeded before `publicHost` existed; only ever deleted as an exact match. */
  private staleSeedRedirectUri(seed: SeedApplication): string | null {
    if (!seed.publicHost || seed.publicHost === seed.name) return null;
    const root = new URL(Config.get('oauth.issuer')).hostname.split('.').slice(1).join('.');
    return `https://${seed.name}.${root}${OAUTH_CALLBACK_PATH}`;
  }

  private async createApplication(seed: SeedApplication, operator: EcosystemOperator, scopes: Map<string, string>): Promise<void> {
    const { primary, origins } = this.appPublicOrigins(seed);
    const application = await this.applicationService.createApplication({
      name: seed.name,
      subDomain: seed.publicHost ?? seed.name,
      displayName: seed.displayName,
      description: seed.description,
      homePageUrl: primary,
      ...(seed.logo ? { logoUrl: `${primary}/logo192.png` } : {}),
      ...(seed.visibility ? { visibility: seed.visibility } : {}),
      publicUrls: origins,
    });

    await this.ensureResourceScopes(application.id, seed, scopes);
    await this.createRoles(application.id, seed, operator);
    await this.createClient(application.id, seed.name, origins);
    this.logger.info(`Seeded ecosystem application '${seed.name}'`, { applicationId: application.id });
  }

  private async ensureResourceScopes(applicationId: number, seed: SeedApplication, scopes: Map<string, string>): Promise<void> {
    if (!seed.scopes?.length) return;
    const audience = applicationAudience(seed.name);
    const resource = await this.oauthClientService.ensureResource(applicationId, audience, seed.resourceName);
    for (const scope of seed.scopes) {
      const scopeId = await this.oauthClientService.createScope(resource.id, scope.name, scope.description, scope.isSensitive, scope.principalType);
      scopes.set(scopeKey(audience, scope.name), scopeId);
    }
  }

  private async createRoles(applicationId: number, seed: SeedApplication, operator: EcosystemOperator): Promise<void> {
    const permissions = new Map<string, string>();
    for (const permission of seed.permissions ?? []) {
      permissions.set(permission.name, await this.policyDecisionService.ensurePermission(applicationId, permission.name, permission.description));
    }

    for (const role of seed.roles ?? []) {
      const created = await this.applicationRoleService.addRole(seed.name, { roleName: role.name, description: role.description });
      for (const name of role.permissions) {
        const permissionId =
          permissions.get(name) ?? throwError(AppError.internal(`Role '${role.name}' requires permission '${name}', which application '${seed.name}' does not declare`));
        await this.policyDecisionService.grantPermissionToRole(created.id, permissionId);
      }
      if (role.grantToBootstrapAdmin) {
        await this.policyDecisionService.assignRole({ type: 'USER', id: operator.adminUserId.toString() }, created.id, operator.platformOrganisationId.toString());
      }
    }
  }

  /**
   * In a production deployment the client is bound to its workload subject at creation with no
   * `client_secret_basic` credential generated at all (§8.4) — workload identity is the credential
   * that is actually presented, and there is no legitimate reader for a generated one there.
   * Outside production (no projected service-account token to present) a fallback secret is still
   * generated for local wiring, disclosed once via `announceSecretOnce`, never logged.
   */
  private async createClient(applicationId: number, app: string, origins: string[]): Promise<void> {
    const isProductionDeployment = Config.isProductionDeployment();
    const subjects = [workloadSubject(app)];
    if (isProductionDeployment) {
      await this.oauthClientService.provisionApplicationIdentity({ applicationId, name: app, publicUrls: origins, isFirstParty: true, workloadSubjects: subjects });
      return;
    }

    const provisioned = await this.oauthClientService.provisionApplicationIdentity({ applicationId, name: app, publicUrls: origins, isFirstParty: true });
    if (provisioned.created && provisioned.secret) {
      this.logger.info(`Seeded ${app} client '${provisioned.clientId}' with a generated fallback secret`, { clientId: provisioned.clientId });
      announceSecretOnce(`Seeded ${app} client '${provisioned.clientId}' secret`, provisioned.secret, isProductionDeployment);
    }
    await this.oauthClientService.updateClient(provisioned.clientId, { workloadSubjects: subjects });
  }

  /** identity-server mints its own outbound service tokens locally (NotificationTokenService) rather than calling its own token endpoint, so this credential is never actually presented and is never worth disclosing. */
  private async createServiceClient(seed: SeedServiceClient): Promise<void> {
    const application = this.applicationService.getApplicationOrThrow(seed.application);
    const { clientId, secret } = await this.oauthClientService.register({
      id: seed.id,
      applicationId: application.id,
      name: seed.id,
      kind: 'SERVICE',
      isFirstParty: true,
      grantTypes: ['client_credentials'],
    });
    this.logger.info(`Seeded ${seed.label} client '${clientId}'`, { clientId, hasSecret: Boolean(secret) });
  }

  private async bindApplication(seed: SeedApplication, scopes: Map<string, string>): Promise<void> {
    await this.grantScopes(seed.name, seed.grants, scopes);

    const application = this.applicationService.getApplicationOrThrow(seed.name);
    for (const rule of seed.serviceAccess ?? []) {
      await this.serviceAccessService.create({
        applicationId: application.id,
        callerClientId: rule.callerClientId,
        method: rule.method,
        pathPattern: rule.pathPattern,
        createdBy: EcosystemSeedService.name,
      });
    }
  }

  private async grantScopes(clientId: string, grants: readonly SeedScopeGrant[] | undefined, scopes: Map<string, string>): Promise<void> {
    for (const grant of grants ?? []) {
      const scopeId =
        scopes.get(scopeKey(grant.resource, grant.scope)) ??
        throwError(AppError.internal(`Cannot grant '${grant.scope}' to '${clientId}': resource '${grant.resource}' does not expose it`));
      await this.oauthClientService.grantScope(clientId, scopeId);
    }
  }

  private async reconcileApplication(seed: SeedApplication, scopes: Map<string, string>): Promise<void> {
    const application = this.applicationService.getApplicationOrThrow(seed.name);
    await this.ensureResourceScopes(application.id, seed, scopes);
    await this.bindApplication(seed, scopes);
    await this.reconcileClient(seed);
  }

  /**
   * The corrected redirect URI is added unconditionally. The superseded one is removed only when it is
   * exactly what the old name-derived rule would have seeded — never an operator-added URI, which this
   * seed never wrote and therefore never recognises as stale.
   */
  private async reconcileClient(seed: SeedApplication): Promise<void> {
    const client = await this.oauthClientService.getClient(seed.name);
    if (!client) return;
    await this.oauthClientService.ensureRedirectUris(client.id, this.redirectUris(seed));

    const stale = this.staleSeedRedirectUri(seed);
    if (stale) await this.oauthClientService.removeRedirectUri(client.id, stale);

    const required = workloadSubject(seed.name);
    const current = client.workloadSubjects ?? [];
    if (current.includes(required)) return;
    await this.oauthClientService.updateClient(client.id, { workloadSubjects: [...current, required] });
  }
}
