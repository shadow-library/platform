import { describe, expect, it } from 'bun:test';

import { type CatalogChange, describeChanges } from '../src/features/catalog/catalog-changes';
import { appliedNotice, type ChangeResult, changeResultNotice, CONFLICT_NOTICE, isSettled, undoNotice } from '../src/features/changes/change-notices';
import { affectedApps, changeLine, effectSentence, lockedSectionsSentence, summarizeChanges } from '../src/features/changes/change-summary';
import { credentialNamer, nameCredentialChanges } from '../src/features/changes/credential-names';
import { catalogFixture, CREDENTIAL_ID } from './catalog-fixture';

const ISSUE = { path: 'aliases.opus.model', code: 'unknown_model', message: 'Unknown model' };

function editedCatalog(): ReturnType<typeof catalogFixture> {
  const edited = catalogFixture();
  edited.tasks['novel-forge.chat'].routes = [{ when: { tier: 'economy' }, model: 'llama3.1' }, { model: 'sonnet-5.5' }];
  edited.budgets[0] = { ...edited.budgets[0], maxListCostUsd: 80 } as (typeof edited.budgets)[0];
  edited.models['sonnet-5.5'].pricePerMTok.input = 4;
  return edited;
}

describe('changeLine', () => {
  it('should split a field change into its lead, old value and new value without the entity label', () => {
    const change: CatalogChange = {
      area: 'model',
      entityKey: 'sonnet-5.5',
      entityLabel: 'Model Sonnet 5.5',
      kind: 'changed',
      field: 'pricePerMTok.input',
      before: '$3.00',
      after: '$4.00',
      sentence: 'Model Sonnet 5.5 — input price: $3.00 → $4.00 per million tokens',
    };
    expect(changeLine(change)).toEqual({ kind: 'transition', lead: 'Input price', before: '$3.00', after: '$4.00', suffix: ' per million tokens' });
  });

  it('should keep whole-entity and wording-only changes as capitalised text', () => {
    const added: CatalogChange = { area: 'alias', entityKey: 'haiku', entityLabel: 'Model name Haiku', kind: 'added', sentence: 'Model name Haiku — added, pointing to Opus 5.5' };
    expect(changeLine(added)).toEqual({ kind: 'text', text: 'Added, pointing to Opus 5.5' });
    const described: CatalogChange = {
      area: 'task',
      entityKey: 'novel-forge.chat',
      entityLabel: 'Novel Forge · Chat',
      kind: 'changed',
      field: 'description',
      before: 'Old',
      after: 'New',
      sentence: 'Novel Forge · Chat — description updated',
    };
    expect(changeLine(described)).toEqual({ kind: 'text', text: 'Description updated' });
  });
});

describe('summarizeChanges', () => {
  it('should group changes by area in a fixed order, then by item without repeating the kind of item', () => {
    const groups = summarizeChanges(describeChanges(catalogFixture(), editedCatalog()));
    expect(groups.map(group => group.title)).toEqual(['Budgets', 'Features', 'Models']);
    expect(groups[1]?.items.map(item => item.label)).toEqual(['Novel Forge · Chat']);
    expect(groups[1]?.items[0]?.lines[0]).toEqual({ kind: 'transition', lead: 'Default model', before: 'Opus 5.5', after: 'Sonnet 5.5', suffix: '' });
    expect(groups[2]?.items.map(item => item.label)).toEqual(['Sonnet 5.5']);
  });

  it('should be empty when nothing is described', () => {
    expect(summarizeChanges([])).toEqual([]);
  });
});

