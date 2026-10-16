import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { AppError, type ErrorCode } from '@shadow-library/common';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';

import { AppErrorCode } from '@server/classes';

import { type ActiveCatalogCache } from '@modules/catalog/active-catalog.cache';
import { catalogFingerprint } from '@modules/catalog/catalog-fingerprint';
import { DRAFT_VERSION } from '@modules/catalog/catalog-version.repository';
import { catalogIssuesOf, CatalogVersionService } from '@modules/catalog/catalog-version.service';
import { type CatalogDocument, type CatalogSection } from '@modules/catalog/catalog.types';

import { catalogDocument } from './catalog.fixtures';
import { FakeCatalogVersionRepository } from './fake-catalog-version.repository';

let restoreLogger: RestoreLogger;
let repository: FakeCatalogVersionRepository;
let refreshes: number;
let service: CatalogVersionService;

beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

beforeEach(() => {
  repository = new FakeCatalogVersionRepository();
  refreshes = 0;
  const cache = { refreshNow: async () => void refreshes++ } as unknown as ActiveCatalogCache;
  service = new CatalogVersionService(repository.asRepository(), cache);
});

async function failure(operation: Promise<unknown>): Promise<AppError> {
  const error = await operation.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!AppError.is(error)) throw new TypeError(`expected an AppError, got ${String(error)}`);
  return error;
}

async function expectFailure(operation: Promise<unknown>, code: ErrorCode): Promise<AppError> {
  const error = await failure(operation);
  expect(error.code).toBe(code.code);
  return error;
}

function states(): string[] {
  return [...repository.rows].sort((left, right) => left.version - right.version).map(row => `v${row.version}:${row.state}`);
}

const allowAll = (): void => undefined;

function withOpusMax(document: CatalogDocument): void {
  document.aliases.opus!.label = 'Opus Max';
}

function withoutPreview(document: CatalogDocument): void {
  delete document.aliases.preview;
  document.tasks['novel-forge.chat']!.aliases = ['opus', 'grok', 'llama'];
}

describe('CatalogVersionService.saveDraft', () => {
  it('should create the single draft with the actor as its author and no issues for a valid document', async () => {
    const saved = await service.saveDraft(catalogDocument(), 'first cut', 'admin-1', allowAll);
    expect(saved.issues).toEqual([]);
    expect({ version: saved.draft.version, state: saved.draft.state, note: saved.draft.note, createdBy: saved.draft.createdBy }).toEqual({
      version: DRAFT_VERSION,
      state: 'DRAFT',
      note: 'first cut',
      createdBy: 'admin-1',
    });
  });

  it('should save an invalid document and return its issues instead of failing', async () => {
    const saved = await service.saveDraft({ providers: {} }, undefined, 'admin-1', allowAll);
    expect(saved.issues.map(issue => issue.path)).toEqual(['models', 'aliases', 'tasks', 'budgets']);
    expect((await service.getDraft())?.draft.document).toEqual({ providers: {} });
  });

  it('should overwrite the existing draft rather than open a second one', async () => {
    const first = await service.saveDraft(catalogDocument(), undefined, 'admin-1', allowAll);
    const second = await service.saveDraft(catalogDocument(withoutPreview), 'trimmed', 'admin-2', allowAll);
    expect(second.draft.id).toBe(first.draft.id);
    expect(repository.rows.filter(row => row.state === 'DRAFT')).toHaveLength(1);
    expect(second.draft.createdBy).toBe('admin-2');
  });

  it('should judge the draft against the active document', async () => {
    repository.seed(catalogDocument(), 1);
    const saved = await service.saveDraft(catalogDocument(withoutPreview), undefined, 'admin-1', allowAll);
    expect(saved.issues.map(issue => issue.code)).toEqual(['alias_removed']);
  });

  it('should authorise against the sections changed relative to the existing draft', async () => {
    repository.seed(catalogDocument(), 1);
    await service.saveDraft(
      catalogDocument(draft => (draft.providers.openrouter!.url = 'https://openrouter.example/api/v1')),
      undefined,
      'admin-1',
      allowAll,
    );
    const seen: Set<CatalogSection>[] = [];
    const next = catalogDocument(draft => {
      draft.providers.openrouter!.url = 'https://openrouter.example/api/v1';
      draft.budgets[0]!.maxCalls = 10;
    });
    await service.saveDraft(next, undefined, 'operator-1', changed => void seen.push(changed));
    expect(seen).toEqual([new Set<CatalogSection>(['budgets'])]);
  });

  it('should authorise against the active document when there is no draft', async () => {
    repository.seed(catalogDocument(), 1);
    const seen: Set<CatalogSection>[] = [];
    await service.saveDraft(catalogDocument(withOpusMax), undefined, 'operator-1', changed => void seen.push(changed));
    expect(seen).toEqual([new Set<CatalogSection>(['aliases'])]);
  });

  it('should abort the save when authorisation throws', async () => {
    repository.seed(catalogDocument(), 1);
    const refusal = AppErrorCode.SEC_003.create();
    const error = await failure(
      service.saveDraft(catalogDocument(withOpusMax), undefined, 'viewer-1', () => {
        throw refusal;
      }),
    );
    expect(error).toBe(refusal);
    expect(states()).toEqual(['v1:PUBLISHED']);
  });

  it('should authorise after re-reading the draft under the lock', async () => {
    await service.saveDraft(catalogDocument(), undefined, 'admin-1', allowAll);
    repository.beforeExclusive = () => (repository.rows.find(row => row.state === 'DRAFT')!.document = catalogDocument(withOpusMax));
    const seen: Set<CatalogSection>[] = [];
    await service.saveDraft(catalogDocument(withOpusMax), undefined, 'operator-1', changed => void seen.push(changed));
    expect(seen).toEqual([new Set<CatalogSection>()]);
  });

  it('should refuse a document that is not an object', async () => {
    const error = await expectFailure(service.saveDraft([catalogDocument()], undefined, 'admin-1', allowAll), AppErrorCode.SYN_CATALOG_INVALID);
    expect(catalogIssuesOf(error)?.map(issue => issue.code)).toEqual(['invalid_type']);
    expect(repository.rows).toHaveLength(0);
  });
});

