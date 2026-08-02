/**
 * Importing npm packages
 */
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME, REGEX } from '@server/constants';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, type PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export interface ResolvedUser {
  email: string;
  userId: string;
}

/**
 * Declaring the constants
 *
 * The directory seam other first-party services reach through when they must name a person the
 * caller only knows by email — sharing a novel with `someone@example.com`, and nothing broader.
 *
 * Two rules make it safe to expose at all. Only an **exact, verified** address resolves, because a
 * verified address is globally unique here (`user_emails_verified_email_unique`), so a hit names
 * exactly one account and there is no substring surface to walk. And an address that resolves to
 * nothing is simply **absent** from the answer — never echoed with a reason — so a caller learns
 * "no account you may name" without learning whether the address is unknown, unverified or closed
 * (D-A3). It remains an enumeration oracle by construction, which is why every call is audited and
 * the route is service-only.
 */

/** A closed account must never resolve: it names a person who is gone, and a grant against it would outlive them. */
const RESOLVABLE_STATUSES = ['ACTIVE', 'INACTIVE', 'DISABLED', 'BLOCKED', 'SUSPENDED'] as const;

@Injectable()
export class DirectoryService {
  private readonly logger = Logger.getLogger(APP_NAME, DirectoryService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * Resolves each address to the account that holds it verified. The caller's original spelling is
   * echoed back rather than the stored one, so a case-insensitive match still lines up with the list
   * the caller sent and it never has to re-normalise to correlate the answer.
   */
  async resolveByEmail(emails: string[], callerClientId: string): Promise<ResolvedUser[]> {
    const bySpelling = new Map<string, string>();
    for (const email of emails) if (REGEX.EMAIL.test(email)) bySpelling.set(email.toLowerCase(), email);
    const normalised = [...bySpelling.keys()];

    /** An all-unshapely batch still gets audited below — the lookup is skipped only because `inArray` cannot take an empty set. */
    const rows =
      normalised.length === 0
        ? []
        : await this.db
            .select({ email: schema.userEmails.emailId, userId: schema.userEmails.userId })
            .from(schema.userEmails)
            .innerJoin(schema.users, eq(schema.users.id, schema.userEmails.userId))
            .where(
              and(inArray(sql`lower(${schema.userEmails.emailId})`, normalised), isNotNull(schema.userEmails.verifiedAt), inArray(schema.users.status, [...RESOLVABLE_STATUSES])),
            );

    const resolved = rows.map(row => ({ email: bySpelling.get(row.email.toLowerCase()) ?? row.email, userId: row.userId.toString() }));
    await this.auditService.record({
      action: 'directory.users.resolve',
      outcome: 'SUCCESS',
      actorType: 'SERVICE_ACCOUNT',
      actorId: callerClientId,
      /** Counts only — the addresses themselves are the caller's business and would turn the audit trail into a contact list. */
      detail: { requested: normalised.length, resolved: resolved.length },
    });

    this.logger.debug('directory resolve handled', { callerClientId, requested: normalised.length, resolved: resolved.length });
    return resolved;
  }

  /**
   * Whether the user is an active member of an active organisation. Both statuses matter: a
   * suspended membership and a suspended organisation must each read as "not a member", because
   * the answer is consumed as an authorization signal by the calling service.
   */
  async isOrganisationMember(organisationId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ organisationId: schema.organisationMembers.organisationId })
      .from(schema.organisationMembers)
      .innerJoin(schema.organisations, eq(schema.organisations.id, schema.organisationMembers.organisationId))
      .where(
        and(
          eq(schema.organisationMembers.organisationId, BigInt(organisationId)),
          eq(schema.organisationMembers.userId, BigInt(userId)),
          eq(schema.organisationMembers.status, 'ACTIVE'),
          eq(schema.organisations.status, 'ACTIVE'),
        ),
      );
    return !!row;
  }
}
