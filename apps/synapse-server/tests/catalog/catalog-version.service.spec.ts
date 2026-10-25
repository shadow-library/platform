import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { AppError, type ErrorCode } from '@shadow-library/common';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';

import { AppErrorCode } from '@server/classes';

import { type ActiveCatalogCache } from '@modules/catalog/active-catalog.cache';
import { NO_VERSION } from '@modules/catalog/catalog-version.repository';
import { catalogIssuesOf, CatalogVersionService, type ChangeAuthorizer } from '@modules/catalog/catalog-version.service';
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

function outcomes(results: PromiseSettledResult<{ version: number }>[]): string[] {
  return results.map(result => (result.status === 'fulfilled' ? `v${result.value.version}` : AppError.is(result.reason) ? result.reason.code : 'unknown'));
}

const allowAll: ChangeAuthorizer = () => undefined;

function recording(seen: Set<CatalogSection>[]): ChangeAuthorizer {
  return changed => void seen.push(changed);
}

function refusing(refusal: AppError): ChangeAuthorizer {
  return () => {
    throw refusal;
  };
}

function withOpusMax(document: CatalogDocument): void {
  document.aliases.opus!.label = 'Opus Max';
}

function withoutPreview(document: CatalogDocument): void {
  delete document.aliases.preview;
  document.tasks['novel-forge.chat']!.aliases = ['opus', 'grok', 'llama'];
}

