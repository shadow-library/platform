import { describe, expect, it } from 'bun:test';

import {
  addAliasEdit,
  addRule,
  type AliasForm,
  type AliasFormContext,
  aliasFormOf,
  CONCURRENT_ALIAS_CHANGE,
  editedAliasFields,
  emptyAliasForm,
  removeRule,
  retargetAliasEdit,
  updateAliasEdit,
  updateRule,
  validateAliasForm,
  valueSuggestions,
} from '../src/features/aliases/alias-form';
import {
  aliasModelNeeds,
  aliasRows,
  availabilitySentence,
  featureNames,
  narrowedConditions,
  narrowingDescription,
  retireDescription,
  seenLabel,
  seenNote,
  unreadableAliasCount,
} from '../src/features/aliases/alias-view';
import { resolveSelectorKey } from '../src/features/catalog/catalog-keys';
import { type CatalogDocument } from '../src/features/catalog/catalog-document';
import { readAliases, readTasks } from '../src/features/catalog/catalog-readers';
import { previewChange } from '../src/features/catalog/catalog-change';
import { catalogFixture } from './catalog-fixture';

const ODD_ALIAS = {
  label: ' Odd ',
  model: 'sonnet-5.5',
  state: 'hidden',
  showVersion: false,
  available: {},
  note: 'unknown alias field',
};

function oddDocument(): CatalogDocument {
  const document: CatalogDocument = catalogFixture();
  return { ...document, aliases: { ...(document.aliases as Record<string, unknown>), odd: structuredClone(ODD_ALIAS) } };
}

function aliasIn(document: CatalogDocument, key: string): Record<string, unknown> {
  return (document.aliases as Record<string, Record<string, unknown>>)[key] ?? {};
}

function formFor(document: CatalogDocument, key: string): AliasForm {
  const alias = readAliases(document).find(entry => entry.key === key);
  if (!alias) throw new Error(`no readable alias ${key}`);
  return aliasFormOf(alias);
}

function editContext(key: string, initial: AliasForm): AliasFormContext {
  return { mode: { kind: 'edit', key }, takenKeys: [], initial };
}

function updateEdit(key: string, initial: AliasForm, form: AliasForm): ReturnType<typeof updateAliasEdit> {
  const result = validateAliasForm(form, editContext(key, initial));
  if (!result.ok) throw new Error(`invalid form: ${JSON.stringify(result.errors)}`);
  return updateAliasEdit(key, initial, result.fields, result.spec);
}

describe('availabilitySentence', () => {
  it('should say everywhere when there are no rules, absent or empty', () => {
    expect(availabilitySentence(undefined)).toBe('Everywhere');
    expect(availabilitySentence({})).toBe('Everywhere');
  });

  it('should name each rule in words', () => {
    expect(availabilitySentence({ tier: ['premium'] })).toBe('Only when Tier is premium');
    expect(availabilitySentence({ tier: ['balanced', 'premium'], content_mode: ['standard'] })).toBe('Only when Tier is balanced or premium and Content mode is standard');
  });

  it('should say nowhere when a rule allows no value', () => {
    expect(availabilitySentence({ tier: [] })).toBe('Nowhere: no Tier value is allowed');
  });
});

describe('seenLabel', () => {
  it('should add the model version only when the name opts in and the model has one', () => {
    expect(seenLabel({ label: 'Opus', showVersion: true }, { version: '5.5' })).toBe('Opus 5.5');
    expect(seenLabel({ label: 'Opus', showVersion: false }, { version: '5.5' })).toBe('Opus');
    expect(seenLabel({ label: 'Opus', showVersion: true }, {})).toBe('Opus');
  });
});

