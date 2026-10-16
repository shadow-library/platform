import { AppErrorCode } from '@server/classes';
import { type Catalog } from '@server/database';

import {
  type CatalogVersionRepository,
  type CatalogVersionStore,
  type CatalogVersionSummary,
  DRAFT_VERSION,
  type DraftValues,
  type PublishedValues,
} from '@modules/catalog/catalog-version.repository';

type Row = Catalog.Version;

/** Mirrors the table's unique `version` and single-draft index, which the real constraint map turns into the same conflict. */
class InMemoryCatalogStore implements CatalogVersionStore {
  constructor(private readonly repository: FakeCatalogVersionRepository) {}

  async findDraft(): Promise<Row | undefined> {
    return this.repository.rows.find(row => row.state === 'DRAFT');
  }

  async findActive(): Promise<Row | undefined> {
    return this.repository.published().at(0);
  }

  async findVersion(version: number): Promise<Row | undefined> {
    return this.repository.rows.find(row => row.version === version && row.state !== 'DRAFT');
  }

  async maxVersion(): Promise<number> {
    return Math.max(DRAFT_VERSION, ...this.repository.rows.map(row => row.version));
  }

  async insertDraft(values: DraftValues): Promise<Row> {
    return this.insert({ ...values, version: DRAFT_VERSION, state: 'DRAFT', publishedAt: null });
  }

  async updateDraft(id: bigint, values: DraftValues): Promise<Row | undefined> {
    const row = this.repository.rows.find(candidate => candidate.id === id && candidate.state === 'DRAFT');
    if (row) Object.assign(row, values);
    return row;
  }

  async archivePublished(): Promise<void> {
    for (const row of this.repository.rows) if (row.state === 'PUBLISHED') row.state = 'ARCHIVED';
  }

  async promoteDraft(id: bigint, version: number, createdBy: string): Promise<Row | undefined> {
    const row = this.repository.rows.find(candidate => candidate.id === id && candidate.state === 'DRAFT');
    if (!row) return undefined;
    this.assertVersionFree(version);
    return Object.assign(row, { state: 'PUBLISHED', version, createdBy, publishedAt: new Date() } satisfies Partial<Row>);
  }

  async insertPublished(values: PublishedValues): Promise<Row> {
    return this.insert({ ...values, state: 'PUBLISHED', publishedAt: new Date() });
  }

  private insert(values: Omit<Row, 'id' | 'createdAt'>): Row {
    this.assertVersionFree(values.version);
    if (values.state === 'DRAFT' && this.repository.rows.some(row => row.state === 'DRAFT')) throw AppErrorCode.SYN_CATALOG_CONFLICT.create();
    const row: Row = { ...values, id: this.repository.nextId(), createdAt: new Date() };
    this.repository.rows.push(row);
    return row;
  }

  private assertVersionFree(version: number): void {
    if (this.repository.rows.some(row => row.version === version)) throw AppErrorCode.SYN_CATALOG_CONFLICT.create();
  }
}

/** Serialises `exclusive` like the advisory lock and restores the rows when the work throws, as a rolled-back transaction would. */
export class FakeCatalogVersionRepository {
  rows: Row[] = [];
  beforeExclusive?: () => void;
  private lock: Promise<void> = Promise.resolve();
  private lastId = 0n;

  nextId(): bigint {
    return ++this.lastId;
  }

  seed(document: unknown, version: number, state: Catalog.State = 'PUBLISHED'): Row {
    const row: Row = { id: this.nextId(), version, state, document, note: null, createdBy: 'seed', createdAt: new Date(), publishedAt: state === 'DRAFT' ? null : new Date() };
    this.rows.push(row);
    return row;
  }

  published(): Row[] {
    return this.rows.filter(row => row.state === 'PUBLISHED').sort((left, right) => right.version - left.version);
  }

  asRepository(): CatalogVersionRepository {
    return this as unknown as CatalogVersionRepository;
  }

  async list(): Promise<CatalogVersionSummary[]> {
    return this.rows
      .filter(row => row.state !== 'DRAFT')
      .map(row => {
        const { document: _document, ...summary } = row;
        return summary;
      });
  }

  findVersion(version: number): Promise<Row | undefined> {
    return new InMemoryCatalogStore(this).findVersion(version);
  }

  findDraft(): Promise<Row | undefined> {
    return new InMemoryCatalogStore(this).findDraft();
  }

  findActive(): Promise<Row | undefined> {
    return new InMemoryCatalogStore(this).findActive();
  }

  async activeVersion(): Promise<number | null> {
    return this.published().at(0)?.version ?? null;
  }

  async exclusive<T>(work: (store: CatalogVersionStore) => Promise<T>): Promise<T> {
    this.beforeExclusive?.();
    const previous = this.lock;
    let release = (): void => undefined;
    this.lock = new Promise(resolve => (release = resolve));
    await previous;
    const snapshot = this.rows.map(row => ({ ...row }));
    try {
      return await work(new InMemoryCatalogStore(this));
    } catch (error) {
      this.rows = snapshot;
      throw error;
    } finally {
      release();
    }
  }
}