describe('CatalogVersionService.applyChange', () => {
  it('should publish the first catalog as version 1 when the caller expects none to be active', async () => {
    const published = await service.applyChange(catalogDocument(), null, 'baseline', 'admin-1', allowAll);

    expect({ version: published.version, state: published.state, note: published.note, createdBy: published.createdBy }).toEqual({
      version: 1,
      state: 'PUBLISHED',
      note: 'baseline',
      createdBy: 'admin-1',
    });
    expect(published.publishedAt).toBeInstanceOf(Date);
    expect(refreshes).toBe(1);
  });

  it('should archive the active version and publish the change as the next one', async () => {
    repository.seed(catalogDocument(), 1, 'ARCHIVED');
    repository.seed(catalogDocument(), 2);

    const published = await service.applyChange(catalogDocument(withOpusMax), 2, undefined, 'operator-1', allowAll);

    expect({ version: published.version, document: published.document, createdBy: published.createdBy }).toEqual({
      version: 3,
      document: catalogDocument(withOpusMax),
      createdBy: 'operator-1',
    });
    expect(states()).toEqual(['v1:ARCHIVED', 'v2:ARCHIVED', 'v3:PUBLISHED']);
    expect(refreshes).toBe(1);
  });

  it('should store a plain default note when the caller gives none or a blank one', async () => {
    repository.seed(catalogDocument(), 1);

    const unnoted = await service.applyChange(catalogDocument(withOpusMax), 1, undefined, 'operator-1', allowAll);
    const blank = await service.applyChange(catalogDocument(), 2, '   ', 'operator-1', allowAll);

    expect([unnoted.note, blank.note]).toEqual(['Catalog change', 'Catalog change']);
  });

  it('should refuse a stale expected version and leave the catalog untouched', async () => {
    repository.seed(catalogDocument(), 1, 'ARCHIVED');
    repository.seed(catalogDocument(), 2);

    await expectFailure(service.applyChange(catalogDocument(withOpusMax), 1, undefined, 'operator-1', allowAll), AppErrorCode.SYN_CATALOG_CONFLICT);

    expect(states()).toEqual(['v1:ARCHIVED', 'v2:PUBLISHED']);
    expect(refreshes).toBe(0);
  });

  it('should refuse expecting no active version once one is active, and expecting one when none is', async () => {
    await expectFailure(service.applyChange(catalogDocument(), 1, undefined, 'admin-1', allowAll), AppErrorCode.SYN_CATALOG_CONFLICT);
    repository.seed(catalogDocument(), 1);

    await expectFailure(service.applyChange(catalogDocument(withOpusMax), null, undefined, 'admin-1', allowAll), AppErrorCode.SYN_CATALOG_CONFLICT);

    expect(states()).toEqual(['v1:PUBLISHED']);
  });

  it('should publish nothing and return the active version for a document equal to it, whatever its key order', async () => {
    const active = repository.seed(catalogDocument(), 1);
    const reordered = Object.fromEntries(Object.entries(catalogDocument()).reverse());

    const answered = await service.applyChange(reordered, 1, 'no-op', 'operator-1', allowAll);

    expect(answered).toBe(active);
    expect(states()).toEqual(['v1:PUBLISHED']);
    expect(refreshes).toBe(0);
  });

  it('should still require the caller to be authorised for a change that publishes nothing', async () => {
    repository.seed(catalogDocument(), 1);
    const refusal = AppErrorCode.SEC_003.create();

    expect(await failure(service.applyChange(catalogDocument(), 1, undefined, 'viewer-1', refusing(refusal)))).toBe(refusal);
  });

  it('should let exactly one of two concurrent changes against the same version succeed', async () => {
    repository.seed(catalogDocument(), 1);

    const results = await Promise.allSettled([
      service.applyChange(catalogDocument(withOpusMax), 1, undefined, 'operator-1', allowAll),
      service.applyChange(catalogDocument(withoutPreview), 1, undefined, 'operator-2', allowAll),
    ]);

    expect(outcomes(results)).toEqual(['v2', AppErrorCode.SYN_CATALOG_CONFLICT.code]);
    expect(states()).toEqual(['v1:ARCHIVED', 'v2:PUBLISHED']);
  });

  it('should authorise against the sections changed relative to the active document', async () => {
    repository.seed(catalogDocument(), 1);
    const seen: Set<CatalogSection>[] = [];
    const next = catalogDocument(document => {
      withOpusMax(document);
      document.budgets[0]!.maxCalls = 10;
    });

    await service.applyChange(next, 1, undefined, 'admin-1', recording(seen));

    expect(seen).toEqual([new Set<CatalogSection>(['aliases', 'budgets'])]);
  });

  it('should authorise every non-empty section of the first catalog', async () => {
    const seen: Set<CatalogSection>[] = [];

    await service.applyChange(catalogDocument(), null, undefined, 'admin-1', recording(seen));

    expect(seen).toEqual([new Set<CatalogSection>(['providers', 'models', 'aliases', 'tasks', 'budgets'])]);
  });

  it('should authorise against the active document re-read under the lock', async () => {
    repository.seed(catalogDocument(), 1);
    repository.beforeExclusive = () => (repository.published()[0]!.document = catalogDocument(withOpusMax));
    const seen: Set<CatalogSection>[] = [];

    await service.applyChange(catalogDocument(withOpusMax), 1, undefined, 'operator-1', recording(seen));

    expect(seen).toEqual([new Set<CatalogSection>()]);
  });

  it('should refuse a stale change before asking the authorizer', async () => {
    repository.seed(catalogDocument(), 2);
    const seen: Set<CatalogSection>[] = [];

    await expectFailure(service.applyChange(catalogDocument(withOpusMax), 1, undefined, 'operator-1', recording(seen)), AppErrorCode.SYN_CATALOG_CONFLICT);

    expect(seen).toEqual([]);
  });

  it('should abort the change when authorisation throws', async () => {
    repository.seed(catalogDocument(), 1);
    const refusal = AppErrorCode.SEC_003.create();

    const error = await failure(service.applyChange(catalogDocument(withOpusMax), 1, undefined, 'viewer-1', refusing(refusal)));

    expect(error).toBe(refusal);
    expect(states()).toEqual(['v1:PUBLISHED']);
    expect(refreshes).toBe(0);
  });

  it('should refuse an invalid document with its issues, judged against the active one, and leave the catalog untouched', async () => {
    repository.seed(catalogDocument(), 1);

    const error = await expectFailure(service.applyChange(catalogDocument(withoutPreview), 1, undefined, 'operator-1', allowAll), AppErrorCode.SYN_CATALOG_INVALID);

    expect(catalogIssuesOf(error)?.map(issue => `${issue.path}:${issue.code}`)).toEqual(['aliases.preview:alias_removed']);
    expect(states()).toEqual(['v1:PUBLISHED']);
    expect(refreshes).toBe(0);
  });

  it('should refuse a document that is not an object', async () => {
    const error = await expectFailure(service.applyChange([catalogDocument()], null, undefined, 'admin-1', allowAll), AppErrorCode.SYN_CATALOG_INVALID);

    expect(catalogIssuesOf(error)?.length).toBeGreaterThan(0);
    expect(repository.rows).toHaveLength(0);
  });

  it('should fail closed when the published document no longer parses', async () => {
    repository.seed({ providers: {} }, 1);

    const error = await failure(service.applyChange(catalogDocument(), 1, undefined, 'admin-1', allowAll));

    expect(error.isInternal).toBe(true);
  });

  it('should ignore a draft row the removed draft workflow left behind', async () => {
    const leftover = repository.seed(catalogDocument(withOpusMax), NO_VERSION, 'DRAFT');

    await service.applyChange(catalogDocument(), null, undefined, 'admin-1', allowAll);
    const second = await service.applyChange(catalogDocument(withoutPreview), 1, undefined, 'admin-1', allowAll).catch((error: unknown) => error);

    expect(AppError.is(second, AppErrorCode.SYN_CATALOG_INVALID)).toBe(true);
    expect(states()).toEqual(['v0:DRAFT', 'v1:PUBLISHED']);
    expect(repository.rows.find(row => row.state === 'DRAFT')).toEqual(leftover);
    expect((await service.listVersions()).map(row => row.state)).toEqual(['PUBLISHED']);
    expect(await service.getVersion(NO_VERSION)).toBeNull();
  });
});

