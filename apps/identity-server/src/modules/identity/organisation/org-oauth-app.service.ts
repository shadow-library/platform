import assert from 'node:assert';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { OAuthClientService, type RotatedSecret } from '@server/modules/auth/oauth/oauth-client.service';
import { AuditService } from '@server/modules/infrastructure/audit';
import { type Application, DatabaseService, type OAuthClient, type PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationAccessService, ApplicationService } from '@server/modules/system/application';

export interface OrgOAuthAppActor {
  actorId: string;
  ip?: string;
}

export type OrgOAuthAppKind = Exclude<OAuthClient.Kind, 'SERVICE'>;

export interface RegisterOrgOAuthApp {
  displayName: string;
  kind: OrgOAuthAppKind;
  redirectUris: string[];
  homePageUrl?: string;
  logoUrl?: string;
  offlineAccess?: boolean;
}

export interface UpdateOrgOAuthApp {
  displayName?: string;
  homePageUrl?: string;
  logoUrl?: string;
  redirectUris?: string[];
  isActive?: boolean;
}

export interface RegisteredOrgOAuthApp {
  applicationId: number;
  clientId: string;
  clientSecret?: string;
}

export interface OrgOAuthAppSummary {
  applicationId: number;
  clientId: string;
  displayName: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface OrgOAuthAppDetail extends OrgOAuthAppSummary {
  kind: OAuthClient.Kind;
  redirectUris: string[];
  scopes: string[];
  homePageUrl: string | null;
  logoUrl: string | null;
}

export interface OrgOAuthAppScope {
  scopeId: string;
  name: string;
  description: string | null;
  resourceIdentifier: string;
  applicationDisplayName: string | null;
}

interface OrgOAuthAppApplicationUpdate {
  displayName?: string;
  homePageUrl?: string;
  logoUrl?: string;
  isActive?: boolean;
}

const MAX_APPLICATIONS_PER_ORGANISATION = 10;
const MAX_REDIRECT_URIS = 10;
const MAX_APPLICATION_NAME_LENGTH = 63;
const MIN_SLUG_BUDGET = 8;
const NAME_COLLISION_ATTEMPTS = 50;
const FALLBACK_SLUG = 'app';
const PUBLIC_KINDS: OAuthClient.Kind[] = ['SPA_PUBLIC', 'NATIVE_PUBLIC'];
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const DENIED_URI_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'blob:', 'about:', 'vbscript:']);
const CUSTOM_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:$/;
const USER_PRINCIPAL_TYPES: ['USER', 'BOTH'] = ['USER', 'BOTH'];

