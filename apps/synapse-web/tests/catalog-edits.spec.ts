import { describe, expect, it } from 'bun:test';

import { type CatalogDocument, type DocumentEdit } from '../src/features/catalog/catalog-document';
import {
  withAlias,
  withModel,
  withoutModel,
  withoutProviderCredential,
  withProvider,
  withProviderCredential,
  withTaskAliases,
  withTaskDataPolicy,
  withTaskMeta,
} from '../src/features/catalog/catalog-edits';
import { catalogFixture, CREDENTIAL_ID } from './catalog-fixture';

const CHAT = 'novel-forge.chat';

function documentOf(edit: DocumentEdit): CatalogDocument {
  if (!edit.ok) throw new TypeError(`Expected the edit to apply: ${edit.reason}`);
  return edit.document;
}

function entry(document: CatalogDocument, section: string, key: string): Record<string, unknown> | undefined {
  return (document[section] as Record<string, Record<string, unknown>>)[key];
}

describe('task edits', () => {
  it('should refuse a task the catalog does not have, one inherited from the prototype, or one that is not an object', () => {
    const document = { ...catalogFixture(), tasks: { ...catalogFixture().tasks, 'app.broken': 'task' } };
    expect(withTaskDataPolicy(document, 'app.missing', 'any')).toEqual({ ok: false, reason: 'The catalog has no feature "app.missing"' });
    expect(withTaskDataPolicy(document, 'toString', 'any').ok).toBe(false);
    expect(withTaskDataPolicy(document, 'app.broken', 'any')).toEqual({ ok: false, reason: 'The catalog\'s feature "app.broken" is not an object' });
  });

  it('should trim the label and description, remove a blank one and leave an omitted one alone', () => {
    const document = documentOf(withTaskMeta(catalogFixture(), CHAT, { label: '  Story chat ', description: '   ' }));
    expect(entry(document, 'tasks', CHAT)?.label).toBe('Story chat');
    expect(entry(document, 'tasks', CHAT)).not.toHaveProperty('description');
    expect(entry(documentOf(withTaskMeta(catalogFixture(), CHAT, { description: 'New' })), 'tasks', CHAT)?.label).toBe('Chat');
  });

  it('should keep an edited field where it was in the task', () => {
    const document = documentOf(withTaskDataPolicy(catalogFixture(), CHAT, 'in_cluster_only'));
    expect(Object.keys(entry(document, 'tasks', CHAT) ?? {})).toEqual(Object.keys(catalogFixture().tasks[CHAT]));
    expect(entry(document, 'tasks', CHAT)?.dataPolicy).toBe('in_cluster_only');
  });

  it('should set the offered aliases, removing the field when none are offered', () => {
    expect(entry(documentOf(withTaskAliases(catalogFixture(), CHAT, ['opus'])), 'tasks', CHAT)?.aliases).toEqual(['opus']);
    expect(entry(documentOf(withTaskAliases(catalogFixture(), CHAT, [])), 'tasks', CHAT)).not.toHaveProperty('aliases');
  });

  it('should leave the rest of the document untouched', () => {
    const original = catalogFixture();
    const document = documentOf(withTaskDataPolicy(original, CHAT, 'in_cluster_only'));
    expect(document.models).toBe(original.models);
    expect(original.tasks[CHAT].dataPolicy).toBe('any');
  });
});

