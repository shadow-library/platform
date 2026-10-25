import { describe, expect, it } from 'bun:test';

import { type CatalogDocument } from '../src/features/catalog/catalog-document';
import { readProviders } from '../src/features/catalog/catalog-readers';
import { type ProviderEntry } from '../src/features/catalog/catalog-spec.types';
import { runDraftEdit } from '../src/features/catalog/draft-edit';
import {
  addProviderEdit,
  assignCredentialEdit,
  CONCURRENT_KEY_CHANGE,
  CONCURRENT_PROVIDER_CHANGE,
  editedProviderFields,
  emptyProviderForm,
  keyBindingWarning,
  keySnapshotOf,
  kindPatch,
  type ProviderForm,
  type ProviderFormContext,
  providerFormOf,
  removeProviderEdit,
  updateProviderEdit,
  validateProviderForm,
} from '../src/features/providers/provider-form';
import { errorRateIntent, kindName, providerKeyStatus, type ProviderRow, providerRows, providerUsers, unreadableProviderCount } from '../src/features/providers/provider-view';
import { type CredentialResponse, type ProviderResponse } from '../src/lib/apis/api-types.gen';
import { catalogFixture, CREDENTIAL_ID } from './catalog-fixture';

const OTHER_CREDENTIAL = '0b8f2a7e-1c3d-4e5f-8a9b-0c1d2e3f4a5b';

const ADD: ProviderFormContext = { mode: { kind: 'add' }, takenKeys: ['openrouter', 'subscription', 'ollama'] };

function providerOf(document: CatalogDocument, key: string): ProviderEntry {
  const provider = readProviders(document).find(entry => entry.key === key);
  if (!provider) throw new Error(`document has no provider ${key}`);
  return provider;
}

function formFor(document: CatalogDocument, key: string): ProviderForm {
  return providerFormOf(providerOf(document, key));
}

function rawProvider(document: CatalogDocument, key: string): Record<string, unknown> {
  return (document.providers as Record<string, Record<string, unknown>>)[key] as Record<string, unknown>;
}

function updateEdit(document: CatalogDocument, key: string, initial: ProviderForm, form: ProviderForm): ReturnType<ReturnType<typeof updateProviderEdit>> {
  const result = validateProviderForm(form, { mode: { kind: 'edit', key }, takenKeys: [] });
  if (!result.ok) throw new Error(`invalid form: ${JSON.stringify(result.errors)}`);
  return updateProviderEdit(key, initial, form, result.spec)(document);
}

function liveOf(key: string, patch: Partial<ProviderResponse> = {}): ProviderResponse {
  return { key, kind: 'openai', url: 'https://example.test', locality: 'third_party', cost: 'metered', features: [], calls: 100, errors: 2, errorRate: 0.02, ...patch };
}

const HEALTH = [liveOf('openrouter'), liveOf('subscription'), liveOf('ollama')];

function withProviders(document: CatalogDocument, providers: Record<string, unknown>): CatalogDocument {
  return { ...document, providers };
}

function rowOf(rows: readonly ProviderRow[], key: string): ProviderRow {
  const row = rows.find(candidate => candidate.key === key);
  if (!row) throw new Error(`no row ${key}`);
  return row;
}

function credential(id: string, name: string, allowedOrigin: string, revokedAt?: string): CredentialResponse {
  return {
    id,
    name,
    allowedOrigin,
    hint: '…',
    kid: 'k1',
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    createdByName: null,
    referencedBy: [],
    ...(revokedAt && { revokedAt }),
  } as CredentialResponse;
}

describe('kindName', () => {
  it('should name an openai provider by its service and flag a missing one', () => {
    expect(kindName('openai', 'openrouter')).toBe('OpenRouter');
    expect(kindName('openai')).toBe('OpenAI-compatible (service not set)');
    expect(kindName('ollama')).toBe('Ollama');
    expect(kindName(undefined)).toBe('Not set');
  });
});

