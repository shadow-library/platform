import { describe, expect, it } from 'bun:test';

import { previewChange } from '../src/features/catalog/catalog-change';
import { type CatalogDocument } from '../src/features/catalog/catalog-document';
import { credentialOffers } from '../src/features/credentials/credential-offers';
import { WEB_SEARCH_HOLDER } from '../src/features/credentials/credential-view';
import { CONCURRENT_KEY_CHANGE } from '../src/features/providers/provider-form';
import { CONCURRENT_WEB_SEARCH_KEY_CHANGE } from '../src/features/providers/web-search-form';
import { catalogFixture, CREDENTIAL_ID } from './catalog-fixture';

const NEW_KEY = '0b8f2a7e-1c3d-4e5f-8a9b-0c1d2e3f4a5b';

const ALLOWED = { writeCatalog: true, writeProviders: true };

const OPENROUTER = 'https://openrouter.ai';

type Providers = Record<string, Record<string, unknown>>;

const key = (patch: Partial<{ id: string; allowedOrigin: string; referencedBy: string[]; revokedAt: string }> = {}) => ({
  id: NEW_KEY,
  allowedOrigin: OPENROUTER,
  referencedBy: [],
  ...patch,
});

function withLegacyProvider(): CatalogDocument {
  const document = catalogFixture();
  (document.providers as Providers)['openrouter-backup'] = {
    kind: 'openai',
    flavor: 'openrouter',
    url: 'https://openrouter.ai/api/v1',
    apiKeyConfig: 'synapse.provider.openrouter.api-key',
    locality: 'third_party',
    cost: 'metered',
  };
  return document;
}

const BRAVE = 'https://api.search.brave.com';

function withWebSearch(search: Record<string, unknown>): CatalogDocument {
  return { ...catalogFixture(), tools: { webSearch: { kind: 'brave', url: BRAVE, maxSearches: 3, results: 5, ...search } } };
}

describe('credentialOffers', () => {
  it('should offer a new key to every provider at its address, one that sends another key included', () => {
    expect(credentialOffers(key(), withLegacyProvider(), 'created', ALLOWED).map(offer => offer.name)).toEqual(['OpenRouter', 'OpenRouter Backup']);
  });

  it('should offer a listed key nobody uses only to providers without a stored key', () => {
    expect(credentialOffers(key(), withLegacyProvider(), 'listed', ALLOWED).map(offer => offer.holder)).toEqual(['openrouter-backup']);
    expect(credentialOffers(key({ referencedBy: ['openrouter'] }), withLegacyProvider(), 'listed', ALLOWED)).toEqual([]);
  });

  it('should offer nothing for another address, a revoked key, or a provider already sending it', () => {
    expect(credentialOffers(key({ allowedOrigin: 'https://example.test' }), withLegacyProvider(), 'created', ALLOWED)).toEqual([]);
    expect(credentialOffers(key({ revokedAt: '2026-10-02T00:00:00Z' }), withLegacyProvider(), 'created', ALLOWED)).toEqual([]);
    expect(credentialOffers(key({ id: CREDENTIAL_ID }), catalogFixture(), 'created', ALLOWED)).toEqual([]);
  });

  it('should offer nothing without permission to change the catalog and its providers, or before the catalog loads', () => {
    expect(credentialOffers(key(), withLegacyProvider(), 'created', { writeCatalog: true, writeProviders: false })).toEqual([]);
    expect(credentialOffers(key(), withLegacyProvider(), 'created', { writeCatalog: false, writeProviders: true })).toEqual([]);
    expect(credentialOffers(key(), null, 'created', ALLOWED)).toEqual([]);
  });

  it('should switch the provider to the key and drop the old environment key setting', () => {
    const [offer] = credentialOffers(key(), withLegacyProvider(), 'listed', ALLOWED);
    const edit = offer?.edit(withLegacyProvider());
    expect(edit?.ok && (edit.document.providers as Providers)['openrouter-backup']).toMatchObject({ credential: NEW_KEY });
    expect(edit?.ok && Object.keys((edit.document.providers as Providers)['openrouter-backup'] ?? {})).not.toContain('apiKeyConfig');
  });

  it('should refuse when someone else set the provider key meanwhile, and change nothing when it already sends this key', () => {
    const [offer] = credentialOffers(key(), withLegacyProvider(), 'listed', ALLOWED);
    if (!offer) throw new Error('expected an offer');
    const moved = withLegacyProvider();
    (moved.providers as Providers)['openrouter-backup']!.credential = CREDENTIAL_ID;
    expect(offer.edit(moved)).toEqual({ ok: false, reason: CONCURRENT_KEY_CHANGE });
    const taken = withLegacyProvider();
    const { apiKeyConfig: _dropped, ...backup } = (taken.providers as Providers)['openrouter-backup']!;
    (taken.providers as Providers)['openrouter-backup'] = { ...backup, credential: NEW_KEY };
    expect(previewChange({ version: 5, document: taken }, offer.edit)).toEqual({ kind: 'unchanged' });
  });

  it('should offer a key at the web search address to web search', () => {
    const offers = credentialOffers(key({ allowedOrigin: BRAVE }), withWebSearch({ credential: CREDENTIAL_ID }), 'created', ALLOWED);
    expect(offers.map(offer => [offer.holder, offer.name])).toEqual([[WEB_SEARCH_HOLDER, 'Web search']]);
    const edit = offers[0]?.edit(withWebSearch({ credential: CREDENTIAL_ID }));
    expect(edit?.ok && edit.document.tools).toEqual({ webSearch: { kind: 'brave', url: BRAVE, credential: NEW_KEY, maxSearches: 3, results: 5 } });
  });

  it('should not offer a listed key to a web search that already sends one, nor any key to a test stand-in or no web search at all', () => {
    expect(credentialOffers(key({ allowedOrigin: BRAVE }), withWebSearch({ credential: CREDENTIAL_ID }), 'listed', ALLOWED)).toEqual([]);
    expect(credentialOffers(key({ allowedOrigin: BRAVE }), withWebSearch({}), 'listed', ALLOWED).map(offer => offer.holder)).toEqual([WEB_SEARCH_HOLDER]);
    expect(credentialOffers(key({ allowedOrigin: 'http://search.mock' }), withWebSearch({ kind: 'mock', url: 'http://search.mock' }), 'created', ALLOWED)).toEqual([]);
    expect(credentialOffers(key({ allowedOrigin: BRAVE }), catalogFixture(), 'created', ALLOWED)).toEqual([]);
  });

  it('should refuse when someone else set the web search key meanwhile', () => {
    const [offer] = credentialOffers(key({ allowedOrigin: BRAVE }), withWebSearch({ credential: CREDENTIAL_ID }), 'created', ALLOWED);
    if (!offer) throw new Error('expected an offer');
    expect(offer.edit(withWebSearch({ credential: '11111111-2222-4333-8444-555555555555' }))).toEqual({ ok: false, reason: CONCURRENT_WEB_SEARCH_KEY_CHANGE });
  });
});
