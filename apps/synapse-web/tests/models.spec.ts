import { describe, expect, it } from 'bun:test';

import { readModels } from '../src/features/catalog/catalog-readers';
import { type ModelEntry, type ModelSpec } from '../src/features/catalog/catalog-spec.types';
import { type CatalogDocument } from '../src/features/catalog/catalog-document';
import { previewChange } from '../src/features/catalog/catalog-change';
import {
  addDeploymentRow,
  addModelEdit,
  CONCURRENT_MODEL_CHANGE,
  emptyModelForm,
  type ModelForm,
  type ModelFormContext,
  modelFormOf,
  moveRow,
  reasoningPatch,
  removeModelEdit,
  sortEfforts,
  updateModelEdit,
  validateModelForm,
} from '../src/features/models/model-form';
import {
  cachedInputLabel,
  cachedInputPrice,
  capabilityChips,
  cheapest,
  compareModels,
  filterModels,
  formatContext,
  keepVisible,
  modelUsageIndex,
  servedBy,
  servedBySentence,
  unreadableModelCount,
  usageOf,
  usageSentence,
  usageSummary,
} from '../src/features/models/model-view';
import { catalogFixture } from './catalog-fixture';

const PROVIDERS = ['openrouter', 'subscription', 'ollama'];

function modelOf(key: string): ModelEntry {
  const model = readModels(catalogFixture()).find(entry => entry.key === key);
  if (!model) throw new Error(`fixture has no model ${key}`);
  return model;
}

function filledForm(patch: Partial<ModelForm> = {}): ModelForm {
  return { ...emptyModelForm(), key: 'haiku-5', label: 'Haiku 5', input: 1, output: 5, deployments: [{ rowId: 0, provider: 'openrouter', id: 'anthropic/haiku-5' }], ...patch };
}

const ADD: ModelFormContext = { mode: { kind: 'add' }, takenKeys: ['opus-5.5', 'sonnet-5.5', 'llama3.1'], providerKeys: PROVIDERS };

describe('modelUsageIndex', () => {
  it('should list each feature once however many of its rules pick the model', () => {
    const document = catalogFixture();
    document.tasks['novel-forge.chat'].routes = [{ when: { tier: 'economy' }, model: 'opus-5.5' }, { model: 'opus-5.5' }];
    expect(usageOf(modelUsageIndex(document), 'opus-5.5').features).toEqual([{ key: 'novel-forge.chat', name: 'Novel Forge · Chat' }]);
  });

  it('should collect features and model names that use a model', () => {
    const usage = usageOf(modelUsageIndex(catalogFixture()), 'llama3.1');
    expect(usage.features.map(feature => feature.key)).toEqual(['memoir.receipt-structuring', 'novel-forge.chat']);
    expect(usageOf(modelUsageIndex(catalogFixture()), 'sonnet-5.5').modelNames).toEqual([{ key: 'sonnet', name: 'Sonnet' }]);
  });

  it('should count a retired model name, since the server still checks its model', () => {
    const document = catalogFixture();
    Object.assign(document.aliases.sonnet, { state: 'retired' });
    expect(usageOf(modelUsageIndex(document), 'sonnet-5.5').modelNames).toHaveLength(1);
  });

  it('should report an unused model as empty', () => {
    const document = catalogFixture();
    const usage = usageOf(modelUsageIndex(document), 'missing');
    expect(usageSummary(usage)).toBe('Not used');
  });
});

describe('usageSummary', () => {
  it('should count features and model names in words', () => {
    expect(usageSummary(usageOf(modelUsageIndex(catalogFixture()), 'opus-5.5'))).toBe('1 feature · 1 model name');
    expect(usageSummary(usageOf(modelUsageIndex(catalogFixture()), 'llama3.1'))).toBe('2 features');
  });

  it('should name every user in the sentence', () => {
    expect(usageSentence(usageOf(modelUsageIndex(catalogFixture()), 'opus-5.5'))).toBe('Used by Novel Forge · Chat, Opus');
  });
});

