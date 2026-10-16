import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Catalog } from '@server/database';

import { ActiveCatalogCache } from './active-catalog.cache';
import { type CatalogDiff, changedSections, diffCatalog } from './catalog-diff';
import { catalogFingerprint } from './catalog-fingerprint';
import { parseCatalogDocument } from './catalog-parser';
import { checkCatalogDocument } from './catalog-validator';
import { type CatalogDocument, type CatalogIssue, type CatalogSection } from './catalog.types';
import { isRecord } from './catalog.utils';
import { CatalogVersionRepository, type CatalogVersionStore, type CatalogVersionSummary } from './catalog-version.repository';

export interface DraftView {
  draft: Catalog.Version;
  fingerprint: string;
}

export interface SavedDraft extends DraftView {
  issues: CatalogIssue[];
}

/** Throws to refuse the save, e.g. when the caller lacks the permission a changed section needs */
export type DraftAuthorizer = (changed: Set<CatalogSection>) => void | Promise<void>;

function viewOf(draft: Catalog.Version): DraftView {
  return { draft, fingerprint: catalogFingerprint(draft.document) };
}

/** `SYN_CATALOG_INVALID` carries its issues here; the wire shape is the admin API's to choose. */
export function catalogIssuesOf(error: unknown): CatalogIssue[] | undefined {
  if (!AppError.is(error, AppErrorCode.SYN_CATALOG_INVALID)) return undefined;
  const issues: unknown = error.data?.issues;
  return Array.isArray(issues) ? (issues as CatalogIssue[]) : undefined;
}

/**
 * The only writer of `catalog_versions`. Every write runs under the repository's catalog lock and re-reads what it depends on inside it, so two
 * publishers can never both succeed: the second waits, then finds the draft already published and refuses with `SYN_CATALOG_CONFLICT`.
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

  async getDraft(): Promise<DraftView | null> {
    const draft = await this.repository.findDraft();
    return draft ? viewOf(draft) : null;
  }

  listVersions(): Promise<CatalogVersionSummary[]> {
    return this.repository.list();
  }

  async getVersion(version: number): Promise<Catalog.Version | null> {
    return (await this.repository.findVersion(version)) ?? null;
  }

  /**
   * Saves whatever object the admin sent, so work in progress survives; the issues say what would block publishing it. `authorize` sees the sections
   * changed against what the admin edited, the current draft or else the active document, re-read under the lock so no concurrent save slips between.
   */
  async saveDraft(document: unknown, note: string | undefined, actor: string, authorize: DraftAuthorizer): Promise<SavedDraft> {
    if (!isRecord(document)) throw AppErrorCode.SYN_CATALOG_INVALID.create({ issues: [{ path: '', code: 'invalid_type', message: 'Expected an object' }] });
    const values = { document, note: note ?? null, createdBy: actor };
    const saved = await this.repository.exclusive(async store => {
      const existing = await store.findDraft();
      const activeRow = await store.findActive();
      await authorize(changedSections(document, existing?.document ?? activeRow?.document ?? null));
      const active = activeRow ? this.parseActive(activeRow) : null;
      const check = checkCatalogDocument(document, active);
      const draft = existing ? await store.updateDraft(existing.id, values) : await store.insertDraft(values);
      if (!draft) throw AppErrorCode.SYN_CATALOG_CONFLICT.create();
      return { ...viewOf(draft), issues: check.valid ? [] : check.issues };
    });
    this.logger.info('Saved the catalog draft', { actor, issueCount: saved.issues.length });
    return saved;
  }

  async validateDraft(): Promise<CatalogIssue[]> {
    const draft = await this.requireDraft();
    const active = await this.repository.findActive();
    const check = checkCatalogDocument(draft.document, active ? this.parseActive(active) : null);
    return check.valid ? [] : check.issues;
  }

  async diff(): Promise<CatalogDiff> {
    const draft = await this.requireDraft();
    const active = await this.repository.findActive();
    return diffCatalog(draft.document, active?.document ?? {});
  }

  /** The fingerprint proves the caller saw the draft it publishes: an overwrite keeps the row id, so only the content tells a stale publish apart. */
  async publish(actor: string, fingerprint: string): Promise<Catalog.Version> {
    const requested = await this.requireDraft();
    const published = await this.repository.exclusive(async store => {
      const draft = await store.findDraft();
      if (draft?.id !== requested.id) throw AppErrorCode.SYN_CATALOG_CONFLICT.create();
      if (catalogFingerprint(draft.document) !== fingerprint) throw AppErrorCode.SYN_CATALOG_CONFLICT.create();
      this.assertPublishable(draft.document, await this.activeDocument(store));
      const version = (await store.maxVersion()) + 1;
      await store.archivePublished();
      return (await store.promoteDraft(draft.id, version, actor)) ?? AppErrorCode.SYN_CATALOG_CONFLICT.throw();
    });
    this.logger.info('Published the catalog draft', { version: published.version, actor });
    await this.cache.refreshNow();
    return published;
  }

  /** History is append-only: the old document is copied into a new version, which must still pass against the current one. */
  async rollback(version: number, actor: string): Promise<Catalog.Version> {
    const published = await this.repository.exclusive(async store => {
      const target = await store.findVersion(version);
      if (!target) throw AppErrorCode.S009.create();
      this.assertPublishable(target.document, await this.activeDocument(store));
      const next = (await store.maxVersion()) + 1;
      await store.archivePublished();
      return store.insertPublished({ version: next, document: target.document, note: `Rollback to v${version}`, createdBy: actor });
    });
    this.logger.info('Rolled the catalog back', { from: version, version: published.version, actor });
    await this.cache.refreshNow();
    return published;
  }

  private async requireDraft(): Promise<Catalog.Version> {
    return (await this.repository.findDraft()) ?? AppErrorCode.S009.throw();
  }

  private async activeDocument(store: CatalogVersionStore): Promise<CatalogDocument | null> {
    const active = await store.findActive();
    return active ? this.parseActive(active) : null;
  }

  /** The history rules need the active document; one this code cannot read would silently disable them, so it fails closed. */
  private parseActive(active: Catalog.Version): CatalogDocument {
    const parsed = parseCatalogDocument(active.document);
    if (parsed.ok) return parsed.document;
    this.logger.error('The published catalog no longer parses', { version: active.version, issues: parsed.issues.slice(0, 20) });
    throw AppError.internal(`Published catalog v${active.version} does not parse`);
  }

  private assertPublishable(document: unknown, active: CatalogDocument | null): void {
    const check = checkCatalogDocument(document, active);
    if (!check.valid) throw AppErrorCode.SYN_CATALOG_INVALID.create({ issues: check.issues });
  }
}