describe('aliasRows', () => {
  it('should describe each name with its target, state, availability and the features offering it', () => {
    const [opus] = aliasRows(catalogFixture());
    expect(opus).toMatchObject({
      key: 'opus',
      name: 'Opus',
      seen: 'Opus 5.5',
      target: { key: 'opus-5.5', name: 'Opus 5.5', price: '$15.00 in / $75.00 out per M tokens' },
      state: 'active',
      availability: 'Only when Tier is balanced or premium',
      usedBy: [{ key: 'novel-forge.chat', title: 'Novel Forge · Chat' }],
    });
  });

  it('should flag a target the catalog lacks and order names by state', () => {
    const document = oddDocument();
    aliasIn(document, 'odd').model = 'gone';
    const rows = aliasRows(document);
    expect(rows.map(row => row.key)).toEqual(['opus', 'sonnet', 'odd']);
    expect(rows[2]?.target).toEqual({ key: 'gone' });
  });
});

describe('aliasRows availability', () => {
  it('should say a retired name is not used rather than where it works', () => {
    const document = catalogFixture();
    document.aliases.opus.state = 'retired';
    expect(aliasRows(document).find(row => row.key === 'opus')?.availability).toBe('Not used — retired');
  });
});

describe('unreadableAliasCount', () => {
  it('should count entries the readers skip', () => {
    const document = oddDocument();
    aliasIn(document, 'odd').state = 'paused';
    expect(unreadableAliasCount(document)).toBe(1);
  });
});

describe('narrowedConditions', () => {
  it('should find nothing when availability only widens', () => {
    expect(narrowedConditions({ tier: ['premium'] }, { tier: ['premium', 'balanced'] })).toEqual([]);
    expect(narrowedConditions({ tier: ['premium'] }, undefined)).toEqual([]);
  });

  it('should name each allowed value a rule drops', () => {
    expect(narrowedConditions({ tier: ['balanced', 'premium'] }, { tier: ['premium'] })).toEqual(['Tier is balanced']);
  });

  it('should name a new rule as the requests it now refuses', () => {
    expect(narrowedConditions({}, { content_mode: ['standard'] })).toEqual(["Content mode is not standard or isn't sent"]);
  });

  it('should find nothing when the name was already available nowhere', () => {
    expect(narrowedConditions({ tier: [] }, { tier: ['premium'], plan: ['paid'] })).toEqual([]);
  });

  it('should treat condition names that Object.prototype has as ordinary keys', () => {
    expect(narrowedConditions({}, { constructor: ['x'] })).toEqual(["Constructor is not x or isn't sent"]);
    expect(narrowedConditions({ tier: ['a'] }, { tier: ['a'], toString: ['y'], valueOf: ['z'] })).toHaveLength(2);
    const proto = JSON.parse('{"__proto__": ["a", "b"]}') as Record<string, string[]>;
    expect(narrowedConditions(proto, JSON.parse('{"__proto__": ["a"]}') as Record<string, string[]>)).toEqual(['Proto is b']);
    expect(narrowedConditions({}, proto)).toEqual(["Proto is not a or b or isn't sent"]);
  });

  it('should describe who gets errors, one condition or several', () => {
    expect(narrowingDescription('Opus', ['Tier is balanced'])).toBe('Anyone who chose Opus will get errors until they pick another model if Tier is balanced.');
    expect(narrowingDescription('Opus', ['Tier is balanced', "Plan is not paid or isn't sent"])).toBe(
      "Anyone who chose Opus will get errors until they pick another model if Tier is balanced, or if Plan is not paid or isn't sent.",
    );
  });
});

describe('aliasModelNeeds', () => {
  it('should need nothing for a retired name, since the server skips the check', () => {
    const document = catalogFixture();
    document.aliases.opus.state = 'retired';
    expect(aliasModelNeeds(document, 'opus')).toEqual({});
    expect(aliasModelNeeds(catalogFixture(), 'opus', 'retired')).toEqual({});
    expect(aliasModelNeeds(document, 'opus', 'active')).toEqual({ requires: ['tools'], kind: 'chat' });
  });

  it('should gather the needs of every feature offering the name', () => {
    expect(aliasModelNeeds(catalogFixture(), 'opus')).toEqual({ requires: ['tools'], kind: 'chat' });
  });

  it('should need nothing for a name no feature offers', () => {
    expect(aliasModelNeeds(oddDocument(), 'odd')).toEqual({});
  });
});