describe('capabilityChips', () => {
  it('should list what a model can do in plain words', () => {
    expect(capabilityChips(modelOf('opus-5.5').capabilities)).toEqual(['Tools', 'Vision', 'Reasoning', '200K context']);
  });

  it('should describe embeddings, image output and mandatory reasoning', () => {
    const chips = capabilityChips({
      tools: false,
      structuredOutput: 'prompt',
      vision: false,
      imageOutput: true,
      embedding: { dimensions: 1536 },
      reasoning: 'mandatory',
      promptCache: 'none',
      sampling: true,
    });
    expect(chips).toEqual(['Image output', 'Embeddings (1,536 dimensions)', 'Reasoning (always on)']);
  });
});

describe('formatContext', () => {
  it('should shorten token counts', () => {
    expect([200_000, 1_000_000, 1_050_000, 131_072].map(formatContext)).toEqual(['200K', '1M', '1.05M', '131K']);
  });
});

describe('filterModels', () => {
  const models = readModels(catalogFixture());

  it('should match the name or key case-insensitively', () => {
    expect(filterModels(models, { query: ' LLAMA ', capabilities: [] }).map(model => model.key)).toEqual(['llama3.1']);
    expect(filterModels(models, { query: 'sonnet-5', capabilities: [] }).map(model => model.key)).toEqual(['sonnet-5.5']);
  });

  it('should keep only models with every chosen capability', () => {
    expect(filterModels(models, { query: '', capabilities: ['vision', 'reasoning'] }).map(model => model.key)).toEqual(['opus-5.5', 'sonnet-5.5']);
    expect(filterModels(models, { query: '', capabilities: ['embedding'] })).toEqual([]);
  });
});

describe('servedBy', () => {
  it('should read the failover order and flag providers missing from the catalog', () => {
    const links = servedBy(
      {
        deployments: [
          { provider: 'subscription', id: 'opus' },
          { provider: 'gone', id: 'x' },
        ],
      },
      new Set(PROVIDERS),
    );
    expect(servedBySentence(links)).toBe('Subscription, then Gone (not in the catalog)');
  });

  it('should say when no provider serves the model', () => {
    expect(servedBySentence([])).toBe('No provider');
  });
});

describe('unreadableModelCount', () => {
  it('should count model entries the reader skipped', () => {
    const document = { ...catalogFixture(), models: { ...catalogFixture().models, broken: { label: 'Broken' } } };
    expect(unreadableModelCount(document, readModels(document))).toBe(1);
  });
});

describe('cheapest', () => {
  it('should mark every model tied at the lowest price', () => {
    expect(cheapest([3, 1, 1])).toEqual([false, true, true]);
  });

  it('should mark nothing when every price is the same or only one is known', () => {
    expect(cheapest([2, 2])).toEqual([false, false]);
    expect(cheapest([2, undefined])).toEqual([false, false]);
  });

  it('should ignore models without the price', () => {
    expect(cheapest([undefined, 1.5, 15])).toEqual([false, true, false]);
  });
});

describe('compareModels', () => {
  it('should line models up row by row with the cheapest price marked', () => {
    const document = catalogFixture();
    const rows = compareModels([modelOf('opus-5.5'), modelOf('sonnet-5.5')], modelUsageIndex(document), new Set(PROVIDERS));
    const input = rows.find(row => row.id === 'input');
    expect(input).toEqual({ id: 'input', label: 'Input, per million tokens', values: ['$15.00', '$3.00'], cheapest: [false, true] });
    expect(rows.find(row => row.id === 'servedBy')?.values).toEqual(['Subscription, then OpenRouter', 'OpenRouter']);
    expect(rows.find(row => row.id === 'usedBy')?.values).toEqual(['Novel Forge · Chat, Opus', 'Sonnet']);
    expect(rows.find(row => row.id === 'efforts')?.values).toEqual(['Low, Medium, High', '—']);
    expect(rows.find(row => row.id === 'cachedInput')).toMatchObject({ values: ['$1.50', 'Same as input ($3.00)'], cheapest: [true, false] });
  });
});

describe('modelFormOf', () => {
  it('should read the stored values into the form', () => {
    expect(modelFormOf(modelOf('opus-5.5'))).toMatchObject({ label: 'Opus 5.5', version: '5.5', input: 15, cachedInput: 1.5, dimensions: null, context: 200_000 });
  });

  it('should keep the stored order of efforts the editor did not touch', () => {
    const model = { ...modelOf('opus-5.5'), capabilities: { ...modelOf('opus-5.5').capabilities, efforts: ['high' as const, 'low' as const] } };
    expect(modelFormOf(model).efforts).toEqual(['high', 'low']);
  });
});

