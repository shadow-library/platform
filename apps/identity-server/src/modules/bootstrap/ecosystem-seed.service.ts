/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { applicationAudience, OAuthClientService } from '@server/modules/auth/oauth';
import { PolicyDecisionService, ServiceAccessService } from '@server/modules/authz';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { ECOSYSTEM_SEED, type SeedApplication, type SeedScopeGrant, type SeedServiceClient } from './ecosystem-seed.constants';

/**
 * Defining types
 */

/**
 * The bootstrap administrator and the organisation their platform roles are scoped to. Capability
 * has to be granted somewhere concrete: a role assignment is always a (principal, role, organisation)
 * triple, and an INTERNAL application is only ever reached through the platform organisation.
 */
export interface EcosystemOperator {
  adminUserId: bigint;
  platformOrganisationId: bigint;
}

/**
 * Declaring the constants
 */

/**
 * In-cluster each application runs in its own namespace as the `<app>-server` service account and
 * authenticates with a projected SA-token assertion rather than a secret (D-16). The subject is the
 * canonical k8s form and is registered as an exact workload binding on the application's client.
 */
const workloadSubject = (app: string): string => `system:serviceaccount:${app}:${app}-server`;

/** Scopes are unique per (resource, name); the pair is the only stable way to address one. */
const scopeKey = (resource: string, scope: string): string => `${resource}::${scope}`;