describe('alias edits', () => {
  it('should add or replace a whole alias, leaving out empty optional fields', () => {
    const alias = { label: ' Haiku ', description: ' ', model: 'sonnet-5.5', state: 'hidden' as const, showVersion: false, available: {} };
    expect(entry(documentOf(withAlias(catalogFixture(), 'haiku', alias)), 'aliases', 'haiku')).toEqual({ label: 'Haiku', model: 'sonnet-5.5', state: 'hidden' });
    const replaced = documentOf(withAlias(catalogFixture(), 'opus', { label: 'Opus', model: 'opus-5.5', state: 'retired', showVersion: true, available: { tier: ['premium'] } }));
    expect(entry(replaced, 'aliases', 'opus')).toEqual({ label: 'Opus', model: 'opus-5.5', showVersion: true, state: 'retired', available: { tier: ['premium'] } });
  });

  it('should refuse an upsert into a section that is not an object', () => {
    const alias = { label: 'Haiku', model: 'sonnet-5.5', state: 'active' as const, showVersion: false };
    expect(withAlias({ aliases: [] }, 'haiku', alias)).toEqual({ ok: false, reason: "The catalog's aliases section is not an object" });
  });
});

describe('model edits', () => {
  const model = {
    label: 'Haiku 5',
    version: '',
    capabilities: { tools: true, structuredOutput: 'native' as const, vision: false, reasoning: 'none' as const, promptCache: 'none' as const, sampling: true },
    pricePerMTok: { input: 1, output: 5 },
    deployments: [{ provider: 'openrouter', id: 'anthropic/claude-haiku-5' }],
  };

  it('should add a model without a blank version', () => {
    const { version: _blank, ...expected } = model;
    expect(entry(documentOf(withModel(catalogFixture(), 'haiku-5', model)), 'models', 'haiku-5')).toEqual(expected);
  });

  it('should remove a model, and refuse one the catalog does not have', () => {
    expect(documentOf(withoutModel(catalogFixture(), 'llama3.1')).models).not.toHaveProperty('llama3.1');
    expect(withoutModel(catalogFixture(), 'gpt-9')).toEqual({ ok: false, reason: 'The catalog has no model "gpt-9"' });
  });
});

describe('provider edits', () => {
  const provider = {
    kind: 'openai' as const,
    flavor: 'openrouter' as const,
    url: ' https://openrouter.ai/api/v1 ',
    locality: 'third_party' as const,
    cost: 'metered' as const,
    features: [],
  };

  it('should let a credential win over the deprecated config key', () => {
    const document = documentOf(withProvider(catalogFixture(), 'openrouter', { ...provider, credential: CREDENTIAL_ID, apiKeyConfig: 'synapse.provider.openrouter.api-key' }));
    expect(entry(document, 'providers', 'openrouter')).toEqual({
      kind: 'openai',
      flavor: 'openrouter',
      url: 'https://openrouter.ai/api/v1',
      credential: CREDENTIAL_ID,
      locality: 'third_party',
      cost: 'metered',
    });
  });

  it('should keep the deprecated config key while no credential is chosen', () => {
    const document = documentOf(withProvider(catalogFixture(), 'legacy', { ...provider, apiKeyConfig: 'synapse.provider.openrouter.api-key', maxInflightPerReplica: 2 }));
    expect(entry(document, 'providers', 'legacy')).toMatchObject({ apiKeyConfig: 'synapse.provider.openrouter.api-key', maxInflightPerReplica: 2 });
  });

  it('should drop the config key when a credential is picked, and remove only the credential when cleared', () => {
    const legacy = { providers: { openrouter: { kind: 'openai', url: 'https://openrouter.ai', apiKeyConfig: 'synapse.key' } } };
    expect(entry(documentOf(withProviderCredential(legacy, 'openrouter', CREDENTIAL_ID)), 'providers', 'openrouter')).toEqual({
      kind: 'openai',
      url: 'https://openrouter.ai',
      credential: CREDENTIAL_ID,
    });
    expect(entry(documentOf(withoutProviderCredential(catalogFixture(), 'openrouter')), 'providers', 'openrouter')).not.toHaveProperty('credential');
  });

  it('should refuse a credential for a provider the catalog does not have', () => {
    expect(withProviderCredential(catalogFixture(), 'missing', CREDENTIAL_ID)).toEqual({ ok: false, reason: 'The catalog has no provider "missing"' });
  });
});
