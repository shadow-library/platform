import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { type Envelope } from '@shadow-library/common/crypto';
import { DatabaseService } from '@shadow-library/modules';

import { type Credential, type DatabaseTransaction, type PrimaryDatabase, schema } from '@server/database';

import { CATALOG_WRITE_LOCK } from '@modules/catalog/catalog-version.repository';

export interface CredentialStatus {
  id: string;
  version: number;
  revokedAt: Date | null;
}

export interface KidCount {
  /** `null` for a row whose secret is not an envelope */
  kid: string | null;
  credentials: number;
}

export interface NewCredential {
  id: string;
  name: string;
  secret: Envelope;
  allowedOrigin: string;
  hint: string;
}

export interface RewrapCandidate {
  id: string;
  version: number;
  kid: string | null;
  secret: unknown;
}

export interface RewrapResult {
  rewrapped: number;
  /** Rows changed by a rotation between the read and the compare-and-set */
  skipped: number;
  failed: string[];
}

export type RevokeOutcome = { status: 'revoked' | 'already_revoked'; credential: Credential.Row } | { status: 'in_use'; referencedBy: string[] } | { status: 'not_found' };

export type ReferenceFinder = (document: unknown) => string[];

type Executor = PrimaryDatabase | DatabaseTransaction;

const credentials = schema.providerCredentials;
const events = schema.credentialEvents;
const versions = schema.catalogVersions;
const KID = sql<string | null>`${credentials.secret}->>'kid'`;

/** Transaction-scoped, so a replica that dies mid-rewrap never leaves the lock held */
const REWRAP_LOCK = sql`select pg_try_advisory_xact_lock(hashtext('synapse:credentials:rewrap')) as locked`;

@Injectable()
export class CredentialRepository {
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  list(): Promise<Credential.Row[]> {
    return this.databaseService.run(() => this.db.select().from(credentials).orderBy(asc(credentials.name)));
  }

  findById(id: string): Promise<Credential.Row | undefined> {
    return this.databaseService.run(async () => {
      const [row] = await this.db.select().from(credentials).where(eq(credentials.id, id)).limit(1);
      return row;
    });
  }

  findByName(name: string): Promise<Credential.Row | undefined> {
    return this.databaseService.run(async () => {
      const [row] = await this.db.select().from(credentials).where(eq(credentials.name, name)).limit(1);
      return row;
    });
  }

  statuses(): Promise<CredentialStatus[]> {
    return this.databaseService.run(() => this.db.select({ id: credentials.id, version: credentials.version, revokedAt: credentials.revokedAt }).from(credentials));
  }

  kidCounts(): Promise<KidCount[]> {
    return this.databaseService.run(() =>
      this.db
        .select({ kid: KID, credentials: sql<number>`count(*)::int` })
        .from(credentials)
        .groupBy(KID)
        .orderBy(asc(KID)),
    );
  }

  create(values: NewCredential, actor: string): Promise<Credential.Row> {
    return this.databaseService.run(() =>
      this.db.transaction(async tx => {
        const [row] = await tx
          .insert(credentials)
          .values({ ...values, createdBy: actor })
          .returning();
        if (!row) throw AppError.internal('Inserting the credential returned no row');
        await this.record(tx, row.id, 'create', actor);
        return row;
      }),
    );
  }

  /** Resolves `undefined` when the name is taken, so two migrate runs importing at once both succeed */
  createIfNameFree(values: NewCredential, actor: string): Promise<Credential.Row | undefined> {
    return this.databaseService.run(() =>
      this.db.transaction(async tx => {
        const [row] = await tx
          .insert(credentials)
          .values({ ...values, createdBy: actor })
          .onConflictDoNothing({ target: credentials.name })
          .returning();
        if (row) await this.record(tx, row.id, 'create', actor);
        return row;
      }),
    );
  }

  rotate(id: string, secret: Envelope, hint: string, actor: string): Promise<Credential.Row | undefined> {
    return this.databaseService.run(() =>
      this.db.transaction(async tx => {
        const [row] = await tx
          .update(credentials)
          .set({ secret, hint, version: sql`${credentials.version} + 1`, rotatedAt: new Date() })
          .where(and(eq(credentials.id, id), isNull(credentials.revokedAt)))
          .returning();
        if (row) await this.record(tx, row.id, 'rotate', actor);
        return row;
      }),
    );
  }

  /** Reads the published document under the catalog lock, so a publish naming the credential cannot commit between the check and the revocation */
  revoke(id: string, actor: string, findReferences: ReferenceFinder): Promise<RevokeOutcome> {
    return this.databaseService.run(() =>
      this.db.transaction(async (tx): Promise<RevokeOutcome> => {
        await tx.execute(CATALOG_WRITE_LOCK);
        const [current] = await tx.select().from(credentials).where(eq(credentials.id, id)).limit(1).for('update');
        if (!current) return { status: 'not_found' };
        if (current.revokedAt) return { status: 'already_revoked', credential: current };

        const [active] = await tx.select({ document: versions.document }).from(versions).where(eq(versions.state, 'PUBLISHED')).orderBy(desc(versions.version)).limit(1);
        const referencedBy = active ? findReferences(active.document) : [];
        if (referencedBy.length > 0) return { status: 'in_use', referencedBy };

        const [row] = await tx.update(credentials).set({ revokedAt: new Date() }).where(eq(credentials.id, id)).returning();
        if (!row) throw AppError.internal('Revoking the credential returned no row');
        await this.record(tx, id, 'revoke', actor);
        return { status: 'revoked', credential: row };
      }),
    );
  }

  /**
   * Re-wraps every row whose kid is not the active one, one replica at a time. Each write is a compare-and-set on the version and kid it read,
   * so a rotation landing in between is kept, never overwritten with the older secret. A row `rewrap` throws for is reported and skipped.
   */
  rewrapStale(activeKeyId: string, rewrap: (candidate: RewrapCandidate) => Promise<Envelope>): Promise<RewrapResult | undefined> {
    return this.databaseService.run(() =>
      this.db.transaction(async tx => {
        const [lock] = await tx.execute<{ locked: boolean }>(REWRAP_LOCK);
        if (lock?.locked !== true) return undefined;
        const candidates = await tx
          .select({ id: credentials.id, version: credentials.version, kid: KID, secret: credentials.secret })
          .from(credentials)
          .where(sql`${KID} is distinct from ${activeKeyId}`);

        const result: RewrapResult = { rewrapped: 0, skipped: 0, failed: [] };
        for (const candidate of candidates) {
          const secret = await rewrap(candidate).catch(() => undefined);
          if (!secret || candidate.kid === null) {
            result.failed.push(candidate.id);
            continue;
          }
          const updated = await tx
            .update(credentials)
            .set({ secret })
            .where(and(eq(credentials.id, candidate.id), eq(credentials.version, candidate.version), sql`${KID} = ${candidate.kid}`))
            .returning({ id: credentials.id });
          if (updated.length > 0) result.rewrapped++;
          else result.skipped++;
        }
        return result;
      }),
    );
  }

  private async record(executor: Executor, credentialId: string, action: Credential.Action, actor: string): Promise<void> {
    await executor.insert(events).values({ credentialId, action, actor });
  }
}