describe('featureNames', () => {
  const tasks = new Map(readTasks(catalogFixture()).map(task => [task.key, task]));

  it('should name a known feature from the catalog', () => {
    expect(featureNames('novel-forge', 'novel-forge.chat', tasks)).toEqual({ app: 'Novel Forge', feature: 'Chat' });
  });

  it('should name a feature the catalog no longer has from its key', () => {
    expect(featureNames('memoir', 'memoir.daily-insight', tasks)).toEqual({ app: 'Memoir', feature: 'Daily insight' });
  });
});

describe('retireDescription', () => {
  it('should name the features that stop offering it', () => {
    expect(retireDescription('Opus', [{ key: 'novel-forge.chat', title: 'Novel Forge · Chat' }])).toContain('Novel Forge · Chat will stop offering it.');
  });
});

describe('resolveSelectorKey', () => {
  it('should map a typed name onto a selector the catalog uses', () => {
    expect(resolveSelectorKey('Content mode', ['content_mode', 'tier'])).toBe('content_mode');
    expect(resolveSelectorKey(' plan ', ['tier'])).toBe('plan');
  });
});

describe('valueSuggestions', () => {
  it('should offer values in use that the rule lacks', () => {
    expect(valueSuggestions({ tier: ['balanced', 'premium'] }, 'tier', ['premium'])).toEqual(['balanced']);
  });

  it('should offer nothing for condition names that Object.prototype has', () => {
    expect(valueSuggestions({ tier: ['a'] }, 'constructor', [])).toEqual([]);
    expect(valueSuggestions({ tier: ['a'] }, '__proto__', [])).toEqual([]);
    expect(valueSuggestions(JSON.parse('{"__proto__": ["a"]}') as Record<string, string[]>, '__proto__', [])).toEqual(['a']);
  });
});

describe('rule rows', () => {
  it('should add, update and remove rules by row id', () => {
    const rules = addRule(addRule([]));
    expect(rules.map(rule => rule.rowId)).toEqual([0, 1]);
    const updated = updateRule(rules, 1, { selector: 'tier' });
    expect(updated[1]).toEqual({ rowId: 1, selector: 'tier', values: [] });
    expect(removeRule(updated, 0).map(rule => rule.rowId)).toEqual([1]);
  });
});

describe('validateAliasForm', () => {
  const addContext: AliasFormContext = { mode: { kind: 'add' }, takenKeys: ['opus', 'Legacy'], initial: emptyAliasForm() };
  const valid: AliasForm = { ...emptyAliasForm(), key: 'haiku', label: 'Haiku', model: 'sonnet-5.5' };

  it('should accept a complete new name', () => {
    expect(validateAliasForm(valid, addContext)).toMatchObject({ ok: true, key: 'haiku', spec: { label: 'Haiku', model: 'sonnet-5.5', state: 'active', showVersion: false } });
  });

  it('should refuse a key already taken, whatever its case or state', () => {
    expect(validateAliasForm({ ...valid, key: 'opus' }, addContext)).toMatchObject({ ok: false, errors: { fields: { key: expect.any(String) } } });
    expect(validateAliasForm({ ...valid, key: 'legacy' }, addContext)).toMatchObject({ ok: false, errors: { fields: { key: expect.any(String) } } });
  });

  it('should refuse a key the server would reject', () => {
    expect(validateAliasForm({ ...valid, key: '-bad key' }, addContext).ok).toBe(false);
  });

  it('should require a name and a model', () => {
    expect(validateAliasForm({ ...valid, label: ' ', model: '' }, addContext)).toMatchObject({
      ok: false,
      errors: { fields: { label: expect.any(String), model: expect.any(String) } },
    });
  });

  it('should refuse a rule without a condition or values, and a repeated condition', () => {
    const form = {
      ...valid,
      rules: [
        { rowId: 0, selector: 'tier', values: ['premium'] },
        { rowId: 1, selector: 'tier', values: [' '] },
        { rowId: 2, selector: '', values: ['x'] },
      ],
    };
    const result = validateAliasForm(form, addContext);
    expect(result.ok ? null : result.errors.rules).toEqual({
      1: { selector: expect.any(String), values: 'Add at least one value' },
      2: { selector: 'Choose or type a condition' },
    });
  });

  it('should trim and deduplicate allowed values', () => {
    const result = validateAliasForm({ ...valid, rules: [{ rowId: 0, selector: ' tier ', values: ['premium', ' premium ', 'economy'] }] }, addContext);
    expect(result.ok && result.spec.available).toEqual({ tier: ['premium', 'economy'] });
  });

  it('should not block an edit on a stored rule the editor left alone', () => {
    const document = oddDocument();
    aliasIn(document, 'odd').available = { tier: [] };
    const initial = formFor(document, 'odd');
    expect(validateAliasForm({ ...initial, label: 'Renamed' }, editContext('odd', initial))).toMatchObject({ ok: true, fields: ['label'] });
  });
});

