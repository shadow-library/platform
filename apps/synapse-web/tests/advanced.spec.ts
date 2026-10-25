import { describe, expect, it } from 'bun:test';

import { CATALOG_CHANGED, editorSourceOf, wholeDocumentEdit } from '../src/features/advanced/editor-source';
import { previewChange } from '../src/features/catalog/catalog-change';
import { EMPTY_CATALOG } from '../src/features/catalog/catalog-document';
import { catalogFixture } from './catalog-fixture';

describe('editorSourceOf', () => {
  it('should start from the live document and remember its version', () => {
    expect(editorSourceOf({ version: 7, document: { models: {} } })).toEqual({ text: '{\n  "models": {}\n}\n', version: 7, document: { models: {} } });
  });

  it('should start from an empty catalog when no version is live yet', () => {
    const source = editorSourceOf(null);
    expect([source.version, JSON.parse(source.text)]).toEqual([null, EMPTY_CATALOG]);
  });
});

describe('wholeDocumentEdit', () => {
  const next = { ...catalogFixture(), budgets: [] };

  it('should replace the document it was loaded from with the edited text', () => {
    const source = editorSourceOf({ version: 3, document: catalogFixture() });
    expect(wholeDocumentEdit(source, next)(catalogFixture())).toEqual({ ok: true, document: next });
  });

  it('should refuse once the live document has changed, rather than overwrite that change', () => {
    const source = editorSourceOf({ version: 3, document: catalogFixture() });
    expect(wholeDocumentEdit(source, next)({ ...catalogFixture(), aliases: {} })).toEqual({ ok: false, reason: CATALOG_CHANGED });
  });

  it('should change nothing once the live document already matches the text, as after a retry whose answer was lost', () => {
    const source = editorSourceOf({ version: 3, document: catalogFixture() });
    expect(previewChange({ version: 4, document: { ...next } }, wholeDocumentEdit(source, next))).toEqual({ kind: 'unchanged' });
  });
});