describe('sortEfforts', () => {
  it('should order efforts from lowest to highest and drop unknown ones', () => {
    expect(sortEfforts(['max', 'low', 'bogus', 'none'])).toEqual(['none', 'low', 'max']);
  });
});

describe('validateModelForm', () => {
  it('should build a minimal spec, leaving blank optional fields out', () => {
    const result = validateModelForm(filledForm({ version: '  ' }), ADD);
    expect(result).toEqual({
      ok: true,
      key: 'haiku-5',
      spec: {
        label: 'Haiku 5',
        capabilities: { tools: false, structuredOutput: 'prompt', vision: false, reasoning: 'none', promptCache: 'none', sampling: true },
        pricePerMTok: { input: 1, output: 5 },
        deployments: [{ provider: 'openrouter', id: 'anthropic/haiku-5' }],
      },
    });
  });

  it('should make a model with dimensions an embedding model', () => {
    const result = validateModelForm(filledForm({ dimensions: 768, context: 8192 }), ADD);
    expect(result.ok && result.spec.capabilities).toMatchObject({ embedding: { dimensions: 768 }, context: 8192 });
  });

  it('should refuse a key the server parser would reject', () => {
    for (const key of ['', '-lead', 'has space', '__proto__']) {
      const result = validateModelForm(filledForm({ key }), ADD);
      expect(result.ok ? undefined : result.errors.fields.key).toBeDefined();
    }
  });

  it('should accept every character the server allows in a key', () => {
    expect(validateModelForm(filledForm({ key: 'A0_.:/@-x' }), ADD).ok).toBe(true);
  });

  it('should refuse a key another model already uses', () => {
    const result = validateModelForm(filledForm({ key: 'opus-5.5' }), ADD);
    expect(result.ok ? undefined : result.errors.fields.key).toBe('Another model already uses this key');
  });

  it('should require a name and both main prices, and refuse negative prices', () => {
    const result = validateModelForm(filledForm({ label: ' ', input: null, output: -1, cachedInput: -0.5 }), ADD);
    expect(result.ok ? undefined : result.errors.fields).toEqual({
      label: 'Enter a name',
      input: 'Enter the input price',
      output: "A price can't be negative",
      cachedInput: "A price can't be negative",
    });
  });

  it('should allow a free model', () => {
    expect(validateModelForm(filledForm({ input: 0, output: 0 }), ADD).ok).toBe(true);
  });

  it('should refuse fractional or zero dimensions and context', () => {
    const result = validateModelForm(filledForm({ dimensions: 0, context: 1.5 }), ADD);
    expect(result.ok ? undefined : result.errors.fields).toEqual({ dimensions: 'Use a whole number of at least 1', context: 'Use a whole number of at least 1' });
  });

  it('should require at least one provider', () => {
    const result = validateModelForm(filledForm({ deployments: [] }), ADD);
    expect(result.ok ? undefined : result.errors.fields.deployments).toBe('Add at least one provider');
  });

  it('should flag empty, unknown and repeated provider rows', () => {
    const deployments = [
      { rowId: 4, provider: '', id: ' ' },
      { rowId: 7, provider: 'gone', id: 'x' },
      { rowId: 9, provider: 'openrouter', id: 'a' },
      { rowId: 10, provider: 'openrouter', id: ' a ' },
    ];
    const result = validateModelForm(filledForm({ deployments }), ADD);
    expect(result.ok ? undefined : result.errors.deployments).toEqual({
      4: { provider: 'Pick a provider', id: "Enter the provider's model id" },
      7: { provider: "This provider isn't in the catalog" },
      10: { id: 'This provider and model id are already listed' },
    });
  });

  it('should trim the provider model ids the editor typed', () => {
    const result = validateModelForm(filledForm({ deployments: [{ rowId: 0, provider: 'ollama', id: ' llama3.2 ' }] }), ADD);
    expect(result.ok && result.spec.deployments).toEqual([{ provider: 'ollama', id: 'llama3.2' }]);
  });
});

