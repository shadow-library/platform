import { describe, expect, it } from 'bun:test';

import { previewChange } from '../src/features/catalog/catalog-change';
import { describeChanges } from '../src/features/catalog/catalog-changes';
import { type CatalogDocument } from '../src/features/catalog/catalog-document';
import { NO_WEB_SEARCH } from '../src/features/catalog/catalog-edits';
import { issueOwner } from '../src/features/catalog/catalog-issues';
import { readWebSearch } from '../src/features/catalog/catalog-readers';
import { affectedApps, lockedSectionsSentence, summarizeChanges } from '../src/features/changes/change-summary';
import { credentialNamer, nameCredentialChanges } from '../src/features/changes/credential-names';
import {
  addWebSearchEdit,
  assignWebSearchCredentialEdit,
  BRAVE_URL,
  CONCURRENT_WEB_SEARCH_CHANGE,
  CONCURRENT_WEB_SEARCH_KEY_CHANGE,
  editedWebSearchFields,
  emptyWebSearchForm,
  MOCK_SEARCH_URL,
  removeWebSearchEdit,
  updateWebSearchEdit,
  validateWebSearchForm,
  WEB_SEARCH_ALREADY_SET_UP,
  type WebSearchForm,
  webSearchFormOf,
  webSearchKindPatch,
} from '../src/features/providers/web-search-form';
import { webSearchKeyStatus, webSearchKindName, webSearchState } from '../src/features/providers/web-search-view';
import { type CredentialResponse } from '../src/lib/apis/api-types.gen';
import { catalogFixture, CREDENTIAL_ID } from './catalog-fixture';

const OTHER_CREDENTIAL = '0b8f2a7e-1c3d-4e5f-8a9b-0c1d2e3f4a5b';

const BRAVE = { kind: 'brave', url: BRAVE_URL, credential: CREDENTIAL_ID, maxSearches: 3, results: 5 };

function withSearch(webSearch: Record<string, unknown> = BRAVE): CatalogDocument {
  return { ...catalogFixture(), tools: { webSearch } };
}

function storedSearch(document: CatalogDocument): unknown {
  return (document.tools as Record<string, unknown> | undefined)?.webSearch;
}

function formOf(document: CatalogDocument): WebSearchForm {
  const search = readWebSearch(document);
  if (!search) throw new Error('document has no web search');
  return webSearchFormOf(search);
}

function applied(edit: ReturnType<typeof addWebSearchEdit>, document: CatalogDocument): CatalogDocument {
  const result = edit(document);
  if (!result.ok) throw new Error(`expected the edit to apply: ${result.reason}`);
  return result.document;
}

