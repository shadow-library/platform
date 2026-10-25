import { beforeEach, describe, expect, it } from 'bun:test';

import { AuthGuardErrorCode } from '@shadow-library/auth/module';
import { ServerErrorCode } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';

import { AliasImpactService } from '@modules/admin/alias-impact.service';
import { CatalogAdminController } from '@modules/admin/catalog-admin.controller';
import { CatalogVersionService } from '@modules/catalog/catalog-version.service';
import { type ActiveCatalogCache } from '@modules/catalog/active-catalog.cache';
import { NO_VERSION } from '@modules/catalog/catalog-version.repository';
import { type CatalogDocument } from '@modules/catalog/catalog.types';

import { catalogDocument } from '../catalog/catalog.fixtures';
import { FakeCatalogVersionRepository } from '../catalog/fake-catalog-version.repository';
import { asPrincipal, caller, checkOptions, directory, editorName, expectFailure, fakeCache, fakeLedger, FakeReply, NOVEL_FORGE, userWith } from './admin.fixtures';

let repository: FakeCatalogVersionRepository;
let controller: CatalogAdminController;

beforeEach(() => {
  repository = new FakeCatalogVersionRepository();
  repository.seed(catalogDocument(), 1);
  const cache = { refreshNow: async () => undefined } as unknown as ActiveCatalogCache;
  controller = new CatalogAdminController(caller, new CatalogVersionService(repository.asRepository(), cache), new AliasImpactService(fakeCache(), fakeLedger()), directory);
});

const withBudgets = (document: CatalogDocument): void => void document.budgets.push({ app: 'memoir', per: 'app', window: '1d', maxCalls: 5 });
const withProviderUrl = (document: CatalogDocument): void => void (document.providers.local!.url = 'http://ollama.other:11434');
const withLabel = (document: CatalogDocument): void => void (document.models['grok-4.6']!.label = 'Grok Four');
const withUnknownModel = (document: CatalogDocument): void => void (document.aliases.opus!.model = 'missing');

type Role = Parameters<typeof userWith>[0];

function apply(role: Role, change: (document: CatalogDocument) => void, options: { expectedVersion?: number | null; note?: string; reply?: FakeReply } = {}) {
  const body = { document: catalogDocument(change) as never, expectedVersion: options.expectedVersion === undefined ? 1 : options.expectedVersion, note: options.note };
  return asPrincipal(userWith(role), () => controller.applyChange(body, (options.reply ?? new FakeReply()).asResponse()));
}

function rollback(role: Role, version: number, expectedVersion: number, reply = new FakeReply()) {
  return asPrincipal(userWith(role), () => controller.rollback({ version }, { expectedVersion }, reply.asResponse()));
}

function liveVersions(): number[] {
  return repository.published().map(row => row.version);
}