describe('moveRow', () => {
  it('should swap a row with its neighbour', () => {
    expect(moveRow(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveRow(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('should leave the order alone at either end', () => {
    expect(moveRow(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveRow(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('addDeploymentRow', () => {
  it('should give the new row an id no other row has', () => {
    expect(addDeploymentRow([{ rowId: 3, provider: 'a', id: 'b' }]).map(row => row.rowId)).toEqual([3, 4]);
    expect(addDeploymentRow([])).toEqual([{ rowId: 0, provider: '', id: '' }]);
  });
});

const LOSSY_MODEL = {
  label: ' Odd Model ',
  version: ' 2 ',
  note: 'unknown model field',
  capabilities: { tools: true, structuredOutput: 'native', vision: false, imageOutput: false, reasoning: 'optional', efforts: ['high', 'low'], promptCache: 'none', future: 1 },
  pricePerMTok: { input: 1, output: 2, currency: 'usd' },
  deployments: [{ provider: 'openrouter', id: ' odd ', region: 'eu' }, { provider: 'ollama' }],
};

function lossyDocument(): CatalogDocument {
  const document: CatalogDocument = catalogFixture();
  return { ...document, models: { ...(document.models as Record<string, unknown>), odd: structuredClone(LOSSY_MODEL) } };
}

function modelIn(document: CatalogDocument, key: string): Record<string, unknown> {
  return (document.models as Record<string, Record<string, unknown>>)[key] ?? {};
}

function formFor(document: CatalogDocument, key: string): ModelForm {
  const model = readModels(document).find(entry => entry.key === key);
  if (!model) throw new Error(`no readable model ${key}`);
  return modelFormOf(model);
}

function updateEdit(key: string, initial: ModelForm, form: ModelForm): ReturnType<typeof updateModelEdit> {
  const result = validateModelForm(form, { mode: { kind: 'edit', key }, takenKeys: [], providerKeys: PROVIDERS });
  if (!result.ok) throw new Error(`invalid form: ${JSON.stringify(result.errors)}`);
  return updateModelEdit(key, initial, form, result.spec);
}

describe('updateModelEdit', () => {
  it('should change nothing when the editor changed nothing, whatever the form cannot show', () => {
    const document = lossyDocument();
    const initial = formFor(document, 'odd');
    expect(previewChange({ version: 3, document }, updateEdit('odd', initial, { ...initial }))).toEqual({ kind: 'unchanged' });
  });

  it('should write only the edited field over the stored entry', () => {
    const document = lossyDocument();
    const initial = formFor(document, 'odd');
    const edit = updateEdit('odd', initial, { ...initial, input: 3 })(document);
    expect(edit.ok && modelIn(edit.document, 'odd')).toEqual({ ...LOSSY_MODEL, pricePerMTok: { ...LOSSY_MODEL.pricePerMTok, input: 3 } });
  });

  it('should trim an edited value and leave untouched stored text alone', () => {
    const document = lossyDocument();
    const initial = formFor(document, 'odd');
    const edit = updateEdit('odd', initial, { ...initial, label: '  Renamed  ' })(document);
    expect(edit.ok && modelIn(edit.document, 'odd')).toEqual({ ...LOSSY_MODEL, label: 'Renamed' });
  });

  it('should keep stored embedding fields the form does not show when dimensions change', () => {
    const document = lossyDocument();
    Object.assign(modelIn(document, 'odd').capabilities as object, { embedding: { dimensions: 512, normalised: true } });
    const initial = formFor(document, 'odd');
    const edit = updateEdit('odd', initial, { ...initial, dimensions: 1024 })(document);
    expect(edit.ok && modelIn(edit.document, 'odd').capabilities).toMatchObject({ embedding: { dimensions: 1024, normalised: true } });
  });

  it('should remove image output when the editor turns it off', () => {
    const document = lossyDocument();
    Object.assign(modelIn(document, 'odd').capabilities as object, { imageOutput: true });
    const initial = formFor(document, 'odd');
    const edit = updateEdit('odd', initial, { ...initial, imageOutput: false })(document);
    expect(edit.ok && Object.keys(modelIn(edit.document, 'odd').capabilities as object)).not.toContain('imageOutput');
  });

  it('should keep a change someone else made meanwhile to a field the editor left alone', () => {
    const initial = formFor(catalogFixture(), 'opus-5.5');
    const fresh = catalogFixture();
    fresh.models['opus-5.5'].pricePerMTok.output = 99;
    const edit = updateEdit('opus-5.5', initial, { ...initial, input: 20 })(fresh);
    expect(edit.ok && modelIn(edit.document, 'opus-5.5').pricePerMTok).toEqual({ input: 20, cachedInput: 1.5, output: 99 });
  });

  it('should refuse when someone else changed a field the editor also changed', () => {
    const initial = formFor(catalogFixture(), 'opus-5.5');
    const fresh = catalogFixture();
    fresh.models['opus-5.5'].pricePerMTok.input = 16;
    expect(updateEdit('opus-5.5', initial, { ...initial, input: 20 })(fresh)).toEqual({ ok: false, reason: CONCURRENT_MODEL_CHANGE });
  });

  it('should change nothing when the model already holds the edited values, as after a retry whose answer was lost', () => {
    const initial = formFor(catalogFixture(), 'opus-5.5');
    const live = catalogFixture();
    live.models['opus-5.5'].pricePerMTok.input = 20;
    expect(previewChange({ version: 5, document: live }, updateEdit('opus-5.5', initial, { ...initial, input: 20 }))).toEqual({ kind: 'unchanged' });
  });

  it('should refuse to edit a model the catalog lost meanwhile', () => {
    const initial = formFor(catalogFixture(), 'sonnet-5.5');
    const document = catalogFixture();
    const { 'sonnet-5.5': _removed, ...models } = document.models;
    expect(updateEdit('sonnet-5.5', initial, { ...initial, input: 4 })({ ...document, models }).ok).toBe(false);
  });
});

describe('addModelEdit', () => {
  const spec: ModelSpec = { ...modelOf('sonnet-5.5'), label: 'Sonnet 6' };

  it('should add a new model to the catalog', () => {
    const edit = addModelEdit('sonnet-6', spec)(catalogFixture());
    expect(edit.ok && modelIn(edit.document, 'sonnet-6')).toMatchObject({ label: 'Sonnet 6' });
  });

  it('should refuse to add a key the catalog gained meanwhile', () => {
    expect(addModelEdit('sonnet-5.5', spec)(catalogFixture())).toEqual({ ok: false, reason: 'The catalog already has a model with the key "sonnet-5.5"' });
  });
});

describe('reasoningPatch', () => {
  it('should clear efforts when the model stops reasoning', () => {
    expect(reasoningPatch('none', ['low', 'high'])).toEqual({ reasoning: 'none', efforts: [] });
    expect(reasoningPatch('mandatory', ['low'])).toEqual({ reasoning: 'mandatory', efforts: ['low'] });
  });
});

describe('cachedInputPrice', () => {
  it('should fall back to the input price, as the server bills it', () => {
    expect(cachedInputPrice({ input: 3, output: 15 })).toBe(3);
    expect(cachedInputLabel({ input: 3, output: 15 })).toBe('Same as input ($3.00)');
    expect(cachedInputLabel({ input: 3, cachedInput: 0.3, output: 15 })).toBe('$0.30');
  });
});

describe('keepVisible', () => {
  it('should drop selected models a filter hides', () => {
    expect(keepVisible(['opus-5.5', 'llama3.1'], [modelOf('llama3.1')])).toEqual(['llama3.1']);
  });
});

describe('removeModelEdit', () => {
  it('should remove an unused model', () => {
    const document = catalogFixture();
    Object.assign(document.aliases.sonnet, { model: 'opus-5.5' });
    const edit = removeModelEdit('sonnet-5.5')(document);
    expect(edit.ok && Object.keys(edit.document.models as Record<string, unknown>)).toEqual(['opus-5.5', 'llama3.1']);
  });

  it('should refuse a model still in use on the catalog it is applied to', () => {
    expect(removeModelEdit('sonnet-5.5')(catalogFixture())).toEqual({ ok: false, reason: 'It is still in use. Used by Sonnet.' });
  });
});