describe('errorRateIntent', () => {
  it('should grade the error rate with the overview thresholds', () => {
    expect(errorRateIntent(undefined)).toBe('success');
    expect(errorRateIntent(0.005)).toBe('success');
    expect(errorRateIntent(0.01)).toBe('warning');
    expect(errorRateIntent(0.1)).toBe('danger');
  });
});

describe('providerRows', () => {
  it('should treat every provider as live when the published catalog is shown', () => {
    const document = catalogFixture();
    const rows = providerRows({ working: document, active: document, health: [liveOf('openrouter')] });
    expect(rows.map(row => [row.key, row.presence, row.health.kind])).toEqual([
      ['ollama', 'live', 'unavailable'],
      ['openrouter', 'live', 'measured'],
      ['subscription', 'live', 'unavailable'],
    ]);
  });

  it('should mark draft-only providers as not live and keep published ones the draft removed', () => {
    const active = catalogFixture();
    const { ollama: _removed, ...rest } = catalogFixture().providers;
    const draft = withProviders(catalogFixture(), { ...rest, local: { kind: 'mock', url: 'http://mock', locality: 'in_cluster', cost: 'zero' } });
    const rows = providerRows({ working: draft, active, health: HEALTH });
    expect(rows.map(row => [row.key, row.presence, row.health.kind])).toEqual([
      ['local', 'draft_only', 'not_live'],
      ['ollama', 'removed_in_draft', 'measured'],
      ['openrouter', 'live', 'measured'],
      ['subscription', 'live', 'measured'],
    ]);
    expect(rowOf(rows, 'ollama').entry).toMatchObject({ kind: 'ollama', url: 'http://ollama:11434' });
  });

  it('should mark a provider changed when the draft adds an unknown field or a malformed value', () => {
    const active = catalogFixture();
    const draft = catalogFixture();
    rawProvider(draft, 'openrouter').extra = true;
    rawProvider(draft, 'subscription').maxInflightPerReplica = 'many';
    const rows = providerRows({ working: draft, active, health: HEALTH });
    expect([rowOf(rows, 'openrouter').presence, rowOf(rows, 'subscription').presence, rowOf(rows, 'ollama').presence]).toEqual(['changed', 'changed', 'live']);
  });

  it('should mark a provider changed when the draft adds an old key setting beside its stored key', () => {
    const draft = catalogFixture();
    rawProvider(draft, 'openrouter').apiKeyConfig = 'synapse.provider.openrouter.api-key';
    expect(rowOf(providerRows({ working: draft, active: catalogFixture(), health: HEALTH }), 'openrouter').presence).toBe('changed');
  });

  it('should not invent a removal for a provider the draft holds malformed', () => {
    const draft = catalogFixture();
    (draft.providers as Record<string, unknown>).ollama = 'broken';
    const rows = providerRows({ working: draft, active: catalogFixture(), health: HEALTH });
    expect(rows.map(row => row.key)).toEqual(['openrouter', 'subscription']);
  });

  it('should list a malformed published provider the draft removed', () => {
    const active = withProviders(catalogFixture(), { ...catalogFixture().providers, legacy: 'broken' });
    const row = rowOf(providerRows({ working: catalogFixture(), active, health: HEALTH }), 'legacy');
    expect([row.presence, row.health.kind, row.entry.url]).toEqual(['removed_in_draft', 'unavailable', '']);
  });

  it('should keep presence and settings without health, and health without the published catalog', () => {
    const draft = catalogFixture();
    rawProvider(draft, 'openrouter').url = 'https://openrouter.ai/api/v2';
    const noHealth = providerRows({ working: draft, active: catalogFixture(), health: undefined });
    expect([rowOf(noHealth, 'openrouter').presence, rowOf(noHealth, 'openrouter').health.kind]).toEqual(['changed', 'unavailable']);
    const noActive = providerRows({ working: draft, active: undefined, health: HEALTH });
    expect([rowOf(noActive, 'openrouter').presence, rowOf(noActive, 'openrouter').health.kind]).toEqual(['unknown', 'measured']);
  });

  it('should take whether the old key setting holds a value only while the draft names the same one', () => {
    const active = catalogFixture();
    rawProvider(active, 'subscription').apiKeyConfig = 'synapse.provider.openrouter.api-key';
    const health = [liveOf('subscription', { apiKeyConfigured: true })];
    const same = structuredClone(active);
    expect(rowOf(providerRows({ working: same, active, health }), 'subscription').apiKeyConfigured).toBe(true);
    const dropped = catalogFixture();
    const row = rowOf(providerRows({ working: dropped, active, health }), 'subscription');
    expect(row.apiKeyConfigured).toBeUndefined();
    expect(providerKeyStatus(row)).toEqual({ kind: 'none' });
  });
});