describe('CatalogVersionService.rollback', () => {
  it('should copy the old document into a new published version', async () => {
    const original = catalogDocument();
    repository.seed(original, 1, 'ARCHIVED');
    repository.seed(catalogDocument(withOpusMax), 2);

    const published = await service.rollback(1, 2, 'admin-1', allowAll);

    expect({ version: published.version, document: published.document, note: published.note, createdBy: published.createdBy }).toEqual({
      version: 3,
      document: original,
      note: 'Rollback to v1',
      createdBy: 'admin-1',
    });
    expect(states()).toEqual(['v1:ARCHIVED', 'v2:ARCHIVED', 'v3:PUBLISHED']);
    expect(refreshes).toBe(1);
  });

  it('should refuse when another version became active since the caller looked, so an undo never reverts a newer change', async () => {
    repository.seed(catalogDocument(), 1, 'ARCHIVED');
    repository.seed(catalogDocument(withOpusMax), 2, 'ARCHIVED');
    repository.seed(catalogDocument(withOpusMax), 3);

    await expectFailure(service.rollback(1, 2, 'admin-1', allowAll), AppErrorCode.SYN_CATALOG_CONFLICT);

    expect(states()).toEqual(['v1:ARCHIVED', 'v2:ARCHIVED', 'v3:PUBLISHED']);
    expect(refreshes).toBe(0);
  });

  it('should publish nothing when restoring the active version or a document equal to it', async () => {
    repository.seed(catalogDocument(), 1, 'ARCHIVED');
    const active = repository.seed(catalogDocument(), 2);

    expect(await service.rollback(2, 2, 'admin-1', allowAll)).toBe(active);
    expect(await service.rollback(1, 2, 'admin-1', allowAll)).toBe(active);
    expect(states()).toEqual(['v1:ARCHIVED', 'v2:PUBLISHED']);
    expect(refreshes).toBe(0);
  });

  it('should authorise the sections that differ between the active and restored documents', async () => {
    repository.seed(catalogDocument(), 1, 'ARCHIVED');
    repository.seed(
      catalogDocument(document => (document.providers.openrouter!.url = 'https://openrouter.example/api/v1')),
      2,
    );
    const seen: Set<CatalogSection>[] = [];

    await service.rollback(1, 2, 'admin-1', recording(seen));

    expect(seen).toEqual([new Set<CatalogSection>(['providers'])]);
  });

  it('should restore nothing when authorisation throws', async () => {
    repository.seed(catalogDocument(), 1, 'ARCHIVED');
    repository.seed(catalogDocument(withOpusMax), 2);
    const refusal = AppErrorCode.SEC_003.create();

    expect(await failure(service.rollback(1, 2, 'operator-1', refusing(refusal)))).toBe(refusal);
    expect(states()).toEqual(['v1:ARCHIVED', 'v2:PUBLISHED']);
  });

  it('should refuse to restore a document that drops an alias published since', async () => {
    repository.seed(catalogDocument(withoutPreview), 1, 'ARCHIVED');
    repository.seed(catalogDocument(), 2);

    const error = await expectFailure(service.rollback(1, 2, 'admin-1', allowAll), AppErrorCode.SYN_CATALOG_INVALID);

    expect(catalogIssuesOf(error)?.map(issue => issue.code)).toEqual(['alias_removed']);
    expect(states()).toEqual(['v1:ARCHIVED', 'v2:PUBLISHED']);
  });

  it('should answer not found for an unknown version and for a leftover draft row', async () => {
    repository.seed(catalogDocument(), 1);
    repository.seed(catalogDocument(withOpusMax), NO_VERSION, 'DRAFT');

    await expectFailure(service.rollback(7, 1, 'admin-1', allowAll), AppErrorCode.S009);
    await expectFailure(service.rollback(NO_VERSION, 1, 'admin-1', allowAll), AppErrorCode.S009);
  });

  it('should let exactly one of two concurrent rollbacks against the same version succeed', async () => {
    repository.seed(catalogDocument(), 1, 'ARCHIVED');
    repository.seed(catalogDocument(withOpusMax), 2);

    const results = await Promise.allSettled([service.rollback(1, 2, 'admin-1', allowAll), service.rollback(1, 2, 'admin-2', allowAll)]);

    expect(outcomes(results)).toEqual(['v3', AppErrorCode.SYN_CATALOG_CONFLICT.code]);
    expect(states()).toEqual(['v1:ARCHIVED', 'v2:ARCHIVED', 'v3:PUBLISHED']);
  });
});

