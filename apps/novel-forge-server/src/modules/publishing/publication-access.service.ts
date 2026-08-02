/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { Logger, throwError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Publishing, schema } from '@server/database';
import { type PublicationAccessBody, type PublicationAccessResponse } from './publishing.dto';
import { PublishingService } from './publishing.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The forge owns who may read a published novel; the reader holds a projection of that decision and
 * never writes it. Everything here is therefore about producing a record that converges: the reader
 * can be wiped and re-pushed from these rows alone.
 *
 * Addresses are resolved to identity subjects **here**, at share time, rather than at read time in
 * the reader. That keeps every address on this side of the boundary, and it means the read path —
 * which runs on every chapter fetch — never needs to ask identity anything.
 */

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

  /**
   * Replaces the whole access record. `accessRevision` is bumped only when something actually
   * changed, so a UI that saves an unedited panel does not make the reader re-apply an identical
   * record — the same "no-op if nothing moved" rule the metadata publish follows.
   *
   * A re-resolution runs on every save, which is also how a `pending` grant becomes `resolved` once
   * its owner finally signs up: the author does not have to remember to come back and re-add them.
   */
  async setAccess(projectId: bigint, body: PublicationAccessBody, organisationId: string | undefined): Promise<PublicationAccessResponse> {
    const publication = await this.publishingService.getPublication(projectId);
    if (body.visibility === 'ORGANISATION' && !organisationId) throw AppErrorCode.PUB_006.create();

    const emails = [...new Set((body.grants ?? []).map(grant => grant.email.trim().toLowerCase()))].filter(Boolean);
    /** Only `RESTRICTED` carries a share list; keeping stale rows on another tier would silently re-grant on a switch back. */
    const wanted = body.visibility === 'RESTRICTED' ? emails : [];
    const resolved = await this.resolveEmails(wanted);
    const nextOrganisationId = body.visibility === 'ORGANISATION' ? (organisationId as string) : null;

    const existing = await this.loadGrants(publication.id);
    const changed = this.hasChanged(publication, existing, body.visibility, nextOrganisationId, wanted, resolved);

    const grants = await this.db.transaction(async tx => {
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
          accessRevision: changed ? publication.accessRevision + 1 : publication.accessRevision,
          updatedAt: new Date(),
        })
        .where(eq(schema.publications.id, publication.id));
      return tx.select().from(schema.publicationGrants).where(eq(schema.publicationGrants.publicationId, publication.id));
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

  /**
   * The addresses identity could name, keyed by the caller's own lowercased spelling. The SDK owns
   * the batching and the `users:resolve` grant, so the forge no longer keeps a directory client of
   * its own — an address that resolves to nothing is simply missing, which the caller records as a
   * pending grant rather than an error.
   */
  private async resolveEmails(emails: string[]): Promise<Map<string, string>> {
    if (emails.length === 0) return new Map();
    const resolved = await this.authClient.resolveUsersByEmail(emails).catch(error => throwError(AppErrorCode.PUB_005.create({ reason: (error as Error).message })));
    return new Map(resolved.map(user => [user.email.toLowerCase(), user.userId]));
  }

  private loadGrants(publicationId: bigint): Promise<Publishing.Grant[]> {
    return this.db.select().from(schema.publicationGrants).where(eq(schema.publicationGrants.publicationId, publicationId)).orderBy(schema.publicationGrants.email);
  }

  /**
   * Compares intent, not rows: a re-resolution that turns a pending grant into a resolved one is a
   * change the reader must see, whereas re-saving the same list with the same outcome is not.
   */
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