@Injectable()
export class OrgOAuthAppService {
  private readonly logger = Logger.getLogger(APP_NAME, OrgOAuthAppService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly applicationService: ApplicationService,
    private readonly accessService: ApplicationAccessService,
    private readonly clientService: OAuthClientService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async listApps(organisationId: bigint): Promise<OrgOAuthAppSummary[]> {
    const applications = await this.db.query.applications.findMany({
      where: eq(schema.applications.ownerOrganisationId, organisationId),
      orderBy: schema.applications.id,
    });
    return applications.map(application => ({
      applicationId: application.id,
      clientId: this.clientIdOf(application),
      displayName: application.displayName,
      isActive: application.isActive,
      createdAt: application.createdAt,
    }));
  }

  async getApp(organisationId: bigint, applicationId: number): Promise<OrgOAuthAppDetail> {
    const application = await this.requireOwnedApplication(organisationId, applicationId);
    const client = await this.requireClient(application);
    const detail = await this.clientService.getClientDetail(client.id);
    if (!detail) throw AppErrorCode.APP_001.create();

    return {
      applicationId: application.id,
      clientId: detail.id,
      displayName: application.displayName,
      isActive: application.isActive,
      createdAt: application.createdAt,
      kind: detail.kind,
      redirectUris: detail.redirectUris,
      scopes: detail.scopes,
      homePageUrl: application.homePageUrl,
      logoUrl: application.logoUrl,
    };
  }

  async registerApp(actor: OrgOAuthAppActor, organisationId: bigint, input: RegisterOrgOAuthApp): Promise<RegisteredOrgOAuthApp> {
    await this.assertRegistrableOrganisation(organisationId);
    const owned = await this.db.$count(schema.applications, eq(schema.applications.ownerOrganisationId, organisationId));
    if (owned >= MAX_APPLICATIONS_PER_ORGANISATION) throw AppErrorCode.APP_011.create();

    const redirectUris = this.sanitiseRedirectUris(input.kind, input.redirectUris);
    this.assertValidWebUrls(input);
    const name = await this.deriveApplicationName(organisationId, input.displayName);

    const application = await this.applicationService.createApplication({
      name,
      subDomain: name,
      displayName: input.displayName,
      homePageUrl: input.homePageUrl,
      logoUrl: input.logoUrl,
      visibility: 'RESTRICTED',
      ownerOrganisationId: organisationId,
    });

    const client = await this.registerClient(application, input, redirectUris);
    await this.accessService.invalidateOrganisation(organisationId.toString());
    await this.record(actor, organisationId, 'org.oauth_app.registered', application.id, { clientId: client.clientId, kind: input.kind });
    this.logger.info('registered organisation oauth application', { organisationId: organisationId.toString(), applicationId: application.id, clientId: client.clientId });
    return { applicationId: application.id, clientId: client.clientId, clientSecret: client.secret };
  }

  async updateApp(actor: OrgOAuthAppActor, organisationId: bigint, applicationId: number, update: UpdateOrgOAuthApp): Promise<void> {
    const application = await this.requireOwnedApplication(organisationId, applicationId);
    const client = await this.requireClient(application);
    const redirectUris = update.redirectUris ? this.sanitiseRedirectUris(client.kind, update.redirectUris) : undefined;
    this.assertValidWebUrls(update);

    const applicationUpdate: OrgOAuthAppApplicationUpdate = {};
    if (update.displayName !== undefined) applicationUpdate.displayName = update.displayName;
    if (update.homePageUrl !== undefined) applicationUpdate.homePageUrl = update.homePageUrl;
    if (update.logoUrl !== undefined) applicationUpdate.logoUrl = update.logoUrl;
    if (update.isActive !== undefined) applicationUpdate.isActive = update.isActive;

    const fields = Object.keys(applicationUpdate);
    if (fields.length > 0) await this.applicationService.updateApplication(application.name, applicationUpdate);
    if (redirectUris) fields.push('redirectUris');

    if (update.displayName !== undefined || update.isActive !== undefined || redirectUris) {
      await this.clientService.updateClient(client.id, {
        ...(update.displayName !== undefined ? { name: update.displayName } : {}),
        ...(update.isActive !== undefined ? { isActive: update.isActive } : {}),
        ...(redirectUris ? { redirectUris } : {}),
      });
    }

    if (update.isActive !== undefined) await this.accessService.invalidateOrganisation(organisationId.toString());
    await this.record(actor, organisationId, 'org.oauth_app.updated', application.id, { fields });
    this.logger.info('updated organisation oauth application', { organisationId: organisationId.toString(), applicationId: application.id, fields });
  }

  async deleteApp(actor: OrgOAuthAppActor, organisationId: bigint, applicationId: number): Promise<void> {
    const application = await this.requireOwnedApplication(organisationId, applicationId);

    const clients = await this.clientService.listClients(application.id);
    for (const client of clients) await this.clientService.deleteClient(client.id);
    await this.applicationService.deleteApplication(application.name);

    await this.accessService.invalidateOrganisation(organisationId.toString());
    await this.record(actor, organisationId, 'org.oauth_app.deleted', application.id, { name: application.name });
    this.logger.info('deleted organisation oauth application', { organisationId: organisationId.toString(), applicationId: application.id });
  }

  async rotateSecret(actor: OrgOAuthAppActor, organisationId: bigint, applicationId: number): Promise<RotatedSecret> {
    const application = await this.requireOwnedApplication(organisationId, applicationId);
    const client = await this.requireClient(application);
    if (client.tokenEndpointAuthMethod === 'none') throw AppErrorCode.APP_013.create();

    const rotated = await this.clientService.rotateSecretWithOverlap(client.id);
    await this.record(actor, organisationId, 'org.oauth_app.secret_rotated', application.id);
    this.logger.info('rotated organisation oauth application secret', { organisationId: organisationId.toString(), applicationId: application.id });
    return rotated;
  }

  async listScopeCatalog(organisationId: bigint): Promise<OrgOAuthAppScope[]> {
    return this.selectableScopes(organisationId);
  }

  async grantScope(actor: OrgOAuthAppActor, organisationId: bigint, applicationId: number, scopeId: string): Promise<void> {
    const application = await this.requireOwnedApplication(organisationId, applicationId);
    const client = await this.requireClient(application);
    const [scope] = await this.selectableScopes(organisationId, scopeId);
    if (!scope) throw AppErrorCode.APP_010.create();

    await this.clientService.grantScope(client.id, scopeId);
    await this.record(actor, organisationId, 'org.oauth_app.scope_granted', application.id, { scopeId, scope: scope.name });
    this.logger.info('granted scope to organisation oauth application', { organisationId: organisationId.toString(), applicationId: application.id, scope: scope.name });
  }

  async revokeScope(actor: OrgOAuthAppActor, organisationId: bigint, applicationId: number, scopeId: string): Promise<void> {
    const application = await this.requireOwnedApplication(organisationId, applicationId);
    const client = await this.requireClient(application);

    await this.clientService.revokeScope(client.id, scopeId);
    await this.record(actor, organisationId, 'org.oauth_app.scope_revoked', application.id, { scopeId });
    this.logger.info('revoked scope from organisation oauth application', { organisationId: organisationId.toString(), applicationId: application.id, scopeId });
  }

  private clientIdOf(application: Application): string {
    return application.name;
  }

  private async requireOwnedApplication(organisationId: bigint, applicationId: number): Promise<Application> {
    const application = await this.db.query.applications.findFirst({ where: eq(schema.applications.id, applicationId) });
    if (!application || application.ownerOrganisationId !== organisationId) throw AppErrorCode.APP_001.create();
    return application;
  }

  private async requireClient(application: Application): Promise<OAuthClient> {
    const client = await this.clientService.getClient(this.clientIdOf(application));
    if (!client) throw AppErrorCode.APP_001.create();
    return client;
  }

  private async assertRegistrableOrganisation(organisationId: bigint): Promise<void> {
    const organisation = await this.db.query.organisations.findFirst({ where: eq(schema.organisations.id, organisationId) });
    if (!organisation || organisation.status !== 'ACTIVE') throw AppErrorCode.ORG_002.create();
    if (organisation.type !== 'TEAM') throw AppErrorCode.ORG_003.create();
  }

  private registerClient(application: Application, input: RegisterOrgOAuthApp, redirectUris: string[]): Promise<{ clientId: string; secret?: string }> {
    const grantTypes = input.offlineAccess ? ['authorization_code', 'refresh_token'] : ['authorization_code'];
    return this.clientService
      .register({
        id: this.clientIdOf(application),
        applicationId: application.id,
        name: input.displayName,
        kind: input.kind,
        isFirstParty: false,
        organisationId: application.ownerOrganisationId,
        redirectUris,
        grantTypes,
      })
      .catch(async error => {
        await this.rollbackApplication(application);
        throw error;
      });
  }

  private async rollbackApplication(application: Application): Promise<void> {
    try {
      await this.clientService.deleteClient(this.clientIdOf(application));
      await this.applicationService.deleteApplication(application.name);
    } catch (error) {
      this.logger.error('failed to roll back a partially registered organisation oauth application', { applicationId: application.id, name: application.name, error });
    }
  }

  private async deriveApplicationName(organisationId: bigint, displayName: string): Promise<string> {
    const prefix = `org-${organisationId}-`;
    const budget = MAX_APPLICATION_NAME_LENGTH - prefix.length;
    assert(budget >= MIN_SLUG_BUDGET, `Organisation id ${organisationId} leaves no room for an application name`);

    const base = this.slugify(displayName);
    for (let attempt = 0; attempt < NAME_COLLISION_ATTEMPTS; attempt++) {
      const discriminator = attempt === 0 ? '' : `-${attempt + 1}`;
      const name = `${prefix}${this.truncate(base, budget - discriminator.length)}${discriminator}`;
      const taken = await this.db.query.applications.findFirst({ where: eq(schema.applications.name, name), columns: { id: true } });
      if (!taken) return name;
    }
    throw AppErrorCode.APP_002.create();
  }

  private slugify(displayName: string): string {
    const slug = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug.length > 0 ? slug : FALLBACK_SLUG;
  }

  private truncate(slug: string, limit: number): string {
    const truncated = slug.slice(0, limit).replace(/-+$/, '');
    return truncated.length > 0 ? truncated : FALLBACK_SLUG;
  }

  private sanitiseRedirectUris(kind: OAuthClient.Kind, uris: string[]): string[] {
    const unique = [...new Set(uris.map(uri => uri.trim()))];
    if (unique.length === 0 || unique.length > MAX_REDIRECT_URIS) throw AppErrorCode.APP_012.create();
    for (const uri of unique) this.assertValidRedirectUri(kind, uri);
    return unique;
  }

  private parseUri(value: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw AppErrorCode.APP_012.create();
    }
    if (parsed.username || parsed.password || DENIED_URI_SCHEMES.has(parsed.protocol)) throw AppErrorCode.APP_012.create();
    return parsed;
  }