describe('providerKeyStatus', () => {
  const credentials = [credential(CREDENTIAL_ID, 'openrouter', 'https://openrouter.ai')];

  it('should say an ollama provider needs no key and a keyless one has none', () => {
    const document = catalogFixture();
    expect(providerKeyStatus({ entry: providerOf(document, 'ollama') })).toEqual({ kind: 'not_needed' });
    expect(providerKeyStatus({ entry: providerOf(document, 'subscription') })).toEqual({ kind: 'none' });
  });

  it('should name the stored key when credentials can be listed', () => {
    const entry = providerOf(catalogFixture(), 'openrouter');
    expect(providerKeyStatus({ entry }, credentials)).toEqual({ kind: 'credential', name: 'openrouter' });
    expect(providerKeyStatus({ entry })).toEqual({ kind: 'credential' });
    expect(providerKeyStatus({ entry }, [credential(CREDENTIAL_ID, 'openrouter', 'https://openrouter.ai', '2026-10-02T00:00:00Z')])).toEqual({
      kind: 'credential_revoked',
      name: 'openrouter',
    });
  });

  it('should report the old key setting as set or empty only when the live provider still uses it', () => {
    const entry: ProviderEntry = { ...providerOf(catalogFixture(), 'subscription'), apiKeyConfig: 'synapse.provider.openrouter.api-key' };
    expect(providerKeyStatus({ entry })).toEqual({ kind: 'legacy_setting' });
    expect(providerKeyStatus({ entry, apiKeyConfigured: false })).toEqual({ kind: 'missing' });
    expect(providerKeyStatus({ entry, apiKeyConfigured: true })).toEqual({ kind: 'configured' });
  });
});

describe('providerUsers', () => {
  it('should list each model whose deployments name the provider, malformed models included', () => {
    const document = catalogFixture();
    (document.models as Record<string, unknown>).broken = { deployments: [{ provider: 'ollama', id: 'x' }] };
    expect(providerUsers(document, 'openrouter').map(user => user.name)).toEqual(['Opus 5.5', 'Sonnet 5.5']);
    expect(providerUsers(document, 'ollama').map(user => user.key)).toEqual(['broken', 'llama3.1']);
    expect(providerUsers(document, 'nobody')).toEqual([]);
  });
});

describe('unreadableProviderCount', () => {
  it('should count provider entries the reader skipped', () => {
    const document = { ...catalogFixture(), providers: { ...catalogFixture().providers, broken: 'nope' } };
    expect(unreadableProviderCount(document, readProviders(document))).toBe(1);
  });
});