describe('editedAliasFields', () => {
  it('should ignore whitespace and report real changes', () => {
    const initial = formFor(catalogFixture(), 'opus');
    expect(editedAliasFields(initial, { ...initial, label: ' Opus ' })).toEqual([]);
    expect(editedAliasFields(initial, { ...initial, state: 'hidden', showVersion: false })).toEqual(['state', 'showVersion']);
  });
});

describe('updateAliasEdit', () => {
  it('should change nothing when the editor changed nothing, keeping unknown fields and an empty rule set', () => {
    const document = oddDocument();
    const initial = formFor(document, 'odd');
    expect(previewChange({ version: 3, document }, updateEdit('odd', initial, { ...initial }))).toEqual({ kind: 'unchanged' });
  });

  it('should write only the edited field over the stored entry', () => {
    const document = oddDocument();
    const initial = formFor(document, 'odd');
    const edit = updateEdit('odd', initial, { ...initial, state: 'active' })(document);
    expect(edit.ok && aliasIn(edit.document, 'odd')).toEqual({ ...ODD_ALIAS, state: 'active' });
  });

  it('should remove show-version when the editor turns it off', () => {
    const document = catalogFixture();
    const initial = formFor(document, 'opus');
    const edit = updateEdit('opus', initial, { ...initial, showVersion: false })(document);
    expect(edit.ok && Object.keys(aliasIn(edit.document, 'opus'))).not.toContain('showVersion');
  });

  it('should trim an edited label and remove a cleared description', () => {
    const document = oddDocument();
    aliasIn(document, 'odd').description = 'Old';
    const initial = formFor(document, 'odd');
    const edit = updateEdit('odd', initial, { ...initial, label: '  Renamed  ', description: ' ' })(document);
    const { description: _dropped, ...rest } = { ...ODD_ALIAS, description: 'Old' };
    expect(edit.ok && aliasIn(edit.document, 'odd')).toEqual({ ...rest, label: 'Renamed' });
  });

  it('should write availability rules and drop the field when they are all removed', () => {
    const document = catalogFixture();
    const initial = formFor(document, 'opus');
    const widened = updateEdit('opus', initial, { ...initial, rules: [{ rowId: 0, selector: 'tier', values: ['balanced', 'premium', 'economy'] }] })(document);
    expect(widened.ok && aliasIn(widened.document, 'opus').available).toEqual({ tier: ['balanced', 'premium', 'economy'] });
    const cleared = updateEdit('opus', initial, { ...initial, rules: [] })(document);
    expect(cleared.ok && Object.keys(aliasIn(cleared.document, 'opus'))).not.toContain('available');
  });

  it('should keep a change someone else made meanwhile to a field the editor left alone', () => {
    const initial = formFor(catalogFixture(), 'opus');
    const fresh = catalogFixture();
    fresh.aliases.opus.model = 'sonnet-5.5';
    const edit = updateEdit('opus', initial, { ...initial, label: 'Opus Max' })(fresh);
    expect(edit.ok && aliasIn(edit.document, 'opus')).toMatchObject({ label: 'Opus Max', model: 'sonnet-5.5' });
  });

  it('should refuse when someone else changed a field the editor also changed', () => {
    const initial = formFor(catalogFixture(), 'opus');
    const fresh = catalogFixture();
    fresh.aliases.opus.label = 'Opus Prime';
    expect(updateEdit('opus', initial, { ...initial, label: 'Opus Max' })(fresh)).toEqual({ ok: false, reason: CONCURRENT_ALIAS_CHANGE });
  });

  it('should not mistake a reordered rule set for someone else changing it', () => {
    const document = catalogFixture();
    document.aliases.opus.available = { tier: ['balanced'], plan: ['paid'] } as never;
    const initial = formFor(document, 'opus');
    const fresh = catalogFixture();
    fresh.aliases.opus.available = { plan: ['paid'], tier: ['balanced'] } as never;
    const edit = updateEdit('opus', initial, { ...initial, rules: initial.rules.slice(0, 1) })(fresh);
    expect(edit.ok && aliasIn(edit.document, 'opus').available).toEqual({ tier: ['balanced'] });
  });

  it('should refuse to edit a name the catalog lost meanwhile', () => {
    const initial = formFor(catalogFixture(), 'sonnet');
    const document = catalogFixture();
    const { sonnet: _removed, ...aliases } = document.aliases;
    expect(updateEdit('sonnet', initial, { ...initial, label: 'Sonnet+' })({ ...document, aliases }).ok).toBe(false);
  });
});