  private assertValidWebUrls(input: { homePageUrl?: string; logoUrl?: string }): void {
    for (const value of [input.homePageUrl, input.logoUrl]) {
      if (value === undefined) continue;
      if (this.parseUri(value).protocol !== 'https:') throw AppErrorCode.APP_012.create();
    }
  }

  private assertValidRedirectUri(kind: OAuthClient.Kind, uri: string): void {
    if (uri.includes('*')) throw AppErrorCode.APP_012.create();

    const parsed = this.parseUri(uri);
    if (parsed.hash) throw AppErrorCode.APP_012.create();
    if (parsed.protocol === 'https:') return;

    if (parsed.protocol === 'http:') {
      if (!PUBLIC_KINDS.includes(kind) || !LOOPBACK_HOSTS.has(parsed.hostname)) throw AppErrorCode.APP_012.create();
      return;
    }

    if (kind !== 'NATIVE_PUBLIC' || !CUSTOM_SCHEME_PATTERN.test(parsed.protocol)) throw AppErrorCode.APP_012.create();
    if (!parsed.hostname && !parsed.pathname) throw AppErrorCode.APP_012.create();
  }

  private async selectableScopes(organisationId: bigint, scopeId?: string): Promise<OrgOAuthAppScope[]> {
    const reachable = await this.accessService.listOrganisationApplicationIds(organisationId);
    if (reachable.size === 0) return [];

    const conditions = [
      eq(schema.scopes.isSensitive, false),
      inArray(schema.scopes.principalType, USER_PRINCIPAL_TYPES),
      eq(schema.apiResources.isActive, true),
      isNull(schema.applications.ownerOrganisationId),
      inArray(schema.applications.id, [...reachable]),
    ];
    if (scopeId) conditions.push(eq(schema.scopes.id, scopeId));

    return this.db
      .select({
        scopeId: schema.scopes.id,
        name: schema.scopes.name,
        description: schema.scopes.description,
        resourceIdentifier: schema.apiResources.identifier,
        applicationDisplayName: schema.applications.displayName,
      })
      .from(schema.scopes)
      .innerJoin(schema.apiResources, eq(schema.apiResources.id, schema.scopes.apiResourceId))
      .innerJoin(schema.applications, eq(schema.applications.id, schema.apiResources.applicationId))
      .where(and(...conditions))
      .orderBy(schema.apiResources.identifier, schema.scopes.name);
  }

  private record(actor: OrgOAuthAppActor, organisationId: bigint, action: string, applicationId: number, detail?: Record<string, unknown>): Promise<unknown> {
    return this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.actorId,
      organisationId: organisationId.toString(),
      targetType: 'application',
      targetId: applicationId.toString(),
      ipAddress: actor.ip ?? null,
      detail: detail ?? null,
    });
  }
}
