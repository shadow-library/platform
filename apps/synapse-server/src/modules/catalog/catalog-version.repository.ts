import { and, desc, eq, getTableColumns, inArray, max, ne, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { Catalog, type DatabaseTransaction, type PrimaryDatabase, schema } from '@server/database';

import { type CredentialState } from './catalog.types';

export type CatalogVersionSummary = Omit<Catalog.Version, 'document'>;

export interface DraftValues {
  document: unknown;
  note: string | null;
  createdBy: string | null;
}

export interface PublishedValues {
  version: number;
  document: unknown;
  note: string | null;
  createdBy: string;
}

/** The writes publish, budget publish, rollback and draft saves and discards make, available only inside `CatalogVersionRepository.exclusive`. */
export interface CatalogVersionStore {
  findDraft(): Promise<Catalog.Version | undefined>;
  findActive(): Promise<Catalog.Version | undefined>;
  findVersion(version: number): Promise<Catalog.Version | undefined>;
  maxVersion(): Promise<number>;
  insertDraft(values: DraftValues): Promise<Catalog.Version>;
  updateDraft(id: bigint, values: DraftValues): Promise<Catalog.Version | undefined>;
  /** Resolves `false` when the row is no longer a draft */
  deleteDraft(id: bigint): Promise<boolean>;
  archivePublished(): Promise<void>;
  /** Resolves `undefined` when the row is no longer a draft */
  promoteDraft(id: bigint, version: number, createdBy: string): Promise<Catalog.Version | undefined>;
  insertPublished(values: PublishedValues): Promise<Catalog.Version>;
  /** Read under the catalog lock, which a credential revocation also takes, so a publish never names a credential revoked concurrently */
  findCredentials(ids: readonly string[]): Promise<CredentialState[]>;
  /** Whether any published or archived version ever named the credential */
  referencesCredential(id: string): Promise<boolean>;
}

type Executor = PrimaryDatabase | DatabaseTransaction;

/** The single draft row holds a version below every published one, so the unique `version` column never collides with it. */
export const DRAFT_VERSION = 0;

const versions = schema.catalogVersions;
const credentials = schema.providerCredentials;
const { document: _document, ...SUMMARY_COLUMNS } = getTableColumns(versions);

/** Every catalog write takes this transaction-scoped lock, so publishers, rollbacks and draft saves run one at a time on every replica. */
export const CATALOG_WRITE_LOCK = sql`select pg_advisory_xact_lock(hashtext('synapse:catalog'))`;

class DrizzleCatalogVersionStore implements CatalogVersionStore {
  constructor(private readonly executor: Executor) {}

  async findDraft(): Promise<Catalog.Version | undefined> {
    const [row] = await this.executor.select().from(versions).where(eq(versions.state, 'DRAFT')).limit(1);
    return row;
  }

  async findActive(): Promise<Catalog.Version | undefined> {
    const [row] = await this.executor.select().from(versions).where(eq(versions.state, 'PUBLISHED')).orderBy(desc(versions.version)).limit(1);
    return row;
  }

  async findVersion(version: number): Promise<Catalog.Version | undefined> {
    const [row] = await this.executor
      .select()
      .from(versions)
      .where(and(eq(versions.version, version), ne(versions.state, 'DRAFT')))
      .limit(1);
    return row;
  }

  async maxVersion(): Promise<number> {
    const [row] = await this.executor.select({ value: max(versions.version) }).from(versions);
    return row?.value ?? DRAFT_VERSION;
  }

  async activeVersion(): Promise<number | null> {
    const [row] = await this.executor
      .select({ value: max(versions.version) })
      .from(versions)
      .where(eq(versions.state, 'PUBLISHED'));
    return row?.value ?? null;
  }

  async insertDraft(values: DraftValues): Promise<Catalog.Version> {
    const [row] = await this.executor
      .insert(versions)
      .values({ ...values, version: DRAFT_VERSION, state: 'DRAFT' })
      .returning();
    if (!row) throw AppError.internal('Inserting the catalog draft returned no row');
    return row;
  }

  async updateDraft(id: bigint, values: DraftValues): Promise<Catalog.Version | undefined> {
    const [row] = await this.executor
      .update(versions)
      .set(values)
      .where(and(eq(versions.id, id), eq(versions.state, 'DRAFT')))
      .returning();
    return row;
  }

  async deleteDraft(id: bigint): Promise<boolean> {
    const rows = await this.executor
      .delete(versions)
      .where(and(eq(versions.id, id), eq(versions.state, 'DRAFT')))
      .returning({ id: versions.id });
    return rows.length > 0;
  }

  async archivePublished(): Promise<void> {
    await this.executor.update(versions).set({ state: 'ARCHIVED' }).where(eq(versions.state, 'PUBLISHED'));
  }

  async promoteDraft(id: bigint, version: number, createdBy: string): Promise<Catalog.Version | undefined> {
    const [row] = await this.executor
      .update(versions)
      .set({ state: 'PUBLISHED', version, createdBy, publishedAt: new Date() })
      .where(and(eq(versions.id, id), eq(versions.state, 'DRAFT')))
      .returning();
    return row;
  }

  async insertPublished(values: PublishedValues): Promise<Catalog.Version> {
    const [row] = await this.executor
      .insert(versions)
      .values({ ...values, state: 'PUBLISHED', publishedAt: new Date() })
      .returning();
    if (!row) throw AppError.internal('Inserting the published catalog returned no row');
    return row;
  }

  async findCredentials(ids: readonly string[]): Promise<CredentialState[]> {
    if (ids.length === 0) return [];
    const rows = await this.executor
      .select({ id: credentials.id, allowedOrigin: credentials.allowedOrigin, revokedAt: credentials.revokedAt })
      .from(credentials)
      .where(inArray(credentials.id, [...ids]));
    return rows.map(row => ({ id: row.id, allowedOrigin: row.allowedOrigin, revoked: row.revokedAt !== null }));
  }

  async referencesCredential(id: string): Promise<boolean> {
    const path = sql`'$.providers.*.credential ? (@ == $id)'::jsonpath`;
    const [row] = await this.executor
      .select({ found: sql<boolean>`true` })
      .from(versions)
      .where(and(ne(versions.state, 'DRAFT'), sql`jsonb_path_exists(${versions.document}, ${path}, jsonb_build_object('id', ${id}::text))`))
      .limit(1);
    return row !== undefined;
  }
}

@Injectable()
export class CatalogVersionRepository {
  private readonly db: PrimaryDatabase;
  private readonly reads: DrizzleCatalogVersionStore;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
    this.reads = new DrizzleCatalogVersionStore(this.db);
  }

  list(): Promise<CatalogVersionSummary[]> {
    return this.databaseService.run(() => this.db.select(SUMMARY_COLUMNS).from(versions).where(ne(versions.state, 'DRAFT')).orderBy(desc(versions.version)));
  }

  findVersion(version: number): Promise<Catalog.Version | undefined> {
    return this.databaseService.run(() => this.reads.findVersion(version));
  }

  findDraft(): Promise<Catalog.Version | undefined> {
    return this.databaseService.run(() => this.reads.findDraft());
  }

  findActive(): Promise<Catalog.Version | undefined> {
    return this.databaseService.run(() => this.reads.findActive());
  }

  activeVersion(): Promise<number | null> {
    return this.databaseService.run(() => this.reads.activeVersion());
  }

  findCredentials(ids: readonly string[]): Promise<CredentialState[]> {
    return this.databaseService.run(() => this.reads.findCredentials(ids));
  }

  /** Domain errors thrown by `work` pass through untouched; database failures go through the constraint map, so a lost race surfaces as `SYN_CATALOG_CONFLICT`. */
  async exclusive<T>(work: (store: CatalogVersionStore) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(async tx => {
        await tx.execute(CATALOG_WRITE_LOCK);
        return work(new DrizzleCatalogVersionStore(tx));
      });
    } catch (error) {
      if (AppError.is(error)) throw error;
      return this.databaseService.translateError(error);
    }
  }
}
