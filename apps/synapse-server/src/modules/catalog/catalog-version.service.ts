import { isDeepStrictEqual } from 'node:util';

import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Catalog } from '@server/database';

import { ActiveCatalogCache } from './active-catalog.cache';
import { changedSections } from './catalog-diff';
import { parseCatalogDocument } from './catalog-parser';
import { checkPublishable } from './catalog-validator';
import { type CatalogDocument, type CatalogIssue, type CatalogSection } from './catalog.types';
import { isRecord } from './catalog.utils';
import { CatalogVersionRepository, type CatalogVersionStore, type CatalogVersionSummary } from './catalog-version.repository';

const CHANGE_NOTE = 'Catalog change';
const BUDGET_NOTE = 'Budgets updated';

/** Throws to refuse the change, e.g. when the caller lacks the permission a changed section needs */
export type ChangeAuthorizer = (changed: Set<CatalogSection>) => void | Promise<void>;

/** What a write proposes against the active version it was built on; `expectedVersion` is null only for the first catalog. */
interface ProposedChange {
  expectedVersion: number | null;
  document: (store: CatalogVersionStore, active: Catalog.Version | undefined) => unknown;
  note: string;
  actor: string;
  authorize: ChangeAuthorizer;
}

interface ChangeOutcome {
  version: Catalog.Version;
  published: boolean;
}

function withBudgets(document: unknown, budgets: unknown): Record<string, unknown> {
  return { ...(isRecord(document) ? document : {}), budgets };
}

function noteOr(note: string | undefined, fallback: string): string {
  return note?.trim() ? note : fallback;
}

const allowAny: ChangeAuthorizer = () => undefined;

/** `SYN_CATALOG_INVALID` carries its issues here; the wire shape is the admin API's to choose. */
export function catalogIssuesOf(error: unknown): CatalogIssue[] | undefined {
  if (!AppError.is(error, AppErrorCode.SYN_CATALOG_INVALID)) return undefined;
  const issues: unknown = error.data?.issues;
  return Array.isArray(issues) ? (issues as CatalogIssue[]) : undefined;
}

/**
 * The only writer of `catalog_versions`. Every write runs under the repository's catalog lock and re-reads the active version inside it, so two
 * writers built on the same version can never both succeed: the second waits, then finds the active version moved and refuses with `SYN_CATALOG_CONFLICT`.
 */
@Injectable()
export class CatalogVersionService {
  private readonly logger = Logger.getLogger(APP_NAME, CatalogVersionService.name);

  constructor(
    private readonly repository: CatalogVersionRepository,
    private readonly cache: ActiveCatalogCache,
  ) {}

  async getActive(): Promise<Catalog.Version | null> {
    return (await this.repository.findActive()) ?? null;
  }

  listVersions(): Promise<CatalogVersionSummary[]> {
    return this.repository.list();
  }

  async getVersion(version: number): Promise<Catalog.Version | null> {
    return (await this.repository.findVersion(version)) ?? null;
  }

  /** `authorize` sees the sections changed against the active document, re-read under the lock so no concurrent change slips between. */
  applyChange(document: unknown, expectedVersion: number | null, note: string | undefined, actor: string, authorize: ChangeAuthorizer): Promise<Catalog.Version> {
    const change = { expectedVersion, document: () => document, note: noteOr(note, CHANGE_NOTE), actor, authorize };
    return this.publish(change, 'Applied a catalog change');
  }

  publishBudgets(budgets: unknown, expectedVersion: number, note: string | undefined, actor: string): Promise<Catalog.Version> {
    const document = (_store: CatalogVersionStore, active: Catalog.Version | undefined): unknown => withBudgets(active?.document, budgets);
    return this.publish({ expectedVersion, document, note: noteOr(note, BUDGET_NOTE), actor, authorize: allowAny }, 'Published a catalog budget change');
  }

  /** History is append-only: the old document is copied into a new version, which must still pass against the current one. */
  rollback(version: number, expectedVersion: number, actor: string, authorize: ChangeAuthorizer): Promise<Catalog.Version> {
    const document = async (store: CatalogVersionStore): Promise<unknown> => ((await store.findVersion(version)) ?? AppErrorCode.S009.throw()).document;
    return this.publish({ expectedVersion, document, note: `Rollback to v${version}`, actor, authorize }, 'Rolled the catalog back', { from: version });
  }

  private async publish(change: ProposedChange, message: string, metadata: Record<string, unknown> = {}): Promise<Catalog.Version> {
    const outcome = await this.repository.exclusive(store => this.publishWithin(store, change));
    if (outcome.published) await this.cache.refreshNow();
    this.logger.info(message, { ...metadata, actor: change.actor, version: outcome.version.version, published: outcome.published });
    return outcome.version;
  }

  private async publishWithin(store: CatalogVersionStore, change: ProposedChange): Promise<ChangeOutcome> {
    const active = await store.findActive();
    if ((active?.version ?? null) !== change.expectedVersion) throw AppErrorCode.SYN_CATALOG_CONFLICT.create();
    const document = await change.document(store, active);
    await change.authorize(changedSections(document, active?.document ?? null));
    if (active && isDeepStrictEqual(document, active.document)) return { version: active, published: false };
    await this.assertPublishable(store, document, active);
    const next = (await store.maxVersion()) + 1;
    await store.archivePublished();
    const version = await store.insertPublished({ version: next, document, note: change.note, createdBy: change.actor });
    return { version, published: true };
  }

  /** The history rules need the active document; one this code cannot read would silently disable them, so it fails closed. */
  private parseActive(active: Catalog.Version): CatalogDocument {
    const parsed = parseCatalogDocument(active.document);
    if (parsed.ok) return parsed.document;
    this.logger.error('The published catalog no longer parses', { version: active.version, issues: parsed.issues.slice(0, 20) });
    throw AppError.internal(`Published catalog v${active.version} does not parse`);
  }

  private async assertPublishable(store: CatalogVersionStore, document: unknown, active: Catalog.Version | undefined): Promise<void> {
    const check = await checkPublishable(document, active ? this.parseActive(active) : null, ids => store.findCredentials(ids));
    if (!check.valid) throw AppErrorCode.SYN_CATALOG_INVALID.create({ issues: check.issues });
  }
}