describe('affectedApps', () => {
  const appsFor = (edit: (document: ReturnType<typeof catalogFixture>) => void): string[] => {
    const after = catalogFixture();
    edit(after);
    return affectedApps(catalogFixture(), after, describeChanges(catalogFixture(), after));
  };

  it('should name the app of a feature or a budget', () => {
    expect(appsFor(document => (document.tasks['novel-forge.chat'].dataPolicy = 'in_cluster_only'))).toEqual(['novel-forge']);
    expect(appsFor(document => (document.budgets[1] = { ...document.budgets[1], maxCalls: 5 } as (typeof document.budgets)[1]))).toEqual(['memoir']);
  });

  it('should follow a model to every feature routing to it or offering a name for it', () => {
    expect(appsFor(document => (document.models['llama3.1'].pricePerMTok.input = 1))).toEqual(['memoir', 'novel-forge']);
    expect(appsFor(document => (document.models['sonnet-5.5'].pricePerMTok.input = 4))).toEqual(['novel-forge']);
  });

  it('should follow a provider to the apps using its models', () => {
    expect(appsFor(document => (document.providers.ollama.url = 'http://ollama-2:11434'))).toEqual(['memoir', 'novel-forge']);
    expect(appsFor(document => (document.providers.openrouter.url = 'https://openrouter.ai/api/v2'))).toEqual(['novel-forge']);
  });

  it('should count the apps on both sides of a change, and none for something unused', () => {
    const before = catalogFixture();
    before.tasks['novel-forge.chat'].aliases = ['opus'];
    const after = structuredClone(before);
    after.aliases.sonnet.model = 'llama3.1';
    expect(affectedApps(before, after, describeChanges(before, after))).toEqual([]);
  });
});

describe('effectSentence', () => {
  it('should say the change takes effect immediately, and for whom', () => {
    expect(effectSentence(['memoir', 'novel-forge'])).toBe('It takes effect immediately for Memoir and Novel Forge.');
    expect(effectSentence([])).toBe('It takes effect immediately. No app uses what it changes yet.');
  });
});

describe('lockedSectionsSentence', () => {
  const providerChange = { area: 'provider', sentence: 'Provider OpenRouter — url changed' } as CatalogChange;
  const budgetChange = { area: 'budget', sentence: 'Budget for Memoir — added' } as CatalogChange;

  it('should name the sections the role cannot change', () => {
    expect(lockedSectionsSentence([providerChange, budgetChange], { writeProviders: false, setBudgets: false })).toBe(
      "This changes providers and budgets, which your role can't change. Ask a Synapse administrator if you need it.",
    );
    expect(lockedSectionsSentence([providerChange], { writeProviders: false, setBudgets: true })).toContain('providers');
  });

  it('should allow a change to sections the role may change', () => {
    expect(lockedSectionsSentence([providerChange, budgetChange], { writeProviders: true, setBudgets: true })).toBeNull();
    expect(lockedSectionsSentence([{ area: 'task' } as CatalogChange], { writeProviders: false, setBudgets: false })).toBeNull();
  });
});

describe('changeResultNotice', () => {
  it('should say nothing for a change that went live or was cancelled', () => {
    expect(changeResultNotice({ kind: 'applied', version: 5, previous: 4 }, 'Opus', 'updated')).toBeNull();
    expect(changeResultNotice({ kind: 'cancelled' }, 'Opus', 'updated')).toBeNull();
  });

  it('should explain each way a change can fail, in plain words', () => {
    expect(changeResultNotice({ kind: 'invalid', issues: [ISSUE] }, 'Opus', 'added')).toEqual({
      intent: 'danger',
      title: "Opus wasn't added",
      body: 'Synapse refused the change:',
      issues: [ISSUE],
    });
    expect(changeResultNotice({ kind: 'refused', reason: 'Gone' }, 'Opus', 'removed')).toEqual({ intent: 'danger', title: "Opus wasn't removed", body: 'Gone' });
    expect(changeResultNotice({ kind: 'failed', message: 'offline' }, 'Opus', 'updated')).toEqual({ intent: 'danger', title: "Opus wasn't changed", body: 'offline' });
    expect(changeResultNotice({ kind: 'conflict' }, 'Opus', 'updated')).toBe(CONFLICT_NOTICE);
    expect(changeResultNotice({ kind: 'unchanged' }, 'Opus', 'updated')).toMatchObject({ intent: 'info', title: 'Nothing to change' });
  });

  it('should never mention drafts or publishing', () => {
    const kinds: ChangeResult[] = [
      { kind: 'invalid', issues: [] },
      { kind: 'unchanged' },
      { kind: 'refused', reason: 'r' },
      { kind: 'conflict' },
      { kind: 'failed', message: 'm' },
    ];
    const text = kinds.map(result => JSON.stringify(changeResultNotice(result, 'Opus', 'updated'))).join(' ');
    expect(text).not.toMatch(/draft|publish/i);
  });
});