const APP_BUDGET: CatalogDocument['budgets'][number] = { app: 'novel-forge', per: 'app', window: '1d', maxCalls: 5 };

describe('CatalogVersionService.publishBudgets', () => {
  const budgets = [...catalogDocument().budgets, APP_BUDGET];

  it('should publish the active document with only its budgets replaced, as the next version', async () => {
    repository.seed(catalogDocument(withOpusMax), 1);

    const published = await service.publishBudgets(budgets, 1, undefined, 'finance-1');

    expect({ version: published.version, document: published.document, note: published.note, createdBy: published.createdBy }).toEqual({
      version: 2,
      document: { ...catalogDocument(withOpusMax), budgets },
      note: 'Budgets updated',
      createdBy: 'finance-1',
    });
    expect(states()).toEqual(['v1:ARCHIVED', 'v2:PUBLISHED']);
    expect(refreshes).toBe(1);
  });

  it('should store the note the caller gave', async () => {
    repository.seed(catalogDocument(), 1);

    expect((await service.publishBudgets(budgets, 1, 'Raise novel-forge limits', 'finance-1')).note).toBe('Raise novel-forge limits');
  });

  it('should refuse a stale expected version and leave the catalog untouched', async () => {
    repository.seed(catalogDocument(), 1, 'ARCHIVED');
    repository.seed(catalogDocument(), 2);

    await expectFailure(service.publishBudgets(budgets, 1, undefined, 'finance-1'), AppErrorCode.SYN_CATALOG_CONFLICT);

    expect(states()).toEqual(['v1:ARCHIVED', 'v2:PUBLISHED']);
    expect(refreshes).toBe(0);
  });

  it('should refuse when nothing has been published yet', async () => {
    await expectFailure(service.publishBudgets(budgets, 1, undefined, 'finance-1'), AppErrorCode.SYN_CATALOG_CONFLICT);

    expect(repository.rows).toHaveLength(0);
  });

  it('should let exactly one of two publishers against the same version succeed', async () => {
    repository.seed(catalogDocument(), 1);

    const results = await Promise.allSettled([service.publishBudgets(budgets, 1, undefined, 'finance-1'), service.publishBudgets([], 1, undefined, 'finance-2')]);

    expect(outcomes(results)).toEqual(['v2', AppErrorCode.SYN_CATALOG_CONFLICT.code]);
  });

  it('should refuse invalid budgets with their issues and leave the catalog untouched', async () => {
    repository.seed(catalogDocument(), 1);

    const error = await expectFailure(service.publishBudgets([{ app: 'ghost', per: 'app', window: '1d' }], 1, undefined, 'finance-1'), AppErrorCode.SYN_CATALOG_INVALID);

    expect(catalogIssuesOf(error)?.map(issue => `${issue.path}:${issue.code}`)).toEqual(['budgets[0]:budget_without_limit', 'budgets[0].app:unknown_app']);
    expect(states()).toEqual(['v1:PUBLISHED']);
  });

  it('should refuse budgets that are not a list', async () => {
    repository.seed(catalogDocument(), 1);

    const error = await expectFailure(service.publishBudgets({ app: 'novel-forge' }, 1, undefined, 'finance-1'), AppErrorCode.SYN_CATALOG_INVALID);

    expect(catalogIssuesOf(error)?.map(issue => issue.path)).toEqual(['budgets']);
  });

  it('should check the whole document against the active one, credentials included', async () => {
    const credential = '00000000-0000-4000-8000-000000000001';
    const withCredential = (document: CatalogDocument): void => {
      delete document.providers.openrouter!.apiKeyConfig;
      document.providers.openrouter!.credential = credential;
    };
    repository.seed(catalogDocument(withCredential), 1);
    repository.credentials = [{ id: credential, allowedOrigin: 'https://openrouter.ai', revoked: true }];

    const error = await expectFailure(service.publishBudgets(budgets, 1, undefined, 'finance-1'), AppErrorCode.SYN_CATALOG_INVALID);

    expect(catalogIssuesOf(error)?.map(issue => issue.code)).toEqual(['credential_revoked']);
  });

  it('should publish nothing for budgets identical to the active ones', async () => {
    const active = repository.seed(catalogDocument(), 1);

    expect(await service.publishBudgets(catalogDocument().budgets, 1, undefined, 'finance-1')).toBe(active);
    expect(states()).toEqual(['v1:PUBLISHED']);
    expect(refreshes).toBe(0);
  });
});