/**
 * Provisions the first-party ecosystem declared in {@link ECOSYSTEM_SEED} — each application's
 * record, its single OAuth client (id == app name), its `api://<app>` API resource and scopes, its
 * RBAC catalogue, its in-cluster workload binding, its cross-application scope grants and the
 * service-access rules guarding its routes.
 *
 * **Create-only, per application.** An application already present in the database is skipped whole:
 * its scopes, roles, client, grants and access rules are left exactly as they are, so editing an
 * entry here never reaches a deployment that has already been seeded — only a brand-new entry does.
 * Changing an existing application is a platform-admin operation through the console, not a redeploy.
 *
 * Runs after {@link BootstrapService} has provisioned the platform application and its scopes, which
 * the seeded grants resolve against.
 */
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
    const applications = ECOSYSTEM_SEED.applications.filter(application => !this.applicationService.getApplication(application.name));
    const serviceClients: SeedServiceClient[] = [];
    for (const client of ECOSYSTEM_SEED.serviceClients) {
      if (!(await this.oauthClientService.getClient(client.id))) serviceClients.push(client);
    }

    /** Nothing missing means nothing to do — a seeded deployment must not even read the catalogue. */
    if (applications.length === 0 && serviceClients.length === 0) return;

    const scopes = await this.loadScopeCatalogue();
    for (const application of applications) await this.createApplication(application, operator, scopes);
    for (const client of serviceClients) await this.createServiceClient(client);

    /**
     * Grants and access rules reference applications other than their own — novel-forge onto
     * web-novel, identity's outbound client onto pulse — so they run only once every record above
     * exists, regardless of the order entries are declared in.
     */
    for (const application of applications) await this.bindApplication(application, scopes);
    for (const client of serviceClients) await this.grantScopes(client.id, client.grants, scopes);
  }

  /** Every scope already registered, keyed by (resource, name), so a grant resolves without creating anything. */
  private async loadScopeCatalogue(): Promise<Map<string, string>> {
    const resources = await this.oauthClientService.listResources();
    const catalogue = new Map<string, string>();
    for (const resource of resources) {
      for (const scope of resource.scopes) catalogue.set(scopeKey(resource.identifier, scope.name), scope.id);
    }
    return catalogue;
  }

  /**
   * Public origins for an application's relying party, derived from the issuer rather than configured
   * so a fresh deployment onto any domain provisions correct redirect URIs. The root domain is the
   * issuer host with its first label dropped (`identity.shadow-apps.test` → `shadow-apps.test`); the
   * app is served at `https://<app>.<root>`. `http://localhost:8080` is added outside production only,
   * as a local-development convenience.
   */
  private appPublicOrigins(app: string): { primary: string; origins: string[] } {
    const root = new URL(Config.get('oauth.issuer')).hostname.split('.').slice(1).join('.');
    const primary = `https://${app}.${root}`;
    return { primary, origins: Config.isProd() ? [primary] : [primary, 'http://localhost:8080'] };
  }

  /** Creates the application record, its API resource and scopes, its RBAC catalogue and its client. */
  private async createApplication(seed: SeedApplication, operator: EcosystemOperator, scopes: Map<string, string>): Promise<void> {
    const { primary, origins } = this.appPublicOrigins(seed.name);
    const application = await this.applicationService.createApplication({
      name: seed.name,
      subDomain: seed.subDomain ?? seed.name,
      displayName: seed.displayName,
      description: seed.description,
      homePageUrl: primary,
      ...(seed.logo ? { logoUrl: `${primary}/logo192.png` } : {}),
      ...(seed.visibility ? { visibility: seed.visibility } : {}),
      publicUrls: origins,
    });

    const audience = applicationAudience(seed.name);
    const resource = await this.oauthClientService.ensureResource(application.id, audience, seed.resourceName);
    for (const scope of seed.scopes ?? []) {
      const scopeId = await this.oauthClientService.createScope(resource.id, scope.name, scope.description, scope.isSensitive, scope.principalType);
      scopes.set(scopeKey(audience, scope.name), scopeId);
    }

    await this.createRoles(application.id, seed, operator);
    await this.createClient(application.id, seed.name, origins);
    this.logger.info(`Seeded ecosystem application '${seed.name}'`, { applicationId: application.id });
  }

  /** Seeds the permission taxonomy, then the roles that confer it. */
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
   * One client for the whole application (D-21): the same credential runs the browser code flow and
   * the server-to-server calls, because they are one deployment and therefore one identity. The client
   * is bound to the application's in-cluster SA subject, so a pod authenticates with a projected token
   * and no secret ever leaves the cluster (D-16). The minted `client_secret` remains the credential
   * for any out-of-cluster caller, and is logged once because it is never readable again.
   */
  private async createClient(applicationId: number, app: string, origins: string[]): Promise<void> {
    const provisioned = await this.oauthClientService.provisionApplicationIdentity({ applicationId, name: app, publicUrls: origins, isFirstParty: true });
    if (provisioned.created && provisioned.secret) {
      this.logger.warn(`Seeded ${app} client '${provisioned.clientId}' — store this secret now, it is shown only once: ${provisioned.secret}`, { clientId: provisioned.clientId });
    }
    await this.oauthClientService.updateClient(provisioned.clientId, { workloadSubjects: [workloadSubject(app)] });
  }

  /** Registers a machine-to-machine client on an application some other bootstrap step owns. */
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
    if (secret) this.logger.warn(`Seeded ${seed.label} client '${clientId}' — store this secret now, it is shown only once: ${secret}`, { clientId });
    else this.logger.info(`Seeded ${seed.label} client '${clientId}'`, { clientId });
  }

  /** Applies the cross-application grants and the route rules guarding the application's own surface. */
  private async bindApplication(seed: SeedApplication, scopes: Map<string, string>): Promise<void> {
    /** The client id equals the application name (D-21), so the application's grants are its client's. */
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

  /**
   * Grants scopes the catalogue already holds. A missing scope is a declaration error rather than
   * something to create: inventing it here would register it with default visibility and principal
   * type, quietly widening a service-only capability into one a user token could carry.
   */
  private async grantScopes(clientId: string, grants: readonly SeedScopeGrant[] | undefined, scopes: Map<string, string>): Promise<void> {
    for (const grant of grants ?? []) {
      const scopeId =
        scopes.get(scopeKey(grant.resource, grant.scope)) ??
        throwError(AppError.internal(`Cannot grant '${grant.scope}' to '${clientId}': resource '${grant.resource}' does not expose it`));
      await this.oauthClientService.grantScope(clientId, scopeId);
    }
  }
}