describe('CatalogAdminController', () => {
  describe('principal kind', () => {
    it('should refuse a service principal on every admin route', async () => {
      const reply = new FakeReply().asResponse();
      const routes = {
        listVersions: () => controller.listVersions(),
        getVersion: () => controller.getVersion({ version: 1 }),
        applyChange: () => controller.applyChange({ document: {}, expectedVersion: 1 }, reply),
        publishBudgets: () => controller.publishBudgets({ budgets: [], expectedVersion: 1 }, reply),
        rollback: () => controller.rollback({ version: 1 }, { expectedVersion: 1 }, reply),
        aliasImpact: () => controller.aliasImpact({ key: 'opus' }, {}),
      };

      for (const route of Object.values(routes)) {
        const error = await expectFailure(
          asPrincipal(NOVEL_FORGE, async () => route()),
          AuthGuardErrorCode.IAM_002,
        );
        expect(error.status).toBe(403);
      }
      expect(liveVersions()).toEqual([1]);
    });
  });

  describe('applyChange', () => {
    it('should publish an operator model change as the next version with the caller as its named author', async () => {
      const published = await apply('operator', withLabel, { note: 'Rename Grok' });

      expect(published).toMatchObject({ version: 2, state: 'PUBLISHED', note: 'Rename Grok', createdBy: userWith('operator').sub, createdByName: editorName('operator') });
      expect(repository.published()[0]?.document).toEqual(catalogDocument(withLabel));
    });

    it('should refuse an operator who changes budgets and publish nothing', async () => {
      await expectFailure(apply('operator', withBudgets), AuthGuardErrorCode.IAM_002);

      expect(liveVersions()).toEqual([1]);
    });

    it('should refuse an operator who changes providers', async () => {
      await expectFailure(apply('operator', withProviderUrl), AuthGuardErrorCode.IAM_002);
    });

    it('should let an admin change budgets and providers', async () => {
      const published = await apply('admin', document => (withBudgets(document), withProviderUrl(document)));

      expect(published).toMatchObject({ version: 2 });
    });

    it('should refuse a viewer, who lacks catalog write', async () => {
      await expectFailure(apply('viewer', withLabel), AuthGuardErrorCode.IAM_002);
    });

    it('should check provider and budget writes against the short high-risk cache', async () => {
      checkOptions.length = 0;

      await apply('admin', withLabel);

      expect(checkOptions).toEqual(
        expect.arrayContaining([
          { action: 'synapse:catalog:write', highRisk: false },
          { action: 'synapse:providers:write', highRisk: true },
          { action: 'synapse:budgets:write', highRisk: true },
        ]),
      );
    });

    it('should map a stale expected version to a 409 conflict and publish nothing', async () => {
      await apply('admin', withLabel);

      const error = await expectFailure(apply('admin', withBudgets), AppErrorCode.SYN_CATALOG_CONFLICT);

      expect(error.status).toBe(409);
      expect(liveVersions()).toEqual([2]);
    });

    it('should answer the active version and publish nothing for a document equal to it', async () => {
      const answered = await apply('operator', () => undefined);

      expect(answered).toMatchObject({ version: 1, state: 'PUBLISHED', createdBy: 'seed', createdByName: null });
      expect(repository.rows).toHaveLength(1);
    });

    it('should publish the first catalog against no active version', async () => {
      repository.rows = [];

      const published = await apply('admin', () => undefined, { expectedVersion: null });

      expect(published).toMatchObject({ version: 1, note: 'Catalog change' });
    });

    it('should render the issues of an invalid document in the 422 body', async () => {
      const reply = new FakeReply();

      await apply('operator', withUnknownModel, { reply });

      expect(reply.statusCode).toBe(422);
      expect(reply.body).toMatchObject({ code: AppErrorCode.SYN_CATALOG_INVALID.code, issues: [expect.objectContaining({ code: 'unknown_model', path: 'aliases.opus.model' })] });
      expect(liveVersions()).toEqual([1]);
    });
  });

  describe('publishBudgets', () => {
    const budgets = catalogDocument(withBudgets).budgets as unknown as Record<string, unknown>[];

    it('should publish the budgets as a new version with the caller as its author', async () => {
      const published = await asPrincipal(userWith('finance'), () => controller.publishBudgets({ budgets, expectedVersion: 1 }, new FakeReply().asResponse()));

      expect(published).toMatchObject({ version: 2, state: 'PUBLISHED', note: 'Budgets updated', createdBy: userWith('finance').sub, createdByName: editorName('finance') });
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
      expect(liveVersions()).toEqual([1]);
    });
  });

  describe('rollback', () => {
    it('should publish a new version copied from the old one', async () => {
      await apply('operator', withLabel);

      const rolledBack = await rollback('operator', 1, 2);

      expect(rolledBack).toMatchObject({ version: 3, note: 'Rollback to v1', createdByName: editorName('operator') });
      expect(repository.published()[0]?.document).toEqual(catalogDocument());
    });

    it('should map a stale expected version to a 409 conflict, so an undo never reverts a newer change', async () => {
      await apply('operator', withLabel);
      await apply('operator', document => (withLabel(document), (document.aliases.opus!.label = 'Opus Max')), { expectedVersion: 2 });

      const error = await expectFailure(rollback('operator', 1, 2), AppErrorCode.SYN_CATALOG_CONFLICT);

      expect(error.status).toBe(409);
      expect(liveVersions()).toEqual([3]);
    });

    it('should refuse an operator restoring a version whose providers or budgets differ from the active ones', async () => {
      await apply('admin', withBudgets);

      await expectFailure(rollback('operator', 1, 2), AuthGuardErrorCode.IAM_002);

      expect(liveVersions()).toEqual([2]);
    });

    it('should let an admin restore a version whose budgets differ', async () => {
      await apply('admin', withBudgets);

      expect(await rollback('admin', 1, 2)).toMatchObject({ version: 3 });
    });

    it('should refuse a viewer, who lacks catalog write', async () => {
      await apply('operator', withLabel);

      await expectFailure(rollback('viewer', 1, 2), AuthGuardErrorCode.IAM_002);
    });

    it('should answer the active version and publish nothing when restoring it', async () => {
      expect(await rollback('operator', 1, 1)).toMatchObject({ version: 1 });
      expect(repository.rows).toHaveLength(1);
    });

    it('should answer not found for a version that does not exist', async () => {
      await expectFailure(rollback('admin', 99, 1), ServerErrorCode.S009);
    });
  });

  describe('reads', () => {
    it('should list versions without their documents and omit empty optional fields', async () => {
      const { items } = await asPrincipal(userWith('viewer'), () => controller.listVersions());

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ version: 1, state: 'PUBLISHED', createdBy: 'seed', createdByName: null });
      expect(items[0]).not.toHaveProperty('document');
      expect(items[0]).not.toHaveProperty('note');
    });

    it('should never list or return a draft row the removed draft workflow left', async () => {
      repository.seed(catalogDocument(withLabel), NO_VERSION, 'DRAFT');

      const { items } = await asPrincipal(userWith('viewer'), () => controller.listVersions());

      expect(items.map(item => item.state)).toEqual(['PUBLISHED']);
    });

    it('should return a version with its document, and not found for an unknown one', async () => {
      const detail = await asPrincipal(userWith('viewer'), () => controller.getVersion({ version: 1 }));

      expect(detail.document).toEqual(catalogDocument());
      await expectFailure(
        asPrincipal(userWith('viewer'), () => controller.getVersion({ version: 7 })),
        ServerErrorCode.S009,
      );
    });
  });
});