describe('CatalogVersionService.validateDraft and diff', () => {
  it('should report the draft issues against the active document', async () => {
    repository.seed(catalogDocument(), 1);
    repository.seed(catalogDocument(withoutPreview), DRAFT_VERSION, 'DRAFT');
    expect((await service.validateDraft()).map(issue => issue.path)).toEqual(['aliases.preview']);
  });

  it('should diff the draft against the active document', async () => {
    repository.seed(catalogDocument(), 1);
    repository.seed(catalogDocument(withoutPreview), DRAFT_VERSION, 'DRAFT');
    expect(await service.diff()).toEqual({ added: [], removed: ['aliases.preview', 'tasks.novel-forge.chat.aliases[3]'], changed: [] });
  });

  it('should answer not found when there is no draft', async () => {
    await expectFailure(service.validateDraft(), AppErrorCode.S009);
    await expectFailure(service.diff(), AppErrorCode.S009);
  });
});

describe('CatalogVersionService.publish', () => {
  it('should publish the first draft as version 1', async () => {
    await service.saveDraft(catalogDocument(), 'baseline', 'admin-1', allowAll);
    const published = await service.publish('admin-2', catalogFingerprint(catalogDocument()));
    expect({ version: published.version, state: published.state, createdBy: published.createdBy, note: published.note }).toEqual({
      version: 1,
      state: 'PUBLISHED',
      createdBy: 'admin-2',
      note: 'baseline',
    });
    expect(published.publishedAt).toBeInstanceOf(Date);
    expect(refreshes).toBe(1);
  });

  it('should archive the published version and promote the draft to the next version', async () => {
    repository.seed(catalogDocument(), 1, 'ARCHIVED');
    repository.seed(catalogDocument(), 2);
    await service.saveDraft(catalogDocument(withOpusMax), undefined, 'admin-1', allowAll);
    await service.publish('admin-1', catalogFingerprint(catalogDocument(withOpusMax)));
    expect(states()).toEqual(['v1:ARCHIVED', 'v2:ARCHIVED', 'v3:PUBLISHED']);
    expect(await service.getDraft()).toBeNull();
  });

  it('should refuse an invalid draft with its issues and leave the catalog untouched', async () => {
    repository.seed(catalogDocument(), 1);
    await service.saveDraft(catalogDocument(withoutPreview), undefined, 'admin-1', allowAll);
    const error = await expectFailure(service.publish('admin-1', catalogFingerprint(catalogDocument(withoutPreview))), AppErrorCode.SYN_CATALOG_INVALID);
    expect(catalogIssuesOf(error)?.map(issue => issue.path)).toEqual(['aliases.preview']);
    expect(states()).toEqual(['v0:DRAFT', 'v1:PUBLISHED']);
    expect(refreshes).toBe(0);
  });

  it('should answer not found when there is no draft to publish', async () => {
    await expectFailure(service.publish('admin-1', catalogFingerprint(catalogDocument())), AppErrorCode.S009);
  });

  it('should let exactly one of two concurrent publishers succeed', async () => {
    repository.seed(catalogDocument(), 1);
    await service.saveDraft(catalogDocument(withOpusMax), undefined, 'admin-1', allowAll);
    const fingerprint = catalogFingerprint(catalogDocument(withOpusMax));
    const results = await Promise.allSettled([service.publish('admin-1', fingerprint), service.publish('admin-2', fingerprint)]);
    const outcomes = results.map(result => (result.status === 'fulfilled' ? `v${result.value.version}` : AppError.is(result.reason) ? result.reason.code : 'unknown'));
    expect(outcomes).toEqual(['v2', AppErrorCode.SYN_CATALOG_CONFLICT.code]);
    expect(states()).toEqual(['v1:ARCHIVED', 'v2:PUBLISHED']);
  });

  it('should refuse when another draft with the same content replaced the one it read before taking the lock', async () => {
    repository.seed(catalogDocument(), 1);
    await service.saveDraft(catalogDocument(), undefined, 'admin-1', allowAll);
    repository.beforeExclusive = () => {
      repository.rows = repository.rows.filter(row => row.state !== 'DRAFT');
      repository.seed(catalogDocument(), DRAFT_VERSION, 'DRAFT');
    };
    await expectFailure(service.publish('admin-1', catalogFingerprint(catalogDocument())), AppErrorCode.SYN_CATALOG_CONFLICT);
    expect(states()).toEqual(['v0:DRAFT', 'v1:PUBLISHED']);
  });

  it('should publish when the fingerprint matches the draft', async () => {
    const saved = await service.saveDraft(catalogDocument(), undefined, 'admin-1', allowAll);
    expect((await service.getDraft())?.fingerprint).toBe(saved.fingerprint);
    expect((await service.publish('admin-1', saved.fingerprint)).version).toBe(1);
  });

  it('should refuse a draft overwritten in place since the publisher read its fingerprint', async () => {
    const seen = await service.saveDraft(catalogDocument(), undefined, 'admin-1', allowAll);
    const edited = await service.saveDraft(catalogDocument(withOpusMax), undefined, 'admin-2', allowAll);
    expect({ sameRow: edited.draft.id === seen.draft.id, sameFingerprint: edited.fingerprint === seen.fingerprint }).toEqual({ sameRow: true, sameFingerprint: false });
    await expectFailure(service.publish('admin-1', seen.fingerprint), AppErrorCode.SYN_CATALOG_CONFLICT);
    expect(states()).toEqual(['v0:DRAFT']);
  });

  it('should fail closed when the published document no longer parses', async () => {
    repository.seed({ providers: {} }, 1);
    repository.seed(catalogDocument(), DRAFT_VERSION, 'DRAFT');
    const error = await failure(service.publish('admin-1', catalogFingerprint(catalogDocument())));
    expect(error.isInternal).toBe(true);
  });
});