describe('isSettled', () => {
  it('should close the form only when the change went live or there was nothing to change', () => {
    expect([isSettled({ kind: 'applied', version: 2, previous: 1 }), isSettled({ kind: 'unchanged' })]).toEqual([true, true]);
    expect([isSettled({ kind: 'cancelled' }), isSettled({ kind: 'invalid', issues: [] }), isSettled({ kind: 'conflict' })]).toEqual([false, false, false]);
  });
});

describe('appliedNotice', () => {
  it('should say which version is live and what changed', () => {
    expect(appliedNotice(12, [{ sentence: 'Provider OpenRouter — API key set to a stored key' }])).toEqual({
      intent: 'success',
      title: 'Live now (version 12)',
      body: 'Provider OpenRouter — API key set to a stored key.',
    });
    expect(appliedNotice(12, [{ sentence: 'A' }, { sentence: 'B' }, { sentence: 'C' }]).body).toBe('A, and 2 more changes.');
    expect(appliedNotice(12, []).body).toBeUndefined();
  });
});

describe('undoNotice', () => {
  const version = (number: number) => ({
    kind: 'done' as const,
    value: { version: number, state: 'PUBLISHED' as const, createdAt: '2026-10-25T00:00:00.000Z', createdByName: null },
  });

  it('should report the version the undo made live', () => {
    expect(undoNotice({ kind: 'done', outcome: version(13), undone: 12 })).toMatchObject({ intent: 'success', title: 'Change undone, live now (version 13)' });
  });

  it('should report an undo that changed nothing or was refused', () => {
    expect(undoNotice({ kind: 'done', outcome: version(12), undone: 12 })).toMatchObject({ intent: 'info', title: 'Nothing to undo' });
    expect(undoNotice({ kind: 'done', outcome: { kind: 'invalid', issues: [ISSUE] }, undone: 12 })).toMatchObject({ intent: 'danger', issues: [ISSUE] });
  });

  it('should refuse to revert a newer change someone else made', () => {
    expect(undoNotice({ kind: 'conflict' })).toMatchObject({ intent: 'warning', title: "Your change wasn't undone" });
    expect(undoNotice({ kind: 'forbidden' }).intent).toBe('danger');
    expect(undoNotice({ kind: 'failed', message: 'offline' }).body).toBe('offline');
  });
});

describe('nameCredentialChanges', () => {
  const keyChange = (before: ReturnType<typeof catalogFixture>, after: ReturnType<typeof catalogFixture>, names: { id: string; name: string }[] | undefined): string[] =>
    nameCredentialChanges(describeChanges(before, after), before, after, credentialNamer(names))
      .filter(change => change.field === 'credential')
      .map(change => changeLine(change))
      .map(line => (line.kind === 'text' ? line.text : `${line.lead}: ${line.before} → ${line.after}`));

  const withKey = (credential: string | undefined): ReturnType<typeof catalogFixture> => {
    const document = catalogFixture();
    if (credential) document.providers.openrouter.credential = credential;
    else delete (document.providers.openrouter as { credential?: string }).credential;
    return document;
  };

  const names = [
    { id: CREDENTIAL_ID, name: 'openrouter-prod' },
    { id: 'next', name: 'openrouter-2027' },
  ];

  it('should name the credentials when the viewer can list them', () => {
    expect(keyChange(withKey(undefined), withKey(CREDENTIAL_ID), names)).toEqual(['API key set to “openrouter-prod”']);
    expect(keyChange(withKey(CREDENTIAL_ID), withKey('next'), names)).toEqual(['API key: openrouter-prod → openrouter-2027']);
    expect(keyChange(withKey(CREDENTIAL_ID), withKey(undefined), names)).toEqual(['API key “openrouter-prod” removed']);
  });

  it('should say "a stored key" when the credentials cannot be listed or the id is unknown', () => {
    expect(keyChange(withKey(undefined), withKey(CREDENTIAL_ID), undefined)).toEqual(['API key set to a stored key']);
    expect(keyChange(withKey(CREDENTIAL_ID), withKey('gone'), names)).toEqual(['API key replaced with another stored key']);
    expect(keyChange(withKey(CREDENTIAL_ID), withKey(undefined), undefined)).toEqual(['API key removed']);
  });

  it('should leave every other change untouched', () => {
    const edited = editedCatalog();
    const changes = describeChanges(catalogFixture(), edited);
    expect(nameCredentialChanges(changes, catalogFixture(), edited, credentialNamer(names))).toEqual(changes);
  });
});