describe('validateWebSearchForm', () => {
  it('should start a new web search on Brave at its API address with modest limits', () => {
    expect(emptyWebSearchForm()).toEqual({ kind: 'brave', url: BRAVE_URL, credential: '', maxSearches: 3, results: 5, pricePerSearchUsd: null });
  });

  it('should build a Brave search with its key, and leave out an empty price', () => {
    expect(validateWebSearchForm({ ...emptyWebSearchForm(), url: ` ${BRAVE_URL} `, credential: CREDENTIAL_ID })).toEqual({
      ok: true,
      spec: { kind: 'brave', url: BRAVE_URL, credential: CREDENTIAL_ID, maxSearches: 3, results: 5 },
    });
    expect(validateWebSearchForm({ ...emptyWebSearchForm(), credential: CREDENTIAL_ID, pricePerSearchUsd: 0 })).toMatchObject({ ok: true, spec: { pricePerSearchUsd: 0 } });
  });

  it('should require a key for Brave and refuse one for a test stand-in, as the server does', () => {
    expect(validateWebSearchForm(emptyWebSearchForm())).toEqual({ ok: false, errors: { credential: 'Choose the stored API key Brave is called with' } });
    const mock: WebSearchForm = { ...emptyWebSearchForm(), kind: 'mock', url: MOCK_SEARCH_URL, credential: CREDENTIAL_ID };
    expect(validateWebSearchForm(mock)).toEqual({ ok: false, errors: { credential: 'A test stand-in sends no API key, so remove it' } });
    expect(validateWebSearchForm({ ...mock, credential: '' })).toEqual({ ok: true, spec: { kind: 'mock', url: MOCK_SEARCH_URL, maxSearches: 3, results: 5 } });
  });

  it('should hold the limits to whole numbers within the server range', () => {
    const errorsOf = (patch: Partial<WebSearchForm>): Record<string, string> => {
      const result = validateWebSearchForm({ ...emptyWebSearchForm(), credential: CREDENTIAL_ID, ...patch });
      return result.ok ? {} : result.errors;
    };
    expect(errorsOf({ maxSearches: 10, results: 20 })).toEqual({});
    expect(errorsOf({ maxSearches: 11, results: 21 })).toEqual({ maxSearches: 'Use a whole number from 1 to 10', results: 'Use a whole number from 1 to 20' });
    expect(errorsOf({ maxSearches: 0, results: 2.5 })).toEqual({ maxSearches: 'Use a whole number from 1 to 10', results: 'Use a whole number from 1 to 20' });
    expect(Object.keys(errorsOf({ maxSearches: null, results: null }))).toEqual(['maxSearches', 'results']);
    expect(errorsOf({ pricePerSearchUsd: -0.01 })).toEqual({ pricePerSearchUsd: "A price can't be negative" });
  });

  it('should refuse a missing engine, and an address that is not http or carries a login', () => {
    const result = validateWebSearchForm({ ...emptyWebSearchForm(), kind: '', url: 'https://user:secret@api.search.brave.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['kind', 'url']);
    expect(validateWebSearchForm({ ...emptyWebSearchForm(), credential: CREDENTIAL_ID, url: 'ftp://search' }).ok).toBe(false);
  });
});

describe('webSearchKindPatch', () => {
  const initial = formOf(withSearch());

  it('should drop the key and move a default address along when switching to a test stand-in', () => {
    expect(webSearchKindPatch(initial, 'mock', initial)).toEqual({ kind: 'mock', url: MOCK_SEARCH_URL, credential: '' });
  });

  it('should restore the key and address the editor opened with when switching back', () => {
    const mock = { ...initial, ...webSearchKindPatch(initial, 'mock', initial) };
    expect(webSearchKindPatch(mock, 'brave', initial)).toEqual({ kind: 'brave', url: BRAVE_URL, credential: CREDENTIAL_ID });
  });

  it('should keep an address someone typed', () => {
    const custom = { ...initial, url: 'https://search.example.com' };
    expect(webSearchKindPatch(custom, 'mock', initial).url).toBe('https://search.example.com');
  });
});

describe('addWebSearchEdit', () => {
  const spec = { kind: 'brave' as const, url: BRAVE_URL, credential: CREDENTIAL_ID, maxSearches: 3, results: 5 };

  it('should set up web search on a catalog without one', () => {
    expect(storedSearch(applied(addWebSearchEdit(spec), catalogFixture()))).toEqual(spec);
  });

  it('should refuse when someone else set web search up meanwhile, and change nothing when it already holds these settings', () => {
    expect(addWebSearchEdit(spec)(withSearch({ ...BRAVE, results: 9 }))).toEqual({ ok: false, reason: WEB_SEARCH_ALREADY_SET_UP });
    expect(previewChange({ version: 4, document: withSearch() }, addWebSearchEdit(spec))).toEqual({ kind: 'unchanged' });
  });
});

describe('updateWebSearchEdit', () => {
  const edit = (initial: WebSearchForm, form: WebSearchForm): ReturnType<typeof addWebSearchEdit> => {
    const result = validateWebSearchForm(form);
    if (!result.ok) throw new Error('expected a valid form');
    return updateWebSearchEdit(initial, form, result.spec);
  };

  it('should list only the fields the form changed', () => {
    const initial = formOf(withSearch());
    expect(editedWebSearchFields(initial, { ...initial, url: ` ${BRAVE_URL} ` })).toEqual([]);
    expect(editedWebSearchFields(initial, { ...initial, results: 8, pricePerSearchUsd: 0.005 })).toEqual(['results', 'pricePerSearchUsd']);
  });

  it('should write only the edited fields over the stored tool, so fields this console does not model survive', () => {
    const document = withSearch({ ...BRAVE, region: 'eu' });
    const initial = formOf(document);
    expect(storedSearch(applied(edit(initial, { ...initial, maxSearches: 6 }), document))).toEqual({ ...BRAVE, region: 'eu', maxSearches: 6 });
  });

  it('should drop the key when switching to a test stand-in', () => {
    const initial = formOf(withSearch());
    const form = { ...initial, ...webSearchKindPatch(initial, 'mock', initial) };
    expect(storedSearch(applied(edit(initial, form), withSearch()))).toEqual({ kind: 'mock', url: MOCK_SEARCH_URL, maxSearches: 3, results: 5 });
  });

  it('should refuse an edited field someone else changed meanwhile, but keep their change to another field', () => {
    const initial = formOf(withSearch());
    const update = edit(initial, { ...initial, results: 8 });
    expect(update(withSearch({ ...BRAVE, results: 7 }))).toEqual({ ok: false, reason: CONCURRENT_WEB_SEARCH_CHANGE });
    expect(storedSearch(applied(update, withSearch({ ...BRAVE, maxSearches: 4 })))).toEqual({ ...BRAVE, maxSearches: 4, results: 8 });
  });

  it('should refuse when web search was turned off meanwhile', () => {
    const initial = formOf(withSearch());
    expect(edit(initial, { ...initial, results: 8 })(catalogFixture())).toEqual({ ok: false, reason: NO_WEB_SEARCH });
  });
});

describe('removeWebSearchEdit and assignWebSearchCredentialEdit', () => {
  it('should turn web search off, and change nothing when it is already off', () => {
    expect(applied(removeWebSearchEdit(), withSearch())).not.toHaveProperty('tools');
    expect(previewChange({ version: 4, document: catalogFixture() }, removeWebSearchEdit())).toEqual({ kind: 'unchanged' });
  });

  it('should switch the key only while the stored one is the one on screen', () => {
    const assign = assignWebSearchCredentialEdit(CREDENTIAL_ID, OTHER_CREDENTIAL);
    expect(storedSearch(applied(assign, withSearch()))).toEqual({ ...BRAVE, credential: OTHER_CREDENTIAL });
    expect(assign(withSearch({ ...BRAVE, credential: '11111111-2222-4333-8444-555555555555' }))).toEqual({ ok: false, reason: CONCURRENT_WEB_SEARCH_KEY_CHANGE });
  });
});

describe('webSearchState and webSearchKeyStatus', () => {
  const credentials = [{ id: CREDENTIAL_ID, name: 'brave', revokedAt: undefined }] as CredentialResponse[];

  it('should tell an absent web search from one that cannot be read', () => {
    expect(webSearchState(catalogFixture())).toEqual({ kind: 'off' });
    expect(webSearchState({ tools: { webSearch: 'brave' } })).toEqual({ kind: 'unreadable' });
    expect(webSearchState(withSearch())).toEqual({ kind: 'on', search: BRAVE });
  });

  it('should name the engine and the key it sends', () => {
    expect(webSearchKindName('brave')).toBe('Brave Search');
    expect(webSearchKindName(undefined)).toBe('Not set');
    expect(webSearchKeyStatus({ kind: 'brave', credential: CREDENTIAL_ID }, credentials)).toEqual({ kind: 'credential', name: 'brave' });
    expect(webSearchKeyStatus({ kind: 'brave', credential: OTHER_CREDENTIAL }, credentials)).toEqual({ kind: 'credential_unknown' });
    expect(webSearchKeyStatus({ kind: 'brave' })).toEqual({ kind: 'none' });
    expect(webSearchKeyStatus({ kind: 'mock' })).toEqual({ kind: 'not_needed' });
  });
});

describe('web search changes', () => {
  const sentences = (before: CatalogDocument, after: CatalogDocument): string[] => describeChanges(before, after).map(change => change.sentence);

  it('should describe setting web search up and turning it off', () => {
    expect(sentences(catalogFixture(), withSearch())).toEqual(['Web search — added, using Brave Search']);
    expect(sentences(withSearch(), catalogFixture())).toEqual(['Web search — removed']);
  });

  it('should describe each changed setting, and a field this console does not model', () => {
    const { credential: _removed, ...keyless } = BRAVE;
    const after = withSearch({ ...keyless, kind: 'mock', url: MOCK_SEARCH_URL, maxSearches: 4, results: 8, pricePerSearchUsd: 0.005, region: 'eu' });
    expect(sentences(withSearch(), after)).toEqual([
      'Web search — search engine: Brave Search → Test stand-in',
      `Web search — address: ${BRAVE_URL} → ${MOCK_SEARCH_URL}`,
      'Web search — API key removed',
      'Web search — searches per answer: 3 → 4',
      'Web search — results per search: 5 → 8',
      'Web search — price per search: not set → $0.005',
      'Web search — region changed',
    ]);
  });

  it('should group web search under tools and name its key', () => {
    const after = withSearch({ ...BRAVE, credential: OTHER_CREDENTIAL });
    const changes = nameCredentialChanges(describeChanges(withSearch(), after), withSearch(), after, credentialNamer([{ id: OTHER_CREDENTIAL, name: 'brave-2027' }]));
    expect(summarizeChanges(changes)).toEqual([
      { area: 'tool', title: 'Tools', items: [{ key: 'webSearch', label: 'Web search', lines: [{ kind: 'text', text: 'API key replaced with “brave-2027”' }] }] },
    ]);
  });

  it('should name every app with a chat feature as affected', () => {
    expect(affectedApps(catalogFixture(), withSearch(), describeChanges(catalogFixture(), withSearch()))).toEqual(['memoir', 'novel-forge']);
  });

  it('should say a role without provider editing cannot change web search', () => {
    const changes = describeChanges(catalogFixture(), withSearch());
    expect(lockedSectionsSentence(changes, { writeProviders: false, setBudgets: true })).toBe(
      "This changes web search, which your role can't change. Ask a Synapse administrator if you need it.",
    );
    expect(lockedSectionsSentence(changes, { writeProviders: true, setBudgets: false })).toBeNull();
  });

  it('should own an issue on the web search tool', () => {
    expect(issueOwner('tools.webSearch.credential', withSearch())).toEqual({ area: 'tool', entityKey: 'webSearch' });
    expect(issueOwner('tools.webSearch', withSearch())).toEqual({ area: 'tool', entityKey: 'webSearch' });
  });
});