describe('retargetAliasEdit', () => {
  it('should point the name at the new model and keep its other fields', () => {
    const document = oddDocument();
    const edit = retargetAliasEdit('odd', 'sonnet-5.5', 'opus-5.5')(document);
    expect(edit.ok && aliasIn(edit.document, 'odd')).toEqual({ ...ODD_ALIAS, model: 'opus-5.5' });
  });

  it('should change nothing when the name already points there', () => {
    expect(previewChange({ version: 3, document: catalogFixture() }, retargetAliasEdit('opus', 'llama3.1', 'opus-5.5'))).toEqual({ kind: 'unchanged' });
  });

  it('should refuse when someone else moved the name meanwhile', () => {
    expect(retargetAliasEdit('opus', 'llama3.1', 'sonnet-5.5')(catalogFixture())).toEqual({ ok: false, reason: CONCURRENT_ALIAS_CHANGE });
  });
});

describe('addAliasEdit', () => {
  const spec = { label: 'Haiku', model: 'sonnet-5.5', state: 'active' as const, showVersion: false };

  it('should add a new name to the catalog', () => {
    const edit = addAliasEdit('haiku', spec)(catalogFixture());
    expect(edit.ok && aliasIn(edit.document, 'haiku')).toEqual({ label: 'Haiku', model: 'sonnet-5.5', state: 'active' });
  });

  it('should refuse a key the catalog gained meanwhile, retired or differently cased', () => {
    const document = catalogFixture();
    document.aliases.sonnet.state = 'retired';
    expect(addAliasEdit('sonnet', spec)(document).ok).toBe(false);
    expect(addAliasEdit('SONNET', spec)(document).ok).toBe(false);
  });
});

describe('seenNote', () => {
  it('should mention what users see only when it differs from the name', () => {
    expect(seenNote({ name: 'Opus', seen: 'Opus 5.5' })).toBe('Users see "Opus 5.5"');
    expect(seenNote({ name: 'Opus', seen: 'Opus' })).toBeUndefined();
  });
});