describe('validateProviderForm', () => {
  const filled = (patch: Partial<ProviderForm> = {}): ProviderForm => ({
    ...emptyProviderForm(),
    key: 'groq',
    kind: 'openai',
    flavor: 'openai-compatible',
    url: ' https://api.groq.com/openai/v1 ',
    locality: 'third_party',
    cost: 'metered',
    ...patch,
  });

  it('should build a trimmed spec from a complete form', () => {
    expect(validateProviderForm(filled({ features: ['image_input', 'sessions'], maxInflightPerReplica: 3 }), ADD)).toEqual({
      ok: true,
      key: 'groq',
      spec: {
        kind: 'openai',
        flavor: 'openai-compatible',
        url: 'https://api.groq.com/openai/v1',
        locality: 'third_party',
        cost: 'metered',
        features: ['sessions', 'image_input'],
        maxInflightPerReplica: 3,
      },
    });
  });

  it('should require a flavor only for an openai provider and drop it otherwise', () => {
    const missing = validateProviderForm(filled({ flavor: '' }), ADD);
    expect(!missing.ok && missing.errors.flavor).toBe('Choose which OpenAI-compatible service this is');
    const ollama = validateProviderForm(filled({ kind: 'ollama', flavor: 'openrouter', credential: CREDENTIAL_ID }), ADD);
    expect(ollama.ok && ollama.spec).not.toHaveProperty('flavor');
    expect(ollama.ok && ollama.spec).not.toHaveProperty('credential');
  });

  it('should refuse a bad key, a taken key, a bad address and a bad cap', () => {
    expect(validateProviderForm(filled({ key: '-bad' }), ADD)).toMatchObject({ ok: false, errors: { key: expect.any(String) } });
    expect(validateProviderForm(filled({ key: 'openrouter' }), ADD)).toMatchObject({ ok: false, errors: { key: 'Another provider already uses this key' } });
    expect(validateProviderForm(filled({ url: 'ftp://x' }), ADD)).toMatchObject({ ok: false, errors: { url: expect.any(String) } });
    expect(validateProviderForm(filled({ url: 'https://user:pass@x.io' }), ADD)).toMatchObject({ ok: false, errors: { url: expect.stringContaining('login') } });
    expect(validateProviderForm(filled({ maxInflightPerReplica: 0 }), ADD)).toMatchObject({ ok: false, errors: { maxInflightPerReplica: expect.any(String) } });
    expect(validateProviderForm(filled({ maxInflightPerReplica: 1.5 }), ADD).ok).toBe(false);
  });

  it('should require kind, where it runs and cost', () => {
    const result = validateProviderForm(filled({ kind: '', locality: '', cost: '' }), ADD);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(['cost', 'kind', 'locality']);
  });

  it('should keep the old key setting until a stored key is chosen', () => {
    const legacy = validateProviderForm(filled({ apiKeyConfig: 'synapse.provider.openrouter.api-key' }), ADD);
    expect(legacy.ok && legacy.spec.apiKeyConfig).toBe('synapse.provider.openrouter.api-key');
    const replaced = validateProviderForm(filled({ apiKeyConfig: 'synapse.provider.openrouter.api-key', credential: CREDENTIAL_ID }), ADD);
    expect(replaced.ok && replaced.spec).toMatchObject({ credential: CREDENTIAL_ID });
    expect(replaced.ok && replaced.spec).not.toHaveProperty('apiKeyConfig');
  });
});

describe('editedProviderFields', () => {
  it('should ignore a flavor kept for another kind and feature order', () => {
    const initial = formFor(catalogFixture(), 'ollama');
    expect(editedProviderFields(initial, { ...initial, flavor: 'openrouter' })).toEqual([]);
    const subscription = formFor(catalogFixture(), 'subscription');
    expect(editedProviderFields(subscription, { ...subscription, features: ['native_web_search', 'sessions'] })).toEqual([]);
  });

  it('should count a kind change as a flavor and key change when they stop applying', () => {
    const initial = formFor(catalogFixture(), 'openrouter');
    expect(editedProviderFields(initial, { ...initial, ...kindPatch(initial, 'ollama', initial) })).toEqual(['kind', 'flavor', 'credential']);
  });

  it('should restore the opened key when the kind leaves ollama again', () => {
    const initial = formFor(catalogFixture(), 'openrouter');
    const viaOllama = { ...initial, ...kindPatch(initial, 'ollama', initial) };
    expect(editedProviderFields(initial, { ...viaOllama, ...kindPatch(viaOllama, 'openai', initial) })).toEqual([]);
  });

  it('should keep a key picked before the kind changes between non-ollama kinds', () => {
    const initial = formFor(catalogFixture(), 'subscription');
    const picked = { ...initial, credential: CREDENTIAL_ID };
    expect(kindPatch(picked, 'mock', initial)).toEqual({ kind: 'mock', credential: CREDENTIAL_ID });
  });
});

