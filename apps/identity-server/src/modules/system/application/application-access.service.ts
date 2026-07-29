/**
 * Importing npm packages
 */
import { and, eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { PLATFORM_ORG_NAME } from '@server/modules/admin/admin.constants';
import { Application, DatabaseService, Organisation, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

interface QualifyingMembership {
  organisation: Organisation;
  /** The membership the user nominated as their default landing context, not an organisation-level flag. */
  isDefault: boolean;
}

/**
 * Declaring the constants
 *
 * The sign-in gate (T-901): resolves which applications a user may enter, folding the three access
 * layers — visibility (who could ever be granted), assignment (which visible apps an org hands out),
 * and the managed-account override (D-A2). A user reaches an app iff at least one of their ACTIVE
 * memberships grants it (union rule, D-A1). Per-organisation grant sets are cached in Redis behind a
 * global and a per-organisation version, mirroring the `authz_version` bump pattern in
 * PolicyDecisionService; membership and SCIM lookups stay fresh per call so a status change takes
 * effect immediately.
 */
const GLOBAL_VERSION_KEY = 'app_access_version:global';
const GRANT_CACHE_TTL_SECONDS = 300;

@Injectable()
export class ApplicationAccessService {
  private readonly logger = Logger.getLogger(APP_NAME, ApplicationAccessService.name);
  private readonly db: PrimaryDatabase;
  private readonly redis: Redis;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
    this.redis = databaseService.getRedisClient();
  }

  private orgVersionKey(organisationId: string): string {
    return `app_access_version:org:${organisationId}`;
  }

  private grantCacheKey(organisationId: string, globalVersion: number, orgVersion: number): string {
    return `app_access_grants:${organisationId}:g${globalVersion}:o${orgVersion}`;
  }

  /** Bumps a single organisation's grant version: assignment, release, or access-mode change under it. */
  async invalidateOrganisation(organisationId: string): Promise<void> {
    const version = await this.redis.incr(this.orgVersionKey(organisationId));
    this.logger.debug('bumped organisation app-access version, cached grant set invalidated', { organisationId, version });
  }

  /** Bumps the global grant version: a catalog-wide change (visibility edit, app activate/deactivate) every org sees. */
  async invalidateGlobal(): Promise<void> {
    const version = await this.redis.incr(GLOBAL_VERSION_KEY);
    this.logger.debug('bumped global app-access version, every cached grant set invalidated', { version });
  }

  /** The set of application ids the user may enter, unioned across their qualifying organisations (D-A1). */
  async resolveAccessibleApplicationIds(userId: bigint): Promise<Set<number>> {
    const organisations = await this.getQualifyingOrganisations(userId);
    const grants = new Set<number>();
    for (const organisation of organisations) {
      const orgGrants = await this.resolveOrganisationGrants(organisation);
      for (const applicationId of orgGrants) grants.add(applicationId);
    }
    this.logger.debug('resolved accessible applications', { userId: userId.toString(), organisationCount: organisations.length, applicationIds: [...grants] });
    return grants;
  }

  /**
   * Distinguishes the two denial classes the enforcement points (T-902) key on: *hidden* (the app is
   * inactive, or INTERNAL to a caller who is not qualifying platform staff) is answered as an unknown
   * application (D-A3); *denied* (visible but ungranted) gets access-denied semantics.
   */
  async assertUserAccess(userId: bigint, applicationId: number): Promise<void> {
    const application = await this.db.query.applications.findFirst({ where: eq(schema.applications.id, applicationId) });
    if (!application || !application.isActive) throw AppErrorCode.APP_006.create();

    const accessible = await this.resolveAccessibleApplicationIds(userId);
    if (accessible.has(applicationId)) return;

    /** An ungranted INTERNAL app must leak nothing: it reads as an unknown application, never as a refused one (D-A3). */
    if (application.visibility === 'INTERNAL') throw AppErrorCode.APP_006.create();
    this.logger.debug('application access denied', { userId: userId.toString(), applicationId, visibility: application.visibility });
    throw AppErrorCode.APP_007.create();
  }

  /** The organisations a user reaches one application through — the candidate set a session may act in, ordered by id so callers are stable. */
  async listGrantingOrganisations(userId: bigint, applicationId: number): Promise<Organisation[]> {
    const granting = await this.filterGranting(await this.getQualifyingMemberships(userId), applicationId);
    return granting.map(membership => membership.organisation).sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  }

  /**
   * The organisation an application session acts in. Capability is evaluated in exactly this
   * organisation, so it must be one the user genuinely reaches the application through — a role granted
   * in a team organisation is invisible to a session pinned to the personal workspace.
   *
   * Preference is deliberately conservative: the membership the user marked default, then the personal
   * workspace, then the lowest-numbered candidate. Every user's personal workspace grants every PUBLIC
   * application, so this resolves exactly as pinning to the personal workspace always did; it diverges
   * only where the personal workspace never granted the application to begin with.
   */
  async resolveActiveOrganisationId(userId: bigint, applicationId: number): Promise<bigint | null> {
    const granting = await this.filterGranting(await this.getQualifyingMemberships(userId), applicationId);
    if (granting.length === 0) return null;

    const preferred = granting.find(membership => membership.isDefault) ?? granting.find(membership => membership.organisation.type === 'PERSONAL');
    if (preferred) return preferred.organisation.id;
    return granting.reduce((lowest, membership) => (membership.organisation.id < lowest.organisation.id ? membership : lowest)).organisation.id;
  }

  private async filterGranting(memberships: QualifyingMembership[], applicationId: number): Promise<QualifyingMembership[]> {
    const granting: QualifyingMembership[] = [];
    for (const membership of memberships) {
      const grants = await this.resolveOrganisationGrants(membership.organisation);
      if (grants.has(applicationId)) granting.push(membership);
    }
    return granting;
  }

  /**
   * The organisations whose grants apply to the user: ACTIVE memberships of ACTIVE organisations,
   * narrowed to the managing organisation(s) when the account is SCIM-managed (D-A2). Membership and
   * SCIM rows are read fresh so a suspension or deprovisioning is honoured on the next request.
   */
  private async getQualifyingMemberships(userId: bigint): Promise<QualifyingMembership[]> {
    const memberships = await this.db.query.organisationMembers.findMany({ where: eq(schema.organisationMembers.userId, userId), with: { organisation: true } });
    const active = memberships.filter(membership => membership.organisation.status === 'ACTIVE' && this.isMemberActive(membership));

    const managed = await this.db.query.scimDirectory.findMany({ where: and(eq(schema.scimDirectory.userId, userId), eq(schema.scimDirectory.managed, true)) });
    const managedOrgIds = new Set(managed.map(entry => entry.organisationId));
    const qualifying = managed.length === 0 ? active : active.filter(membership => managedOrgIds.has(membership.organisation.id));
    return qualifying.map(membership => ({ organisation: membership.organisation, isDefault: membership.isDefault }));
  }

  private async getQualifyingOrganisations(userId: bigint): Promise<Organisation[]> {
    const memberships = await this.getQualifyingMemberships(userId);
    return memberships.map(membership => membership.organisation);
  }

  /** Mirrors OrganisationService: a SUSPENDED hold past its `statusUntil` has lapsed and reads ACTIVE; only ACTIVE grants anything. */
  private isMemberActive(membership: Organisation.Member): boolean {
    if (membership.status === 'ACTIVE') return true;
    return membership.status === 'SUSPENDED' && membership.statusUntil !== null && membership.statusUntil.getTime() <= Date.now();
  }

  private async resolveOrganisationGrants(organisation: Organisation): Promise<Set<number>> {
    const organisationId = organisation.id.toString();
    const [globalRaw, orgRaw] = await this.redis.mget(GLOBAL_VERSION_KEY, this.orgVersionKey(organisationId));
    const globalVersion = globalRaw ? Number(globalRaw) : 0;
    const orgVersion = orgRaw ? Number(orgRaw) : 0;
    const cacheKey = this.grantCacheKey(organisationId, globalVersion, orgVersion);

    const cached = await this.redis.get(cacheKey);
    if (cached) return new Set(JSON.parse(cached) as number[]);

    const grants = await this.computeOrganisationGrants(organisation);
    await this.redis.set(cacheKey, JSON.stringify([...grants]), 'EX', GRANT_CACHE_TTL_SECONDS);
    return grants;
  }

  /** The uncached grant set for one organisation, applying its visibility layer and assignment mode. */
  private async computeOrganisationGrants(organisation: Organisation): Promise<Set<number>> {
    const applications = await this.db.query.applications.findMany({ where: eq(schema.applications.isActive, true) });
    const publicIds = applications.filter(application => application.visibility === 'PUBLIC').map(application => application.id);

    /** The personal workspace grants exactly the generally-available apps (D-A1). */
    if (organisation.type === 'PERSONAL') return new Set(publicIds);

    const base = new Set(publicIds);
    if (organisation.type === 'TEAM' && organisation.name === PLATFORM_ORG_NAME) {
      for (const application of applications) if (application.visibility === 'INTERNAL') base.add(application.id);
    }

    const releasedIds = await this.grantedApplicationIds(organisation.id, 'PLATFORM_RELEASE');
    for (const application of applications) if (application.visibility === 'RESTRICTED' && releasedIds.has(application.id)) base.add(application.id);

    if (organisation.appAccessMode === 'ALL_APPS') return base;

    const assignedIds = await this.grantedApplicationIds(organisation.id, 'ORG_ASSIGNMENT');
    return new Set([...base].filter(applicationId => assignedIds.has(applicationId)));
  }

  private async grantedApplicationIds(organisationId: bigint, source: Application.OrganisationApplicationSource): Promise<Set<number>> {
    const rows = await this.db.query.organisationApplications.findMany({
      where: and(eq(schema.organisationApplications.organisationId, organisationId), eq(schema.organisationApplications.source, source)),
    });
    return new Set(rows.map(row => row.applicationId));
  }
}
