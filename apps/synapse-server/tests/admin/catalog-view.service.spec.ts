import { describe, expect, it } from 'bun:test';

import { type CatalogAppResponse, type CatalogTaskResponse } from '@shadow-library/synapse';

import { AppErrorCode } from '@server/classes';

import { parseSelectors } from '@modules/admin/catalog-selectors';
import { CatalogViewService } from '@modules/admin/catalog-view.service';

import { catalogDocument } from '../catalog/catalog.fixtures';
import { expectFailure, fakeCache } from './admin.fixtures';

const service = new CatalogViewService(fakeCache());

function taskView(task: string, selectors = ''): CatalogTaskResponse {
  return service.view('novel-forge', task, parseSelectors(selectors)).body as CatalogTaskResponse;
}

describe('CatalogViewService', () => {
  it('should answer one task with the default model of the route the selectors pick', () => {
    const view = taskView('novel-forge.chat', 'tier:economy');

    expect(view.catalog_version).toBe(3);
    expect(view.task).toBe('novel-forge.chat');
    expect(view.default).toMatchObject({ model: 'grok-4.6', label: 'Grok 4.6', price: { input: 2, output: 6 } });
    expect(view.default.capabilities.reasoning).toBe('mandatory');
  });

  it('should fall back to the default route when no selector matches', () => {
    expect(taskView('novel-forge.chat').default.model).toBe('claude-opus-5.5');
    expect(taskView('novel-forge.chat', 'tier:unknown').default.model).toBe('claude-opus-5.5');
  });

  it('should list only the active aliases the task accepts and the selectors allow', () => {
    expect(taskView('novel-forge.chat').aliases.map(alias => alias.key)).toEqual(['opus']);
    expect(taskView('novel-forge.chat', 'content_mode:standard').aliases.map(alias => alias.key)).toEqual(['opus', 'grok']);
    expect(taskView('novel-forge.chat', 'content_mode:other').aliases.map(alias => alias.key)).toEqual(['opus']);
  });

  it('should show an alias label with the model version only when the alias opts in', () => {
    const document = catalogDocument(draft => {
      draft.aliases.opus!.showVersion = true;
      draft.aliases.opus!.description = 'The flagship';
    });
    const view = new CatalogViewService(fakeCache(document)).view('novel-forge', 'novel-forge.chat', {}).body as CatalogTaskResponse;

    expect(view.aliases[0]).toMatchObject({ key: 'opus', label: 'Opus 5.5', description: 'The flagship', state: 'active', price: { input: 5, cachedInput: 0.5, output: 25 } });
  });

  it('should report native web search from the first eligible deployment provider', () => {
    expect(taskView('novel-forge.chat').native_web_search).toBe(true);
    expect(taskView('novel-forge.chat', 'tier:economy').native_web_search).toBe(false);
  });

  it("should report each alias's target model and native web search from its own model's first eligible deployment", () => {
    const aliases = taskView('novel-forge.chat', 'tier:economy,content_mode:standard').aliases;

    expect(aliases.map(({ key, model, native_web_search }) => ({ key, model, native_web_search }))).toEqual([
      { key: 'opus', model: 'claude-opus-5.5', native_web_search: true },
      { key: 'grok', model: 'grok-4.6', native_web_search: false },
    ]);
  });

  it("should judge an alias's native web search after the data policy filters its deployments", () => {
    const document = catalogDocument(draft => {
      draft.tasks['novel-forge.chat']!.dataPolicy = 'in_cluster_only';
      draft.models['claude-opus-5.5']!.deployments = [
        { provider: 'subscription', id: 'a' },
        { provider: 'local', id: 'b' },
      ];
    });

    const view = new CatalogViewService(fakeCache(document)).view('novel-forge', 'novel-forge.chat', {}).body as CatalogTaskResponse;

    expect(view.aliases[0]).toMatchObject({ key: 'opus', native_web_search: false });
  });

  it('should skip a deployment the data policy rules out when judging native web search', () => {
    const document = catalogDocument(draft => {
      draft.tasks['novel-forge.chat']!.dataPolicy = 'in_cluster_only';
      draft.models['claude-opus-5.5']!.deployments = [
        { provider: 'subscription', id: 'a' },
        { provider: 'local', id: 'b' },
      ];
    });

    const view = new CatalogViewService(fakeCache(document)).view('novel-forge', 'novel-forge.chat', {}).body as CatalogTaskResponse;

    expect(view.native_web_search).toBe(false);
  });

  it('should answer every task of the calling app, and only those, when no task is given', () => {
    const view = service.view('novel-forge', undefined, {}).body as CatalogAppResponse;

    expect(Object.keys(view.tasks)).toEqual(['novel-forge.chat', 'novel-forge.embedding', 'novel-forge.image']);
    expect(view.tasks['novel-forge.chat']!.default.model).toBe('claude-opus-5.5');
    expect(Object.keys((service.view('memoir', undefined, {}).body as CatalogAppResponse).tasks)).toEqual(['memoir.insight']);
    expect((service.view('other-app', undefined, {}).body as CatalogAppResponse).tasks).toEqual({});
  });

  it('should refuse a task of another app before revealing whether it exists', async () => {
    for (const task of ['memoir.insight', 'memoir.missing']) {
      await expectFailure(
        Promise.resolve().then(() => service.view('novel-forge', task, {})),
        AppErrorCode.SYN_TASK_FORBIDDEN,
      );
    }
  });

  it('should not treat an app that is a prefix of another as the owner', async () => {
    await expectFailure(
      Promise.resolve().then(() => service.view('novel', 'novel-forge.chat', {})),
      AppErrorCode.SYN_TASK_FORBIDDEN,
    );
  });

  it('should answer SYN_UNKNOWN_TASK for a missing task of the calling app', async () => {
    await expectFailure(
      Promise.resolve().then(() => service.view('novel-forge', 'novel-forge.missing', {})),
      AppErrorCode.SYN_UNKNOWN_TASK,
    );
  });

  it('should hand out copies, so a caller cannot change the cached catalog', () => {
    const document = catalogDocument();
    const view = new CatalogViewService(fakeCache(document)).view('novel-forge', 'novel-forge.chat', {}).body as CatalogTaskResponse;

    view.default.price.input = 999;
    view.default.capabilities.tools = false;

    expect(document.models['claude-opus-5.5']!.pricePerMTok.input).toBe(5);
    expect(document.models['claude-opus-5.5']!.capabilities.tools).toBe(true);
  });
});