describe('updateProviderEdit', () => {
  const LOSSY = {
    kind: 'openai',
    flavor: 'openrouter',
    url: 'https://openrouter.ai/api/v1',
    locality: 'third_party',
    cost: 'metered',
    features: ['sessions', 'mystery'],
    maxInflightPerReplica: 'many',
    extra: { kept: true },
  };

  function lossyDocument(): CatalogDocument {
    const document = catalogFixture();
    (document.providers as Record<string, unknown>).odd = structuredClone(LOSSY);
    return document;
  }

  it('should save nothing after the kind went to ollama and back', async () => {
    const document = catalogFixture();
    const initial = formFor(document, 'openrouter');
    const viaOllama = { ...initial, ...kindPatch(initial, 'ollama', initial) };
    const form = { ...viaOllama, ...kindPatch(viaOllama, 'openai', initial) };
    const result = validateProviderForm(form, { mode: { kind: 'edit', key: 'openrouter' }, takenKeys: [] });
    if (!result.ok) throw new Error('form should be valid');
    const ports = { loadBase: () => Promise.resolve({ document, fingerprint: 'f' }), save: () => Promise.reject(new Error('nothing should be saved')) };
    expect(await runDraftEdit(ports, updateProviderEdit('openrouter', initial, form, result.spec), 'note')).toEqual({ kind: 'unchanged' });
  });

  it('should save nothing when the editor changed nothing, whatever the form cannot show', async () => {
    const document = lossyDocument();
    const initial = formFor(document, 'odd');
    const ports = { loadBase: () => Promise.resolve({ document, fingerprint: 'f' }), save: () => Promise.reject(new Error('nothing should be saved')) };
    const result = validateProviderForm(initial, { mode: { kind: 'edit', key: 'odd' }, takenKeys: [] });
    if (!result.ok) throw new Error('fixture form should be valid');
    expect(await runDraftEdit(ports, updateProviderEdit('odd', initial, { ...initial }, result.spec), 'note')).toEqual({ kind: 'unchanged' });
  });

  it('should write only the edited field over the stored entry', () => {
    const document = lossyDocument();
    const initial = formFor(document, 'odd');
    const edit = updateEdit(document, 'odd', initial, { ...initial, url: ' https://openrouter.ai/api/v2 ' });
    expect(edit.ok && rawProvider(edit.document, 'odd')).toEqual({ ...LOSSY, url: 'https://openrouter.ai/api/v2' });
  });

  it('should remove the flavor and the stored key when the kind becomes ollama', () => {
    const document = catalogFixture();
    const initial = formFor(document, 'openrouter');
    const edit = updateEdit(document, 'openrouter', initial, { ...initial, ...kindPatch(initial, 'ollama', initial) });
    const entry = edit.ok ? rawProvider(edit.document, 'openrouter') : {};
    expect(entry).toMatchObject({ kind: 'ollama', url: 'https://openrouter.ai/api/v1' });
    expect(Object.keys(entry)).not.toContain('flavor');
    expect(Object.keys(entry)).not.toContain('credential');
  });

  it('should keep a stored key an ollama provider names until the editor removes it', () => {
    const document = catalogFixture();
    rawProvider(document, 'ollama').credential = CREDENTIAL_ID;
    const initial = formFor(document, 'ollama');
    const untouched = updateEdit(document, 'ollama', initial, { ...initial, cost: 'metered' });
    expect(untouched.ok && rawProvider(untouched.document, 'ollama').credential).toBe(CREDENTIAL_ID);
    const removed = updateEdit(document, 'ollama', initial, { ...initial, credential: '' });
    expect(removed.ok && Object.keys(rawProvider(removed.document, 'ollama'))).not.toContain('credential');
  });

  it('should drop the old key setting when a stored key is chosen', () => {
    const document = catalogFixture();
    rawProvider(document, 'subscription').apiKeyConfig = 'synapse.provider.openrouter.api-key';
    const initial = formFor(document, 'subscription');
    const edit = updateEdit(document, 'subscription', initial, { ...initial, credential: CREDENTIAL_ID });
    const entry = edit.ok ? rawProvider(edit.document, 'subscription') : {};
    expect(entry.credential).toBe(CREDENTIAL_ID);
    expect(Object.keys(entry)).not.toContain('apiKeyConfig');
  });

  it('should remove the cap and the features when the editor clears them', () => {
    const document = catalogFixture();
    const initial = formFor(document, 'subscription');
    const edit = updateEdit(document, 'subscription', initial, { ...initial, features: [], maxInflightPerReplica: null });
    expect(edit.ok && Object.keys(rawProvider(edit.document, 'subscription'))).toEqual(['kind', 'flavor', 'url', 'locality', 'cost']);
  });

  it('should keep a change someone else made meanwhile to a field the editor left alone', () => {
    const initial = formFor(catalogFixture(), 'openrouter');
    const fresh = catalogFixture();
    rawProvider(fresh, 'openrouter').maxInflightPerReplica = 8;
    const edit = updateEdit(fresh, 'openrouter', initial, { ...initial, cost: 'zero' });
    expect(edit.ok && rawProvider(edit.document, 'openrouter')).toMatchObject({ cost: 'zero', maxInflightPerReplica: 8 });
  });

  it('should refuse when someone else changed a field the editor also changed', () => {
    const initial = formFor(catalogFixture(), 'openrouter');
    const fresh = catalogFixture();
    rawProvider(fresh, 'openrouter').url = 'https://openrouter.ai/api/v3';
    expect(updateEdit(fresh, 'openrouter', initial, { ...initial, url: 'https://openrouter.ai/api/v2' })).toEqual({ ok: false, reason: CONCURRENT_PROVIDER_CHANGE });
  });

  it('should refuse a flavor change when someone else changed the kind meanwhile', () => {
    const initial = formFor(catalogFixture(), 'openrouter');
    const fresh = catalogFixture();
    rawProvider(fresh, 'openrouter').kind = 'mock';
    expect(updateEdit(fresh, 'openrouter', initial, { ...initial, flavor: 'openai-compatible' })).toEqual({ ok: false, reason: CONCURRENT_PROVIDER_CHANGE });
  });

  it('should refuse to edit a provider the draft lost meanwhile', () => {
    const initial = formFor(catalogFixture(), 'ollama');
    const fresh = catalogFixture();
    const { ollama: _removed, ...providers } = fresh.providers;
    expect(updateEdit({ ...fresh, providers }, 'ollama', initial, { ...initial, cost: 'metered' }).ok).toBe(false);
  });
});

