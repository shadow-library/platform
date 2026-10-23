import { eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { Logger, throwError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type PrimaryDatabase, type Publishing, schema } from '@server/database';
import { type PublicationAccessBody, type PublicationAccessResponse } from './publishing.dto';
import { PublishingService } from './publishing.service';

/** The forge owns who may read; addresses resolve to identity subjects at share time so reads never ask identity. */

@Injectable()
export class PublicationAccessService {
  private readonly logger = Logger.getLogger(APP_NAME, PublicationAccessService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly publishingService: PublishingService,
    private readonly authClient: AuthClient,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async getAccess(projectId: bigint): Promise<PublicationAccessResponse> {
    const publication = await this.publishingService.getPublication(projectId);
    return this.present(publication, await this.loadGrants(publication.id));
  }

  /** Replaces the record; `accessRevision` bumps only on a real change, compared under the row lock. Each save re-resolves, so `pending` grants resolve once the owner signs up. */
  async setAccess(projectId: bigint, body: PublicationAccessBody, organisationId: string | undefined): Promise<PublicationAccessResponse> {
    const publication = await this.publishingService.getPublication(projectId);
    if (body.visibility === 'ORGANISATION' && !organisationId) throw AppErrorCode.PUB_006.create();

    const emails = [...new Set((body.grants ?? []).map(grant => grant.email.trim().toLowerCase()))].filter(Boolean);
    /** Only `RESTRICTED` carries a share list; keeping stale rows on another tier would silently re-grant on a switch back. */
    const wanted = body.visibility === 'RESTRICTED' ? emails : [];
    const resolved = await this.resolveEmails(wanted);
    const nextOrganisationId = body.visibility === 'ORGANISATION' ? (organisationId as string) : null;

    const { grants, changed } = await this.db.transaction(async tx => {
      const [locked] = await tx.select().from(schema.publications).where(eq(schema.publications.id, publication.id)).for('update');
      if (!locked) throw AppErrorCode.PUB_001.create();
      const existing = await this.loadGrants(publication.id, tx);
      const changed = this.hasChanged(locked, existing, body.visibility, nextOrganisationId, wanted, resolved);
      await tx.delete(schema.publicationGrants).where(eq(schema.publicationGrants.publicationId, publication.id));
      if (wanted.length > 0) {
        await tx.insert(schema.publicationGrants).values(
          wanted.map(email => ({
            publicationId: publication.id,
            email,
            subjectId: resolved.get(email) ?? null,
            state: (resolved.has(email) ? 'resolved' : 'pending') as Publishing.GrantState,
          })),
        );
      }
      await tx
        .update(schema.publications)
        .set({
          visibility: body.visibility as Publishing.Visibility,
          organisationId: nextOrganisationId,
          ...(changed ? { accessRevision: sql`${schema.publications.accessRevision} + 1` } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.publications.id, publication.id));
      return { grants: await this.loadGrants(publication.id, tx), changed };
    });

    const pending = grants.filter(grant => grant.state === 'pending').length;
    this.logger.info('publication access updated', { projectId, visibility: body.visibility, grants: grants.length, pending, changed });
    const updated = await this.publishingService.getPublication(projectId);
    return this.present(updated, grants);
  }

  /** The push payload: the tier, its organisation, and only the grants that actually name someone. */
  async getPushPayload(publicationId: bigint): Promise<string[]> {
    const grants = await this.loadGrants(publicationId);
    return grants.filter(grant => grant.state === 'resolved' && grant.subjectId).map(grant => grant.subjectId as string);
  }

  /** Addresses identity could name, keyed by the caller's lowercased spelling; an unresolved address is missing and becomes a pending grant, not an error. */
  private async resolveEmails(emails: string[]): Promise<Map<string, string>> {
    if (emails.length === 0) return new Map();
    const resolved = await this.authClient.resolveUsersByEmail(emails).catch(error => throwError(AppErrorCode.PUB_005.create({ reason: (error as Error).message })));
    return new Map(resolved.map(user => [user.email.toLowerCase(), user.userId]));
  }

  private loadGrants(publicationId: bigint, db: DbExecutor = this.db): Promise<Publishing.Grant[]> {
    return db.select().from(schema.publicationGrants).where(eq(schema.publicationGrants.publicationId, publicationId)).orderBy(schema.publicationGrants.email);
  }

  /** Compares intent, not rows: a pending grant turning resolved is a change the reader must see. */
  private hasChanged(
    publication: Publishing.Publication,
    existing: Publishing.Grant[],
    visibility: string,
    organisationId: string | null,
    wanted: string[],
    resolved: Map<string, string>,
  ): boolean {
    if (publication.visibility !== visibility) return true;
    if (publication.organisationId !== organisationId) return true;
    if (existing.length !== wanted.length) return true;
    const held = new Map(existing.map(grant => [grant.email, grant.subjectId]));
    return wanted.some(email => !held.has(email) || held.get(email) !== (resolved.get(email) ?? null));
  }

  private present(publication: Publishing.Publication, grants: Publishing.Grant[]): PublicationAccessResponse {
    return {
      visibility: publication.visibility,
      organisationId: publication.organisationId,
      accessRevision: publication.accessRevision,
      grants: grants.map(grant => ({ email: grant.email, subjectId: grant.subjectId, state: grant.state })),
    };
  }
}