describe('CatalogVersionService.rollback', () => {
  it('should copy the old document into a new published version and keep the draft', async () => {
    const original = catalogDocument();
    repository.seed(original, 1, 'ARCHIVED');
    repository.seed(
      catalogDocument(draft => (draft.aliases.opus!.label = 'Opus Max')),
      2,
    );
    repository.seed(catalogDocument(), DRAFT_VERSION, 'DRAFT');
    const published = await service.rollback(1, 'admin-1');
    expect({ version: published.version, document: published.document, note: published.note, createdBy: published.createdBy }).toEqual({
      version: 3,
      document: original,
      note: 'Rollback to v1',
      createdBy: 'admin-1',
    });
    expect(states()).toEqual(['v0:DRAFT', 'v1:ARCHIVED', 'v2:ARCHIVED', 'v3:PUBLISHED']);
    expect(refreshes).toBe(1);
  });

  it('should refuse to restore a document that drops an alias published since', async () => {
    repository.seed(catalogDocument(withoutPreview), 1, 'ARCHIVED');
    repository.seed(catalogDocument(), 2);
    const error = await expectFailure(service.rollback(1, 'admin-1'), AppErrorCode.SYN_CATALOG_INVALID);
    expect(catalogIssuesOf(error)?.map(issue => issue.code)).toEqual(['alias_removed']);
    expect(states()).toEqual(['v1:ARCHIVED', 'v2:PUBLISHED']);
  });

  it('should answer not found for an unknown version and for the draft', async () => {
    repository.seed(catalogDocument(), 1);
    repository.seed(catalogDocument(), DRAFT_VERSION, 'DRAFT');
    await expectFailure(service.rollback(7, 'admin-1'), AppErrorCode.S009);
    await expectFailure(service.rollback(DRAFT_VERSION, 'admin-1'), AppErrorCode.S009);
  });

  it('should give concurrent rollbacks distinct versions', async () => {
    repository.seed(catalogDocument(), 1, 'ARCHIVED');
    repository.seed(catalogDocument(), 2);
    const versions = await Promise.all([service.rollback(1, 'admin-1'), service.rollback(1, 'admin-2')]);
    expect(versions.map(row => row.version)).toEqual([3, 4]);
    expect(states()).toEqual(['v1:ARCHIVED', 'v2:ARCHIVED', 'v3:ARCHIVED', 'v4:PUBLISHED']);
  });
});

describe('catalogIssuesOf', () => {
  it('should read nothing from an error other than SYN_CATALOG_INVALID', () => {
    expect(catalogIssuesOf(AppErrorCode.SYN_CATALOG_CONFLICT.create())).toBeUndefined();
    expect(catalogIssuesOf(new TypeError('boom'))).toBeUndefined();
  });
});