describe('addProviderEdit', () => {
  const spec = { kind: 'mock' as const, url: 'http://mock', locality: 'in_cluster' as const, cost: 'zero' as const, features: [] };

  it('should add a new provider to the draft', () => {
    const edit = addProviderEdit('mock', spec)(catalogFixture());
    expect(edit.ok && rawProvider(edit.document, 'mock')).toEqual({ kind: 'mock', url: 'http://mock', locality: 'in_cluster', cost: 'zero' });
  });

  it('should refuse a key the draft gained meanwhile, malformed entries included', () => {
    const document = { ...catalogFixture(), providers: { ...catalogFixture().providers, mock: 'broken' } };
    expect(addProviderEdit('mock', spec)(document)).toEqual({ ok: false, reason: 'The draft already has a provider with the key "mock"' });
  });
});

describe('removeProviderEdit', () => {
  it('should remove a provider no model uses', () => {
    const document = catalogFixture();
    (document.providers as Record<string, unknown>).spare = { kind: 'mock', url: 'http://mock', locality: 'in_cluster', cost: 'zero' };
    const edit = removeProviderEdit('spare')(document);
    expect(edit.ok && Object.keys(edit.document.providers as object)).toEqual(['openrouter', 'subscription', 'ollama']);
  });

  it('should refuse while a model still uses it', () => {
    expect(removeProviderEdit('ollama')(catalogFixture())).toEqual({ ok: false, reason: 'It is still in use. Used by Llama 3.1.' });
  });
});

