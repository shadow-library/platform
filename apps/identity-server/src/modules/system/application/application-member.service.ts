import { and, eq, inArray, ne } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { Application, DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

import { ApplicationAccessService } from './application-access.service';

export interface ApplicationMemberRow {
  userId: bigint;
  username: string | null;
  primaryEmail: string | null;
  firstUsedAt: Date;
  lastUsedAt: Date;
}

export interface UserApplicationRow {
  id: number;
  name: string;
  displayName: string | null;
  subDomain: string;
  isActive: boolean;
  firstUsedAt: Date;
  lastUsedAt: Date;
}

export interface AccessibleApplicationRow {
  id: number;
  name: string;
  displayName: string | null;
  subDomain: string;
  isActive: boolean;
  homePageUrl: string | null;
  logoUrl: string | null;
  firstUsedAt: Date | null;
  lastUsedAt: Date | null;
}

@Injectable()
export class ApplicationMemberService {
  private readonly logger = Logger.getLogger(APP_NAME, ApplicationMemberService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly accessService: ApplicationAccessService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async ensureMembership(applicationId: number, userId: bigint): Promise<void> {
    await this.db
      .insert(schema.applicationMembers)
      .values({ applicationId, userId })
      .onConflictDoUpdate({ target: [schema.applicationMembers.applicationId, schema.applicationMembers.userId], set: { lastUsedAt: new Date() } });
    this.logger.debug('Application membership ensured', { applicationId, userId });
  }

  async getMembership(applicationId: number, userId: bigint): Promise<Application.Member | null> {
    const membership = await this.db.query.applicationMembers.findFirst({
      where: and(eq(schema.applicationMembers.applicationId, applicationId), eq(schema.applicationMembers.userId, userId)),
    });
    return membership ?? null;
  }

  async removeMembership(applicationId: number, userId: bigint): Promise<boolean> {
    const removed = await this.db
      .delete(schema.applicationMembers)
      .where(and(eq(schema.applicationMembers.applicationId, applicationId), eq(schema.applicationMembers.userId, userId)))
      .returning({ userId: schema.applicationMembers.userId });
    return removed.length > 0;
  }

  async listMembers(applicationId: number): Promise<ApplicationMemberRow[]> {
    const rows = await this.db
      .select({
        userId: schema.applicationMembers.userId,
        username: schema.users.username,
        firstUsedAt: schema.applicationMembers.firstUsedAt,
        lastUsedAt: schema.applicationMembers.lastUsedAt,
      })
      .from(schema.applicationMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.applicationMembers.userId))
      .where(eq(schema.applicationMembers.applicationId, applicationId))
      .orderBy(schema.applicationMembers.firstUsedAt);

    const userIds = rows.map(row => row.userId);
    const emails = userIds.length
      ? await this.db
          .select()
          .from(schema.userEmails)
          .where(and(inArray(schema.userEmails.userId, userIds), eq(schema.userEmails.isPrimary, true)))
      : [];
    const primaryByUser = new Map(emails.map(email => [email.userId, email.emailId]));

    return rows.map(row => ({ ...row, primaryEmail: primaryByUser.get(row.userId) ?? null }));
  }

  async listApplicationsForUser(userId: bigint): Promise<UserApplicationRow[]> {
    return this.db
      .select({
        id: schema.applications.id,
        name: schema.applications.name,
        displayName: schema.applications.displayName,
        subDomain: schema.applications.subDomain,
        isActive: schema.applications.isActive,
        firstUsedAt: schema.applicationMembers.firstUsedAt,
        lastUsedAt: schema.applicationMembers.lastUsedAt,
      })
      .from(schema.applicationMembers)
      .innerJoin(schema.applications, eq(schema.applications.id, schema.applicationMembers.applicationId))
      .where(eq(schema.applicationMembers.userId, userId))
      .orderBy(schema.applicationMembers.lastUsedAt);
  }

  /**
   * The launcher surface: every application the user may currently enter (per the access resolver),
   * enriched with when they first and last used it. Keying on the accessible set — not on membership —
   * is deliberate: it surfaces apps the user can open but has never launched, and drops apps they once
   * used but can no longer reach (D-A4), so the launcher never advertises access the sign-in gate denies.
   *
   * Identity itself is excluded: the launcher answers "where else can I go", and the user is already
   * inside the app it would link back to. The exclusion lives here rather than in the access resolver
   * because that set also backs `assertUserAccess` — dropping identity there would deny its own sign-in.
   */
  async listAccessibleApplications(userId: bigint): Promise<AccessibleApplicationRow[]> {
    const accessibleIds = [...(await this.accessService.resolveAccessibleApplicationIds(userId))];
    if (accessibleIds.length === 0) return [];

    const applications = await this.db.query.applications.findMany({
      where: and(inArray(schema.applications.id, accessibleIds), ne(schema.applications.name, APP_NAME)),
    });
    const usageRows = await this.db
      .select({ applicationId: schema.applicationMembers.applicationId, firstUsedAt: schema.applicationMembers.firstUsedAt, lastUsedAt: schema.applicationMembers.lastUsedAt })
      .from(schema.applicationMembers)
      .where(and(eq(schema.applicationMembers.userId, userId), inArray(schema.applicationMembers.applicationId, accessibleIds)));
    const usageByApp = new Map(usageRows.map(row => [row.applicationId, row]));

    return applications
      .map(application => {
        const usage = usageByApp.get(application.id);
        return {
          id: application.id,
          name: application.name,
          displayName: application.displayName,
          subDomain: application.subDomain,
          isActive: application.isActive,
          homePageUrl: application.homePageUrl,
          logoUrl: application.logoUrl,
          firstUsedAt: usage?.firstUsedAt ?? null,
          lastUsedAt: usage?.lastUsedAt ?? null,
        };
      })
      .sort((a, b) => this.launcherRank(b) - this.launcherRank(a));
  }

  private launcherRank(row: AccessibleApplicationRow): number {
    return row.lastUsedAt?.getTime() ?? 0;
  }
}
