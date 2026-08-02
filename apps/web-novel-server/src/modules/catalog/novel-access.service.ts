/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, eq, inArray } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AuthClient, type AuthPrincipal } from '@shadow-library/auth';
import { Config, Logger, LRUCache } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type Novel, type PrimaryDatabase, schema } from '@server/modules/datastore';

/**
 * Defining types
 */

/** The subset of a novel the decision needs; taking the whole row would tempt callers to pass a stale copy. */
export type AccessSubject = Pick<Novel, 'id' | 'visibility' | 'organisationId'>;

interface MembershipResponse {
  member: boolean;
}

/**
 * Declaring the constants
 *
 * The single answer to "may this caller read this novel". Every read path funnels through it, so
 * there is one place to get right and one place to audit — a second, subtly different predicate
 * somewhere else is how a leak of this shape happens.
 *
 * It is deny-by-default: an unrecognised tier and an unreachable identity service both answer no.
 * Availability is deliberately not preferred over correctness here — a novel the author marked
 * private staying unreadable during an outage is a far cheaper failure than the reverse, and the
 * public catalog (which is the overwhelming majority of traffic) never consults this at all.
 */

/** Identity service name; resolves via `SERVICE_URL_IDENTITY_SERVER` or in-cluster svc DNS. */
const IDENTITY_SERVICE = 'identity-server';
/** Identity's own API keeps its bare identifier rather than an `api://` resource. */
const IDENTITY_RESOURCE = 'shadow-identity';
const DIRECTORY_SCOPE = 'users:resolve';

const MEMBERSHIP_CACHE_CAPACITY = 4096;

@Injectable()
export class NovelAccessService {
  private readonly logger = Logger.getLogger(APP_NAME, NovelAccessService.name);
  private readonly db: PrimaryDatabase;
  private readonly membershipCache: LRUCache;

  constructor(
    databaseService: DatabaseService,
    private readonly authClient: AuthClient,
  ) {
    this.db = databaseService.getPostgresClient();
    this.membershipCache = new LRUCache(MEMBERSHIP_CACHE_CAPACITY, { ttl: Config.get('access.membership-ttl') * 1000 });
  }

  async canRead(novel: AccessSubject, principal: AuthPrincipal | null): Promise<boolean> {
    if (novel.visibility === 'PUBLIC') return true;
    if (!principal || principal.kind !== 'user') return false;
    if (novel.visibility === 'RESTRICTED') return this.hasGrant(novel.id, principal.sub);
    if (novel.visibility === 'ORGANISATION') return this.isOrganisationMember(novel.organisationId, principal);
    return false;
  }

  /**
   * The set-shaped counterpart of {@link canRead}, for the list paths — a shelf, a history page,
   * the shared-with-me view. Answering row by row would be one grant query and one membership
   * lookup per novel; this collapses them to one grant query for the whole restricted subset and
   * one membership answer per *distinct organisation*, which is what makes filtering a shelf on
   * every request affordable enough to do unconditionally.
   *
   * Filtering these lists is not cosmetic: a shelf row carries the novel's title and cover, so a
   * revoked share that stays in someone's library is still a leak of the thing that was revoked.
   */
  async readableIds(subjects: AccessSubject[], principal: AuthPrincipal | null): Promise<Set<bigint>> {
    const readable = new Set<bigint>();
    const restricted: bigint[] = [];
    const organisations = new Map<string, bigint[]>();

    for (const subject of subjects) {
      if (subject.visibility === 'PUBLIC') readable.add(subject.id);
      else if (!principal || principal.kind !== 'user') continue;
      else if (subject.visibility === 'RESTRICTED') restricted.push(subject.id);
      else if (subject.organisationId) organisations.set(subject.organisationId, [...(organisations.get(subject.organisationId) ?? []), subject.id]);
    }
    if (!principal || principal.kind !== 'user') return readable;

    if (restricted.length > 0) {
      const granted = await this.db
        .select({ novelId: schema.novelGrants.novelId })
        .from(schema.novelGrants)
        .where(and(inArray(schema.novelGrants.novelId, restricted), eq(schema.novelGrants.subjectId, principal.sub)));
      for (const grant of granted) readable.add(grant.novelId);
    }

    for (const [organisationId, novelIds] of organisations) {
      if (await this.isOrganisationMember(organisationId, principal)) for (const novelId of novelIds) readable.add(novelId);
    }

    return readable;
  }

  /** Denials are a security signal, not a 404 like any other — they are the trace an operator needs when a share goes wrong. */
  logDenial(slug: string, principal: AuthPrincipal | null, visibility: Novel['visibility']): void {
    this.logger.warn('novel read denied', { securityEvent: 'novel.access_denied', slug, visibility, sub: principal?.sub });
  }

  private async hasGrant(novelId: bigint, sub: string): Promise<boolean> {
    const [grant] = await this.db
      .select({ subjectId: schema.novelGrants.subjectId })
      .from(schema.novelGrants)
      .where(and(eq(schema.novelGrants.novelId, novelId), eq(schema.novelGrants.subjectId, sub)));
    return !!grant;
  }

  /**
   * `principal.org` is the organisation this reader reaches **web-novel** through, which is not
   * necessarily the one the author reached **novel-forge** through when they shared — identity
   * resolves the active organisation per application. So a match is a fast path worth taking, but
   * a mismatch proves nothing and has to be settled with identity, which is authoritative.
   *
   * The answer is cached briefly, which bounds how long a removed member keeps reading. Per-user
   * `RESTRICTED` grants have no such window — those are read straight from Postgres and revoke
   * immediately.
   */
  private async isOrganisationMember(organisationId: string | null, principal: AuthPrincipal): Promise<boolean> {
    if (!organisationId) return false;
    if (principal.org === organisationId) return true;

    const cacheKey = `${organisationId}:${principal.sub}`;
    const cached = this.membershipCache.get<boolean>(cacheKey);
    if (typeof cached === 'boolean') return cached;

    const member = await this.fetchMembership(organisationId, principal.sub);
    /** Only a definite answer is cached: pinning a transport blip for the whole TTL would outlast the outage that caused it. */
    if (member !== null) this.membershipCache.set(cacheKey, member);
    return member ?? false;
  }

  /** `null` means "could not determine" — distinct from a definite `false`, and the difference decides whether it is cached. */
  private async fetchMembership(organisationId: string, sub: string): Promise<boolean | null> {
    const path = `/api/v1/internal/organisations/${organisationId}/members/${sub}`;
    try {
      const response = await this.authClient.fetchService<MembershipResponse>(
        IDENTITY_SERVICE,
        path,
        { method: 'GET' },
        { resource: IDENTITY_RESOURCE, scopes: [DIRECTORY_SCOPE] },
      );
      if (response.statusCode >= 400) {
        this.logger.warn('membership lookup answered an error status', { organisationId, sub, statusCode: response.statusCode });
        return null;
      }
      return response.data?.member ?? false;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('membership lookup failed, denying', { organisationId, sub, message });
      return null;
    }
  }
}