describe('assignCredentialEdit', () => {
  it('should pick a stored key and drop the old key setting', () => {
    const document = catalogFixture();
    rawProvider(document, 'subscription').apiKeyConfig = 'synapse.provider.openrouter.api-key';
    const seen = keySnapshotOf(providerOf(document, 'subscription'));
    const edit = assignCredentialEdit('subscription', seen, OTHER_CREDENTIAL)(document);
    expect(edit.ok && rawProvider(edit.document, 'subscription')).toMatchObject({ credential: OTHER_CREDENTIAL });
    expect(edit.ok && Object.keys(rawProvider(edit.document, 'subscription'))).not.toContain('apiKeyConfig');
  });

  it('should clear the stored key', () => {
    const document = catalogFixture();
    const edit = assignCredentialEdit('openrouter', { credential: CREDENTIAL_ID }, null)(document);
    expect(edit.ok && Object.keys(rawProvider(edit.document, 'openrouter'))).not.toContain('credential');
  });

  it('should refuse when someone else changed the key meanwhile', () => {
    const document = catalogFixture();
    rawProvider(document, 'openrouter').credential = OTHER_CREDENTIAL;
    expect(assignCredentialEdit('openrouter', { credential: CREDENTIAL_ID }, null)(document)).toEqual({ ok: false, reason: CONCURRENT_KEY_CHANGE });
  });
});

describe('keyBindingWarning', () => {
  const credentials = [credential(CREDENTIAL_ID, 'openrouter', 'https://openrouter.ai')];

  it('should warn when the address leaves the site the chosen key is bound to', () => {
    const initial = formFor(catalogFixture(), 'openrouter');
    expect(keyBindingWarning({ ...initial, url: 'https://openrouter.ai/api/v2' }, initial.url, credentials)).toBeUndefined();
    expect(keyBindingWarning({ ...initial, url: 'https://other.ai/v1' }, initial.url, credentials)).toContain('only ever sent to https://openrouter.ai');
  });

  it('should warn on a site change even when the stored keys cannot be listed', () => {
    const initial = formFor(catalogFixture(), 'openrouter');
    expect(keyBindingWarning({ ...initial, url: 'https://other.ai/v1' }, initial.url)).toContain('bound to the old address');
    expect(keyBindingWarning({ ...initial, url: 'https://openrouter.ai/v9' }, initial.url)).toBeUndefined();
  });

  it('should not warn for an ollama provider or one without a key', () => {
    const ollama = formFor(catalogFixture(), 'ollama');
    expect(keyBindingWarning({ ...ollama, url: 'http://elsewhere:11434' }, ollama.url, credentials)).toBeUndefined();
    const subscription = formFor(catalogFixture(), 'subscription');
    expect(keyBindingWarning({ ...subscription, url: 'http://elsewhere' }, subscription.url, credentials)).toBeUndefined();
  });

  it('should warn when the old key setting would follow the provider to another site', () => {
    const form: ProviderForm = { ...formFor(catalogFixture(), 'subscription'), apiKeyConfig: 'synapse.provider.openrouter.api-key' };
    expect(keyBindingWarning({ ...form, url: 'https://elsewhere.io' }, form.url)).toContain('old key setting');
  });
});
