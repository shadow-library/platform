import { beforeEach, describe, expect, it } from 'bun:test';

import { AuthGuardErrorCode } from '@shadow-library/auth/module';
import { ServerErrorCode } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';

import { AliasImpactService } from '@modules/admin/alias-impact.service';
import { CatalogAdminController } from '@modules/admin/catalog-admin.controller';
import { catalogFingerprint } from '@modules/catalog/catalog-fingerprint';
import { CatalogVersionService } from '@modules/catalog/catalog-version.service';
import { type ActiveCatalogCache } from '@modules/catalog/active-catalog.cache';
import { type CatalogDocument } from '@modules/catalog/catalog.types';

import { catalogDocument } from '../catalog/catalog.fixtures';
import { FakeCatalogVersionRepository } from '../catalog/fake-catalog-version.repository';
import { asPrincipal, caller, expectFailure, fakeCache, fakeLedger, FakeReply, NOVEL_FORGE, userWith } from './admin.fixtures';

let repository: FakeCatalogVersionRepository;
let controller: CatalogAdminController;

beforeEach(() => {
  repository = new FakeCatalogVersionRepository();
  repository.seed(catalogDocument(), 1);
  const cache = { refreshNow: async () => undefined } as unknown as ActiveCatalogCache;
  controller = new CatalogAdminController(caller, new CatalogVersionService(repository.asRepository(), cache), new AliasImpactService(fakeCache(), fakeLedger()));
});

const withBudgets = (document: CatalogDocument): void => void document.budgets.push({ app: 'memoir', per: 'app', window: '1d', maxCalls: 5 });
const withProviderUrl = (document: CatalogDocument): void => void (document.providers.local!.url = 'http://ollama.other:11434');
const withLabel = (document: CatalogDocument): void => void (document.models['grok-4.6']!.label = 'Grok Four');
const withUnknownModel = (document: CatalogDocument): void => void (document.aliases.opus!.model = 'missing');

function save(role: Parameters<typeof userWith>[0], change: (document: CatalogDocument) => void, reply = new FakeReply()) {
  return asPrincipal(userWith(role), () => controller.saveDraft({ document: catalogDocument(change) as never, note: 'edit' }, reply.asResponse()));
}

