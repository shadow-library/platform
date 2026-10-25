import { describe, expect, it } from 'bun:test';

import { AppError, type ErrorCode } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

import { clampEffort, labelFor, resolve, type ResolveRequest } from '@modules/catalog/catalog-resolver';
import { type CatalogDocument, type Effort, type ModelSpec, type TaskSpec } from '@modules/catalog/catalog.types';

import { catalogDocument } from './catalog.fixtures';

const CHAT: ResolveRequest = { app: 'novel-forge', task: 'novel-forge.chat' };

function refusal(document: CatalogDocument, request: ResolveRequest): string | undefined {
  try {
    resolve(document, request);
    return undefined;
  } catch (error) {
    return AppError.is(error) ? error.code : 'not an AppError';
  }
}

function expectRefused(document: CatalogDocument, request: ResolveRequest, code: ErrorCode): void {
  expect(refusal(document, request)).toBe(code.code);
}

function deploymentIds(document: CatalogDocument, request: ResolveRequest): string[] {
  return resolve(document, request).deployments.map(deployment => `${deployment.providerKey}:${deployment.id}`);
}

describe('resolve', () => {
  describe('task', () => {
    it('should refuse a task of another app, whether or not it exists', () => {
      expectRefused(catalogDocument(), { app: 'memoir', task: 'novel-forge.chat' }, AppErrorCode.SYN_TASK_FORBIDDEN);
      expectRefused(catalogDocument(), { app: 'memoir', task: 'novel-forge.unknown' }, AppErrorCode.SYN_TASK_FORBIDDEN);
      expectRefused(catalogDocument(), { app: 'novel', task: 'novel-forge.chat' }, AppErrorCode.SYN_TASK_FORBIDDEN);
    });

    it('should refuse an unknown task of the calling app, including prototype keys', () => {
      expectRefused(catalogDocument(), { app: 'memoir', task: 'memoir.digest' }, AppErrorCode.SYN_UNKNOWN_TASK);
      expectRefused(catalogDocument(), { app: 'memoir', task: 'memoir.constructor' }, AppErrorCode.SYN_UNKNOWN_TASK);
    });
  });

  describe('routes', () => {
    it('should take the default route without selectors', () => {
      const resolution = resolve(catalogDocument(), CHAT);
      expect({ taskKey: resolution.taskKey, modelKey: resolution.modelKey, alias: resolution.alias }).toEqual({
        taskKey: 'novel-forge.chat',
        modelKey: 'claude-opus-5.5',
        alias: undefined,
      });
    });

    it('should prefer the route matching more selector keys over an earlier, less specific one', () => {
      const document = catalogDocument(draft => (draft.tasks['novel-forge.chat']!.routes[0] = { when: { tier: 'performant' }, model: 'grok-4.6' }));
      expect(resolve(document, { ...CHAT, selectors: { tier: 'performant', content_mode: 'standard' } }).modelKey).toBe('claude-opus-5.5');
      expect(resolve(document, { ...CHAT, selectors: { tier: 'performant', content_mode: 'unrestricted' } }).modelKey).toBe('grok-4.6');
    });

    it('should break a tie in specificity in favour of the earliest route', () => {
      const document = catalogDocument(
        draft =>
          (draft.tasks['novel-forge.chat']!.routes = [
            { when: { tier: 'economy' }, model: 'grok-4.6' },
            { when: { content_mode: 'standard' }, model: 'llama3.1' },
            { model: 'claude-opus-5.5' },
          ]),
      );
      expect(resolve(document, { ...CHAT, selectors: { tier: 'economy', content_mode: 'standard' } }).modelKey).toBe('grok-4.6');
    });

    it('should not match a route whose selectors are only partly present', () => {
      expect(resolve(catalogDocument(), { ...CHAT, selectors: { tier: 'performant' } }).modelKey).toBe('claude-opus-5.5');
      expect(resolve(catalogDocument(), { ...CHAT, selectors: { tier: 'economy' } }).modelKey).toBe('grok-4.6');
    });
  });

  describe('aliases', () => {
    it('should resolve an active alias the task accepts to its model', () => {
      const resolution = resolve(catalogDocument(), { ...CHAT, alias: 'grok', selectors: { content_mode: 'unrestricted' } });
      expect({ alias: resolution.alias?.key, modelKey: resolution.modelKey }).toEqual({ alias: 'grok', modelKey: 'grok-4.6' });
    });

    it('should resolve a hidden alias named by key', () => {
      expect(resolve(catalogDocument(), { ...CHAT, alias: 'preview' }).alias?.key).toBe('preview');
    });

    it('should let a retired alias fall through to the routes and report no alias', () => {
      const resolution = resolve(catalogDocument(), { ...CHAT, alias: 'llama', selectors: { tier: 'economy' } });
      expect({ alias: resolution.alias, modelKey: resolution.modelKey }).toEqual({ alias: undefined, modelKey: 'grok-4.6' });
    });

    it('should let a retired alias fall through even when the task no longer lists it', () => {
      const document = catalogDocument(draft => (draft.tasks['novel-forge.chat']!.aliases = ['opus']));
      expect(resolve(document, { ...CHAT, alias: 'llama' }).alias).toBeUndefined();
    });

    it('should refuse an unknown alias, one the task does not accept, and one unavailable for the selectors', () => {
      const document = catalogDocument(draft => (draft.tasks['novel-forge.chat']!.aliases = ['grok']));
      expectRefused(document, { ...CHAT, alias: 'sonnet' }, AppErrorCode.SYN_ALIAS_UNAVAILABLE);
      expectRefused(document, { ...CHAT, alias: 'opus' }, AppErrorCode.SYN_ALIAS_UNAVAILABLE);
      expectRefused(document, { ...CHAT, alias: 'grok', selectors: { content_mode: 'explicit' } }, AppErrorCode.SYN_ALIAS_UNAVAILABLE);
    });

    it('should refuse an alias whose availability names a selector the request lacks', () => {
      expectRefused(catalogDocument(), { ...CHAT, alias: 'grok', selectors: { tier: 'economy' } }, AppErrorCode.SYN_ALIAS_UNAVAILABLE);
    });

    it('should refuse an alias available for no value at all', () => {
      const document = catalogDocument(draft => (draft.aliases.grok!.available = { content_mode: [] }));
      expectRefused(document, { ...CHAT, alias: 'grok', selectors: { content_mode: 'standard' } }, AppErrorCode.SYN_ALIAS_UNAVAILABLE);
    });
  });

  describe('deployments', () => {
    it('should return every deployment in failover order when nothing filters them', () => {
      expect(deploymentIds(catalogDocument(), CHAT)).toEqual(['subscription:claude-opus-5.5', 'openrouter:anthropic/claude-opus-5.5']);
    });

    it('should keep only in-cluster deployments for an in_cluster_only task', () => {
      const document = catalogDocument(draft => {
        draft.tasks['novel-forge.chat']!.dataPolicy = 'in_cluster_only';
        draft.models['claude-opus-5.5']!.deployments.push({ provider: 'local', id: 'opus-distilled' });
      });
      expect(deploymentIds(document, CHAT)).toEqual(['local:opus-distilled']);
    });

    it('should refuse an in_cluster_only task with no in-cluster deployment rather than relax the policy', () => {
      const document = catalogDocument(draft => (draft.tasks['novel-forge.chat']!.dataPolicy = 'in_cluster_only'));
      expectRefused(document, CHAT, AppErrorCode.SYN_NO_ELIGIBLE_MODEL);
    });

    it('should drop the host gateway for image input unless it declares image_input', () => {
      expect(deploymentIds(catalogDocument(), { ...CHAT, needs: { vision: true } })).toEqual(['openrouter:anthropic/claude-opus-5.5']);
      const document = catalogDocument(draft => draft.providers.subscription!.features!.push('image_input'));
      expect(deploymentIds(document, { ...CHAT, needs: { vision: true } })).toEqual(['subscription:claude-opus-5.5', 'openrouter:anthropic/claude-opus-5.5']);
    });

    it('should identify the gateway by its flavor rather than by kind and locality', () => {
      const document = catalogDocument(draft => {
        draft.providers.subscription!.flavor = 'openai-compatible';
        draft.providers.openrouter!.flavor = 'subscription-gateway';
      });
      expect(deploymentIds(document, { ...CHAT, needs: { vision: true } })).toEqual(['subscription:claude-opus-5.5']);
    });

    it('should not ask image_input of a provider that is not the host gateway', () => {
      const document = catalogDocument(draft => (draft.models['claude-opus-5.5']!.deployments = [{ provider: 'local', id: 'llava' }]));
      expect(deploymentIds(document, { ...CHAT, needs: { vision: true } })).toEqual(['local:llava']);
    });

    it('should refuse needs the selected model cannot meet instead of trying another route', () => {
      expectRefused(catalogDocument(), { app: 'memoir', task: 'memoir.insight', needs: { tools: true } }, AppErrorCode.SYN_NO_ELIGIBLE_MODEL);
      expectRefused(catalogDocument(), { app: 'memoir', task: 'memoir.insight', needs: { vision: true } }, AppErrorCode.SYN_NO_ELIGIBLE_MODEL);
      expectRefused(catalogDocument(), { app: 'novel-forge', task: 'novel-forge.embedding', needs: { streaming: true } }, AppErrorCode.SYN_NO_ELIGIBLE_MODEL);
    });

    it('should resolve when the selected model meets every need', () => {
      expect(deploymentIds(catalogDocument(), { ...CHAT, needs: { tools: true, streaming: true } })).toHaveLength(2);
    });
  });
});