describe('catalogIssuesOf', () => {
  it('should read nothing from an error other than SYN_CATALOG_INVALID', () => {
    expect(catalogIssuesOf(AppErrorCode.SYN_CATALOG_CONFLICT.create())).toBeUndefined();
    expect(catalogIssuesOf(new TypeError('boom'))).toBeUndefined();
  });
});

describe('CatalogVersionService credential rules', () => {
  const CREDENTIAL = '00000000-0000-4000-8000-000000000001';

  function withCredential(document: CatalogDocument): void {
    delete document.providers.openrouter!.apiKeyConfig;
    document.providers.openrouter!.credential = CREDENTIAL;
  }

  beforeEach(() => void repository.seed(catalogDocument(), 1));

  it('should apply a change whose provider names a live credential bound to its origin', async () => {
    repository.credentials = [{ id: CREDENTIAL, allowedOrigin: 'https://openrouter.ai', revoked: false }];

    expect((await service.applyChange(catalogDocument(withCredential), 1, undefined, 'admin-1', allowAll)).version).toBe(2);
  });

  it('should refuse a change naming a revoked credential', async () => {
    repository.credentials = [{ id: CREDENTIAL, allowedOrigin: 'https://openrouter.ai', revoked: true }];

    const error = await expectFailure(service.applyChange(catalogDocument(withCredential), 1, undefined, 'admin-1', allowAll), AppErrorCode.SYN_CATALOG_INVALID);

    expect(catalogIssuesOf(error)).toEqual([{ path: 'providers.openrouter.credential', code: 'credential_revoked', message: expect.any(String) }]);
  });

  it('should refuse a change naming a credential that does not exist', async () => {
    const error = await expectFailure(service.applyChange(catalogDocument(withCredential), 1, undefined, 'admin-1', allowAll), AppErrorCode.SYN_CATALOG_INVALID);

    expect(catalogIssuesOf(error)?.map(issue => issue.code)).toEqual(['unknown_credential']);
  });

  it('should refuse a provider whose URL left the origin its credential is bound to', async () => {
    repository.credentials = [{ id: CREDENTIAL, allowedOrigin: 'https://openrouter.ai', revoked: false }];
    const moved = (document: CatalogDocument): void => {
      withCredential(document);
      document.providers.openrouter!.url = 'https://collector.example/api/v1';
    };

    const error = await expectFailure(service.applyChange(catalogDocument(moved), 1, undefined, 'admin-1', allowAll), AppErrorCode.SYN_CATALOG_INVALID);

    expect(catalogIssuesOf(error)?.map(issue => `${issue.path}:${issue.code}`)).toEqual(['providers.openrouter.url:credential_origin_mismatch']);
  });

  it('should refuse to roll back to a version whose credential has since been revoked', async () => {
    repository.rows = [];
    repository.credentials = [{ id: CREDENTIAL, allowedOrigin: 'https://openrouter.ai', revoked: true }];
    repository.seed(catalogDocument(withCredential), 1, 'ARCHIVED');
    repository.seed(catalogDocument(), 2);

    await expectFailure(service.rollback(1, 2, 'admin-1', allowAll), AppErrorCode.SYN_CATALOG_INVALID);

    expect(states()).toEqual(['v1:ARCHIVED', 'v2:PUBLISHED']);
  });
});

describe('CatalogVersionService deprecated apiKeyConfig binding', () => {
  it('should refuse a provider that would send the env key outside its bound origin', async () => {
    repository.seed(catalogDocument(), 1);
    const exfiltrate = (document: CatalogDocument): void => void (document.providers.openrouter!.url = 'https://evil.example/api/v1');

    const error = await expectFailure(service.applyChange(catalogDocument(exfiltrate), 1, undefined, 'admin-1', allowAll), AppErrorCode.SYN_CATALOG_INVALID);

    expect(catalogIssuesOf(error)?.map(issue => `${issue.path}:${issue.code}`)).toEqual(['providers.openrouter.url:credential_origin_mismatch']);
  });
});