describe('CatalogAdminController', () => {
  describe('principal kind', () => {
    it('should refuse a service principal on every admin route', async () => {
      const reply = new FakeReply().asResponse();
      const routes = {
        listVersions: () => controller.listVersions(),
        getVersion: () => controller.getVersion({ version: 1 }),
        getDraft: () => controller.getDraft(),
        saveDraft: () => controller.saveDraft({ document: {} }, reply),
        discardDraft: () => controller.discardDraft({ fingerprint: 'x' }),
        publishBudgets: () => controller.publishBudgets({ budgets: [], expectedVersion: 1 }, reply),
        validateDraft: () => controller.validateDraft(),
        diffDraft: () => controller.diffDraft(),
        publish: () => controller.publish({ fingerprint: 'x' }, reply),
        rollback: () => controller.rollback({ version: 1 }, reply),
        aliasImpact: () => controller.aliasImpact({ key: 'opus' }, {}),
      };

      for (const route of Object.values(routes)) {
        const error = await expectFailure(
          asPrincipal(NOVEL_FORGE, async () => route()),
          AuthGuardErrorCode.IAM_002,
        );
        expect(error.status).toBe(403);
      }
      expect(repository.rows.filter(row => row.state === 'DRAFT')).toHaveLength(0);
    });
  });

  describe('saveDraft', () => {
    it('should let an operator edit models and keep the draft', async () => {
      const saved = (await save('operator', withLabel)) as { fingerprint: string; issues: unknown[]; draft: { version: number; state: string } };

      expect(saved.issues).toEqual([]);
      expect(saved.draft).toMatchObject({ version: 0, state: 'DRAFT' });
      expect(saved.fingerprint).toBe(catalogFingerprint(repository.rows.find(row => row.state === 'DRAFT')!.document));
    });

    it('should refuse an operator who changes budgets and persist nothing', async () => {
      await expectFailure(save('operator', withBudgets), AuthGuardErrorCode.IAM_002);

      expect(repository.rows.filter(row => row.state === 'DRAFT')).toHaveLength(0);
    });

    it('should refuse an operator who changes providers', async () => {
      await expectFailure(save('operator', withProviderUrl), AuthGuardErrorCode.IAM_002);
    });

    it('should allow an admin to change budgets and providers', async () => {
      const saved = (await save('admin', document => (withBudgets(document), withProviderUrl(document)))) as { issues: unknown[] };

      expect(saved.issues).toEqual([]);
      expect(repository.rows.some(row => row.state === 'DRAFT')).toBe(true);
    });

    it('should refuse a viewer, who lacks catalog write', async () => {
      await expectFailure(save('viewer', withLabel), AuthGuardErrorCode.IAM_002);
    });

    it('should compare against the existing draft, so an operator can keep editing a draft an admin changed', async () => {
      await save('admin', withBudgets);

      const saved = (await save('operator', document => (withBudgets(document), withLabel(document)))) as { issues: unknown[] };

      expect(saved.issues).toEqual([]);
    });

    it('should refuse an operator who reverts an admin draft budget change', async () => {
      await save('admin', withBudgets);

      await expectFailure(
        save('operator', () => undefined),
        AuthGuardErrorCode.IAM_002,
      );
    });

    it('should pass the expected fingerprint through and refuse a stale save with a conflict', async () => {
      const first = (await save('admin', withLabel)) as { fingerprint: string };
      await save('admin', withBudgets);

      const error = await expectFailure(
        asPrincipal(userWith('admin'), () => controller.saveDraft({ document: catalogDocument() as never, expectedFingerprint: first.fingerprint }, new FakeReply().asResponse())),
        AppErrorCode.SYN_CATALOG_CONFLICT,
      );
      expect(error.status).toBe(409);
    });

    it('should refuse a save that expects no draft when one exists', async () => {
      await save('admin', withLabel);

      await expectFailure(
        asPrincipal(userWith('admin'), () => controller.saveDraft({ document: catalogDocument() as never, expectNoDraft: true }, new FakeReply().asResponse())),
        AppErrorCode.SYN_CATALOG_CONFLICT,
      );
    });

    it('should refuse a save that expects both a draft and none', async () => {
      await expectFailure(
        asPrincipal(userWith('admin'), () =>
          controller.saveDraft({ document: catalogDocument() as never, expectedFingerprint: 'x', expectNoDraft: true }, new FakeReply().asResponse()),
        ),
        AppErrorCode.SYN_INVALID_REQUEST,
      );
      expect(repository.rows.filter(row => row.state === 'DRAFT')).toHaveLength(0);
    });

    it('should pass the pinned active version through and refuse the save once another version is active', async () => {
      repository.seed(catalogDocument(), 1);
      const reply = new FakeReply().asResponse();
      const saved = await asPrincipal(userWith('admin'), () =>
        controller.saveDraft({ document: catalogDocument() as never, expectNoDraft: true, expectedActiveVersion: 1 }, reply),
      );
      expect(saved).toHaveProperty('fingerprint');
      await asPrincipal(userWith('admin'), () => controller.discardDraft({ fingerprint: (saved as { fingerprint: string }).fingerprint }));
      await asPrincipal(userWith('admin'), () => controller.publishBudgets({ budgets: catalogDocument().budgets as never, expectedVersion: 1 }, new FakeReply().asResponse()));

      await expectFailure(
        asPrincipal(userWith('admin'), () =>
          controller.saveDraft({ document: catalogDocument() as never, expectNoDraft: true, expectedActiveVersion: 1 }, new FakeReply().asResponse()),
        ),
        AppErrorCode.SYN_CATALOG_CONFLICT,
      );
    });

    it('should refuse a pinned active version without expectNoDraft', async () => {
      await expectFailure(
        asPrincipal(userWith('admin'), () => controller.saveDraft({ document: catalogDocument() as never, expectedActiveVersion: 1 }, new FakeReply().asResponse())),
        AppErrorCode.SYN_INVALID_REQUEST,
      );
      await expectFailure(
        asPrincipal(userWith('admin'), () =>
          controller.saveDraft({ document: catalogDocument() as never, expectedFingerprint: 'x', expectedActiveVersion: 1 }, new FakeReply().asResponse()),
        ),
        AppErrorCode.SYN_INVALID_REQUEST,
      );
    });

    it('should save an invalid document and report its issues instead of failing', async () => {
      const reply = new FakeReply();
      const saved = (await save('operator', withUnknownModel, reply)) as { issues: { code: string; path: string }[] };

      expect(reply.sent).toBe(false);
      expect(saved.issues).toContainEqual(expect.objectContaining({ code: 'unknown_model', path: 'aliases.opus.model' }));
      expect(repository.rows.some(row => row.state === 'DRAFT')).toBe(true);
    });
  });

  describe('publish', () => {
    it('should refuse a publish without a fingerprint', async () => {
      await save('admin', withLabel);

      for (const fingerprint of [undefined, '']) {
        await expectFailure(
          asPrincipal(userWith('admin'), () => controller.publish({ fingerprint } as never, new FakeReply().asResponse())),
          AppErrorCode.SYN_INVALID_REQUEST,
        );
      }
      expect(repository.published().map(row => row.version)).toEqual([1]);
    });

    it('should publish the draft the fingerprint names', async () => {
      const saved = (await save('admin', withLabel)) as { fingerprint: string };

      const published = await asPrincipal(userWith('admin'), () => controller.publish({ fingerprint: saved.fingerprint }, new FakeReply().asResponse()));

      expect(published).toMatchObject({ version: 2, state: 'PUBLISHED', createdBy: 'user-admin' });
    });

    it('should map a stale fingerprint to SYN_CATALOG_CONFLICT', async () => {
      const first = (await save('admin', withLabel)) as { fingerprint: string };
      await save('admin', document => (withLabel(document), withBudgets(document)));

      await expectFailure(
        asPrincipal(userWith('admin'), () => controller.publish({ fingerprint: first.fingerprint }, new FakeReply().asResponse())),
        AppErrorCode.SYN_CATALOG_CONFLICT,
      );
    });

    it('should render the issues of an invalid catalog in the 422 body', async () => {
      const saved = (await save('admin', withUnknownModel)) as { fingerprint: string };
      const reply = new FakeReply();

      await asPrincipal(userWith('admin'), () => controller.publish({ fingerprint: saved.fingerprint }, reply.asResponse()));

      expect(reply.statusCode).toBe(422);
      expect(reply.body).toMatchObject({ code: AppErrorCode.SYN_CATALOG_INVALID.code, issues: [expect.objectContaining({ code: 'unknown_model' })] });
      expect(repository.published().map(row => row.version)).toEqual([1]);
    });

    it('should leave other publish failures to the error handler', async () => {
      await expectFailure(
        asPrincipal(userWith('admin'), () => controller.publish({ fingerprint: 'abc' }, new FakeReply().asResponse())),
        ServerErrorCode.S009,
      );
    });
  });

  describe('discardDraft', () => {
    it('should discard the draft for an operator when it reverts only sections catalog write covers', async () => {
      const saved = (await save('operator', withLabel)) as { fingerprint: string };

      await asPrincipal(userWith('operator'), () => controller.discardDraft({ fingerprint: saved.fingerprint }));

      expect(repository.rows.filter(row => row.state === 'DRAFT')).toHaveLength(0);
    });

    it('should refuse an operator discarding a draft that changes budgets, as a save reverting them is refused', async () => {
      const saved = (await save('admin', withBudgets)) as { fingerprint: string };

      await expectFailure(
        asPrincipal(userWith('operator'), () => controller.discardDraft({ fingerprint: saved.fingerprint })),
        AuthGuardErrorCode.IAM_002,
      );
      expect(repository.rows.filter(row => row.state === 'DRAFT')).toHaveLength(1);
    });

    it('should let an admin discard a draft that changes budgets and providers', async () => {
      const saved = (await save('admin', document => (withBudgets(document), withProviderUrl(document)))) as { fingerprint: string };

      await asPrincipal(userWith('admin'), () => controller.discardDraft({ fingerprint: saved.fingerprint }));

      expect(repository.rows.filter(row => row.state === 'DRAFT')).toHaveLength(0);
    });

    it('should map a stale fingerprint to SYN_CATALOG_CONFLICT and a missing draft to not found', async () => {
      const first = (await save('operator', withLabel)) as { fingerprint: string };
      await save('operator', withUnknownModel);

      const error = await expectFailure(
        asPrincipal(userWith('operator'), () => controller.discardDraft({ fingerprint: first.fingerprint })),
        AppErrorCode.SYN_CATALOG_CONFLICT,
      );
      expect(error.status).toBe(409);

      repository.rows = repository.rows.filter(row => row.state !== 'DRAFT');
      await expectFailure(
        asPrincipal(userWith('operator'), () => controller.discardDraft({ fingerprint: first.fingerprint })),
        ServerErrorCode.S009,
      );
    });
  });

  describe('publishBudgets', () => {
    const budgets = catalogDocument(withBudgets).budgets as unknown as Record<string, unknown>[];

    it('should publish the budgets as a new version with the caller as its author', async () => {
      const published = await asPrincipal(userWith('finance'), () => controller.publishBudgets({ budgets, expectedVersion: 1 }, new FakeReply().asResponse()));

      expect(published).toMatchObject({ version: 2, state: 'PUBLISHED', note: 'Budgets updated', createdBy: 'user-finance' });
      expect(repository.published()[0]?.document).toEqual(catalogDocument(withBudgets));
    });

    it('should map a stale expected version to SYN_CATALOG_CONFLICT', async () => {
      const error = await expectFailure(
        asPrincipal(userWith('finance'), () => controller.publishBudgets({ budgets, expectedVersion: 7 }, new FakeReply().asResponse())),
        AppErrorCode.SYN_CATALOG_CONFLICT,
      );
      expect(error.status).toBe(409);
    });

    it('should render the issues of invalid budgets in the 422 body', async () => {
      const reply = new FakeReply();

      await asPrincipal(userWith('finance'), () =>
        controller.publishBudgets({ budgets: [{ app: 'ghost', per: 'app', window: '1d', maxCalls: 1 }], expectedVersion: 1 }, reply.asResponse()),
      );

      expect(reply.statusCode).toBe(422);
      expect(reply.body).toMatchObject({ code: AppErrorCode.SYN_CATALOG_INVALID.code, issues: [expect.objectContaining({ path: 'budgets[0].app', code: 'unknown_app' })] });
      expect(repository.published().map(row => row.version)).toEqual([1]);
    });
  });

  describe('rollback', () => {
    it('should publish a new version copied from the old one', async () => {
      const saved = (await save('admin', withLabel)) as { fingerprint: string };
      await asPrincipal(userWith('admin'), () => controller.publish({ fingerprint: saved.fingerprint }, new FakeReply().asResponse()));

      const rolledBack = await asPrincipal(userWith('admin'), () => controller.rollback({ version: 1 }, new FakeReply().asResponse()));

      expect(rolledBack).toMatchObject({ version: 3, note: 'Rollback to v1' });
    });

    it('should answer not found for a version that does not exist', async () => {
      await expectFailure(
        asPrincipal(userWith('admin'), () => controller.rollback({ version: 99 }, new FakeReply().asResponse())),
        ServerErrorCode.S009,
      );
    });
  });

  describe('reads', () => {
    it('should list versions without their documents and omit empty optional fields', async () => {
      const { items } = await asPrincipal(userWith('viewer'), () => controller.listVersions());

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ version: 1, state: 'PUBLISHED' });
      expect(items[0]).not.toHaveProperty('document');
      expect(items[0]).not.toHaveProperty('note');
    });

    it('should return a version with its document, and not found for an unknown one', async () => {
      const detail = await asPrincipal(userWith('viewer'), () => controller.getVersion({ version: 1 }));

      expect(detail.document).toEqual(catalogDocument());
      await expectFailure(
        asPrincipal(userWith('viewer'), () => controller.getVersion({ version: 7 })),
        ServerErrorCode.S009,
      );
    });

    it('should answer not found when there is no draft', async () => {
      await expectFailure(
        asPrincipal(userWith('viewer'), () => controller.getDraft()),
        ServerErrorCode.S009,
      );
      await expectFailure(
        asPrincipal(userWith('operator'), () => controller.validateDraft()),
        ServerErrorCode.S009,
      );
      await expectFailure(
        asPrincipal(userWith('viewer'), () => controller.diffDraft()),
        ServerErrorCode.S009,
      );
    });

    it('should return the draft with its fingerprint, validation and diff against the active catalog', async () => {
      await save('operator', document => (withLabel(document), withUnknownModel(document)));

      const draft = await asPrincipal(userWith('viewer'), () => controller.getDraft());
      const validation = await asPrincipal(userWith('operator'), () => controller.validateDraft());
      const diff = await asPrincipal(userWith('viewer'), () => controller.diffDraft());

      expect(draft.fingerprint).toHaveLength(64);
      expect(validation.valid).toBe(false);
      expect(validation.issues).toContainEqual(expect.objectContaining({ code: 'unknown_model' }));
      expect(diff.changed).toEqual(['models.grok-4.6.label', 'aliases.opus.model']);
      expect(diff.fingerprint).toBe(draft.fingerprint);
    });
  });
});
