import { and, desc, eq, getTableColumns, inArray, max, ne, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { Catalog, type DatabaseTransaction, type PrimaryDatabase, schema } from '@server/database';

import { type CredentialState } from './catalog.types';

export type CatalogVersionSummary = Omit<Catalog.Version, 'document'>;

export interface PublishedValues {
  version: number;
  document: unknown;
  note: string | null;
  createdBy: string;
}

/** The writes a change, budget publish and rollback make, available only inside `CatalogVersionRepository.exclusive`. */
export interface CatalogVersionStore {
  findActive(): Promise<Catalog.Version | undefined>;
  findVersion(version: number): Promise<Catalog.Version | undefined>;
  maxVersion(): Promise<number>;
  archivePublished(): Promise<void>;
  insertPublished(values: PublishedValues): Promise<Catalog.Version>;
  /** Read under the catalog lock, which a credential revocation also takes, so a publish never names a credential revoked concurrently */
  findCredentials(ids: readonly string[]): Promise<CredentialState[]>;
  /** Whether any published or archived version ever named the credential */
  referencesCredential(id: string): Promise<boolean>;
}

type Executor = PrimaryDatabase | DatabaseTransaction;

/** What `maxVersion()` answers before anything is published; `DRAFT` rows left by the removed draft workflow also hold it and are never read. */
export const NO_VERSION = 0;

const versions = schema.catalogVersions;
const credentials = schema.providerCredentials;
const { document: _document, ...SUMMARY_COLUMNS } = getTableColumns(versions);

/** Every catalog write takes this transaction-scoped lock, so changes, budget publishes and rollbacks run one at a time on every replica. */
export const CATALOG_WRITE_LOCK = sql`select pg_advisory_xact_lock(hashtext('synapse:catalog'))`;

class DrizzleCatalogVersionStore implements CatalogVersionStore {
  constructor(private readonly executor: Executor) {}

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
    return row?.value ?? NO_VERSION;
  }

  async activeVersion(): Promise<number | null> {
    const [row] = await this.executor
      .select({ value: max(versions.version) })
      .from(versions)
      .where(eq(versions.state, 'PUBLISHED'));
    return row?.value ?? null;
  }

  async archivePublished(): Promise<void> {
    await this.executor.update(versions).set({ state: 'ARCHIVED' }).where(eq(versions.state, 'PUBLISHED'));
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