describe('labelFor', () => {
  const model = catalogDocument().models['claude-opus-5.5']!;
  const alias = catalogDocument().aliases.opus!;

  it('should use the alias label and hide the version by default', () => {
    expect(labelFor(alias, model)).toBe('Opus');
  });

  it('should append the model version when the alias shows it', () => {
    expect(labelFor({ ...alias, showVersion: true }, model)).toBe('Opus 5.5');
  });

  it('should fall back to the bare alias label when the model has no version', () => {
    expect(labelFor({ ...alias, showVersion: true }, { ...model, version: undefined })).toBe('Opus');
  });

  it('should use the model label without an alias', () => {
    expect(labelFor(undefined, model)).toBe('Claude Opus 5.5');
  });
});

describe('clampEffort', () => {
  const opus = catalogDocument().models['claude-opus-5.5']!;
  const task: TaskSpec = { kind: 'chat', requires: [], dataPolicy: 'any', effort: { default: 'low', min: 'low', max: 'high' }, routes: [{ model: 'claude-opus-5.5' }] };

  function withEfforts(efforts: Effort[] | undefined, reasoning: ModelSpec['capabilities']['reasoning'] = 'optional'): ModelSpec {
    return { ...opus, capabilities: { ...opus.capabilities, efforts, reasoning } };
  }

  it('should send no effort to a model that does not reason', () => {
    expect(clampEffort(task, withEfforts(['low'], 'none'), 'high')).toBeUndefined();
  });

  it('should use the task default when the request names none, and nothing without either', () => {
    expect(clampEffort(task, opus)).toBe('low');
    expect(clampEffort({ ...task, effort: undefined }, opus)).toBeUndefined();
  });

  it('should clamp a request to the task range', () => {
    expect(clampEffort(task, opus, 'max')).toBe('high');
    expect(clampEffort(task, opus, 'none')).toBe('low');
  });

  it('should send a clamped effort the model lists', () => {
    expect(clampEffort(task, withEfforts(['low', 'medium', 'high']), 'medium')).toBe('medium');
    expect(clampEffort(task, withEfforts(['high', 'low'], 'mandatory'), 'max')).toBe('high');
  });

  it('should omit reasoning for an optional model that does not list the effort', () => {
    expect(clampEffort(task, withEfforts(['xhigh', 'high']), 'low')).toBeUndefined();
    expect(clampEffort(task, withEfforts(undefined), 'medium')).toBeUndefined();
  });

  it('should send none to an optional model that lists it, and omit reasoning for one that does not', () => {
    expect(clampEffort({ ...task, effort: { default: 'none' } }, withEfforts(['none', 'low', 'medium', 'high']))).toBe('none');
    expect(clampEffort({ ...task, effort: { default: 'none' } }, withEfforts(['low', 'medium', 'high']))).toBeUndefined();
  });

  it('should give a mandatory model its lowest supported effort when it does not list the one asked for', () => {
    expect(clampEffort({ ...task, effort: { default: 'none' } }, withEfforts(['xhigh', 'high', 'medium', 'low'], 'mandatory'))).toBe('low');
    expect(clampEffort(task, withEfforts(['xhigh', 'high'], 'mandatory'), 'medium')).toBe('high');
  });

  it('should send nothing to a mandatory model that lists no efforts', () => {
    expect(clampEffort(task, withEfforts(undefined, 'mandatory'), 'medium')).toBeUndefined();
  });
});
