import { describe, expect, it } from 'bun:test';
import { ApiError } from '@shadow-library/web';

import { type CatalogChange, describeChanges } from '../src/features/catalog/catalog-changes';
import {
  blockedTitle,
  buildReview,
  changeCountLines,
  changeLine,
  changesBudgets,
  discardBlocker,
  discardDescription,
  discardFailureOf,
  draftOriginText,
  fixTargetOf,
  publishBlocker,
  publishSummary,
  readinessOf,
  WHOLE_CATALOG_ID,
} from '../src/features/changes/changes-review';
import { catalogFixture } from './catalog-fixture';

const issue = (path: string, code = 'unknown_model'): { path: string; code: string; message: string } => ({ path, code, message: `${code} at ${path}` });

function editedDraft(): ReturnType<typeof catalogFixture> {
  const draft = catalogFixture();
  draft.tasks['novel-forge.chat'].routes = [{ when: { tier: 'economy' }, model: 'llama3.1' }, { model: 'sonnet-5.5' }];
  draft.budgets[0] = { ...draft.budgets[0], maxListCostUsd: 80 } as (typeof draft.budgets)[0];
  draft.models['sonnet-5.5'].pricePerMTok.input = 4;
  return draft;
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

describe('buildReview', () => {
  it('should group changes by area in the fixed order and then by entity', () => {
    const before = catalogFixture();
    const after = editedDraft();
    const review = buildReview(describeChanges(before, after), [], after);
    expect(review.areas.map(area => area.title)).toEqual(['Budgets', 'Features', 'Models']);
    expect(review.areas[1]?.entities.map(entity => entity.label)).toEqual(['Novel Forge · Chat']);
    expect(review.areas[1]?.entities[0]?.lines[0]).toEqual({ kind: 'transition', lead: 'Default model', before: 'Opus 5.5', after: 'Sonnet 5.5', suffix: '' });
    expect(review.changeCount).toBe(3);
  });

  it('should attach each issue to the entity it belongs to and keep unowned ones for the whole catalog', () => {
    const after = editedDraft();
    const issues = [issue('tasks.novel-forge.chat.routes[1].model'), issue('', 'invalid_type'), issue('budgets[0].maxListCostUsd', 'invalid_value')];
    const review = buildReview(describeChanges(catalogFixture(), after), issues, after);
    const chat = review.areas.find(area => area.area === 'task')?.entities[0];
    expect(chat?.issues.map(entry => entry.code)).toEqual(['unknown_model']);
    expect(review.areas[0]?.entities[0]?.issues.map(entry => entry.code)).toEqual(['invalid_value']);
    expect(review.catalogIssues.map(entry => entry.code)).toEqual(['invalid_type']);
    expect(review.issueCount).toBe(3);
  });

  it('should add a labelled group for an entity that has problems but no changes', () => {
    const after = editedDraft();
    const review = buildReview(describeChanges(catalogFixture(), after), [issue('aliases.opus.model'), issue('providers.openrouter.credential', 'credential_revoked')], after);
    const opus = review.areas.find(area => area.area === 'alias')?.entities[0];
    expect(opus).toMatchObject({ label: 'Model name Opus', lines: [], fix: { screen: 'alias', alias: 'opus' } });
    expect(review.areas.find(area => area.area === 'alias')?.changeCount).toBe(0);
    expect(review.areas.find(area => area.area === 'provider')?.entities[0]?.label).toBe('Provider Openrouter');
  });

  it('should collect top-level settings outside the known sections into one group', () => {
    const after = { ...catalogFixture(), version: 2, owner: 'platform' };
    const review = buildReview(describeChanges(catalogFixture(), after), [], after);
    expect(review.areas).toHaveLength(1);
    expect(review.areas[0]).toMatchObject({ area: 'other', title: 'Other', changeCount: 2 });
    expect(review.areas[0]?.entities).toHaveLength(1);
  });

  it('should give every entity a unique anchor', () => {
    const after = editedDraft();
    const review = buildReview(describeChanges(catalogFixture(), after), [issue('aliases.opus.model')], after);
    const ids = review.areas.flatMap(area => area.entities.map(entity => entity.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('fixTargetOf', () => {
  it('should send each area to its structured screen and anything else to the advanced editor', () => {
    expect(fixTargetOf('task', 'novel-forge.chat')).toEqual({ screen: 'feature', task: 'novel-forge.chat' });
    expect(fixTargetOf('alias', 'opus')).toEqual({ screen: 'alias', alias: 'opus' });
    expect(fixTargetOf('budget', 'memoir/app/30d')).toEqual({ screen: 'budgets' });
    expect(fixTargetOf('model', 'llama3.1')).toEqual({ screen: 'models' });
    expect(fixTargetOf('provider', 'ollama')).toEqual({ screen: 'providers' });
    expect(fixTargetOf('other', 'version')).toEqual({ screen: 'advanced' });
  });
});

describe('readinessOf', () => {
  const after = editedDraft();
  const changes = describeChanges(catalogFixture(), after);

  it('should be ready when the checks found nothing', () => {
    expect(readinessOf({ status: 'checked', issues: [] }, buildReview(changes, [], after))).toEqual({ kind: 'ready' });
  });

  it('should link to every group that has problems, the whole catalog last', () => {
    const issues = [issue('tasks.novel-forge.chat.routes[1].model'), issue('tasks.novel-forge.chat.routes[0].model'), issue('', 'invalid_type')];
    const review = buildReview(changes, issues, after);
    const readiness = readinessOf({ status: 'checked', issues }, review);
    expect(readiness).toMatchObject({ kind: 'blocked', problems: 3 });
    if (readiness.kind !== 'blocked') return;
    expect(readiness.links.map(link => [link.label, link.count])).toEqual([
      ['Novel Forge · Chat', 2],
      ['Whole catalog', 1],
    ]);
    expect(readiness.links.at(-1)?.id).toBe(WHOLE_CATALOG_ID);
  });

  it('should report checks that are running, failed or not allowed', () => {
    const review = buildReview(changes, [], after);
    expect(readinessOf({ status: 'checking' }, review)).toEqual({ kind: 'checking' });
    expect(readinessOf({ status: 'unavailable', message: 'Down' }, review)).toEqual({ kind: 'unavailable', message: 'Down' });
    expect(readinessOf({ status: 'not_allowed' }, review)).toEqual({ kind: 'unchecked' });
  });

  it('should word the problem count', () => {
    expect(blockedTitle(1)).toBe('1 problem must be fixed before publishing');
    expect(blockedTitle(4)).toBe('4 problems must be fixed before publishing');
  });
});

describe('publishBlocker', () => {
  it('should allow publishing only when nothing is known to block it and the diff is of the draft shown', () => {
    expect(publishBlocker({ kind: 'ready' }, 'current')).toBeNull();
    expect(publishBlocker({ kind: 'unchecked' }, 'current')).toBeNull();
    expect(publishBlocker({ kind: 'unavailable', message: 'Down' }, 'current')).toBeNull();
    expect(publishBlocker({ kind: 'blocked', problems: 1, links: [] }, 'current')).toContain('Fix the problems');
    expect(publishBlocker({ kind: 'checking' }, 'current')).toContain('Checking');
    expect(publishBlocker({ kind: 'ready' }, 'loading')).toContain('Comparing');
    expect(publishBlocker({ kind: 'ready' }, 'failed')).toContain("couldn't be loaded");
    expect(publishBlocker({ kind: 'ready' }, 'stale')).toContain('changed while you were reviewing');
  });
});

describe('discardBlocker', () => {
  const access = { setBudgets: false, writeProviders: false };

  it('should refuse a discard that reverts budgets the role cannot edit', () => {
    expect(discardBlocker(editedDraft(), catalogFixture(), access)).toContain('changes budgets');
    expect(discardBlocker(editedDraft(), catalogFixture(), { setBudgets: true, writeProviders: false })).toBeNull();
  });

  it('should catch a budget reorder and an unknown budget field that read as no change', () => {
    const reordered = catalogFixture();
    reordered.budgets.reverse();
    expect(discardBlocker(reordered, catalogFixture(), access)).toContain('changes budgets');
    const extra = { ...catalogFixture(), budgets: catalogFixture().budgets.map(budget => ({ ...budget, owner: 'finance' })) };
    expect(discardBlocker(extra, catalogFixture(), access)).toContain('changes budgets');
  });

  it('should name both sections when both are locked', () => {
    const draft = editedDraft();
    draft.providers.ollama.url = 'http://ollama:11435';
    expect(discardBlocker(draft, catalogFixture(), access)).toContain('budgets and providers');
  });

  it('should treat an absent section as empty on either side, ignoring key order', () => {
    const { budgets: _budgets, providers: _providers, ...bare } = catalogFixture();
    expect(discardBlocker({ ...bare, budgets: [], providers: {} }, bare, access)).toBeNull();
    expect(discardBlocker(bare, null, access)).toBeNull();
    expect(discardBlocker(catalogFixture(), null, access)).toContain('budgets and providers');
    const reversedKeys = { ...catalogFixture(), providers: Object.fromEntries(Object.entries(catalogFixture().providers).reverse()) };
    expect(discardBlocker(reversedKeys, catalogFixture(), access)).toBeNull();
  });
});

describe('discardDescription', () => {
  it('should agree with the number of changes', () => {
    expect(discardDescription(1)).toStartWith('The 1 unpublished change is thrown away');
    expect(discardDescription(3)).toStartWith('All 3 unpublished changes are thrown away');
  });
});

describe('discardFailureOf', () => {
  const failure = (status: number): ApiError => new ApiError(status, { type: 'CLIENT_ERROR', code: 'X', message: `status ${status}` });

  it('should tell a conflict, a refusal and a missing draft apart from other failures', () => {
    expect(discardFailureOf(failure(409))).toEqual({ kind: 'conflict' });
    expect(discardFailureOf(failure(403))).toEqual({ kind: 'forbidden' });
    expect(discardFailureOf(failure(404))).toEqual({ kind: 'absent' });
    expect(discardFailureOf(failure(500))).toEqual({ kind: 'failed', message: 'status 500' });
    expect(discardFailureOf('boom')).toEqual({ kind: 'failed', message: 'The draft could not be discarded' });
  });
});

describe('changeCountLines', () => {
  it('should count changes and the entities they touch in plain words', () => {
    const draft = editedDraft();
    draft.tasks['novel-forge.chat'].effort.default = 'high';
    const review = buildReview(describeChanges(catalogFixture(), draft), [issue('aliases.opus.model')], draft);
    expect(changeCountLines(review)).toEqual(['1 change to 1 budget', '2 changes to 1 feature', '1 change to 1 model']);
    expect(publishSummary(review)).toBe('This publishes 1 change to 1 budget, 2 changes to 1 feature, and 1 change to 1 model.');
    expect(changesBudgets(review)).toBe(true);
  });
});

describe('draftOriginText', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const draft = { createdAt: '2026-10-25T10:00:00Z', createdBy: 'subject-1' };

  it('should name only the viewer', () => {
    expect(draftOriginText(draft, 'subject-1', now)).toBe('Draft started 2h ago · last saved by you');
    expect(draftOriginText(draft, 'subject-2', now)).toBe('Draft started 2h ago');
    expect(draftOriginText(draft, undefined, now)).toBe('Draft started 2h ago');
  });

  it('should print an absolute time until the clock is available', () => {
    expect(draftOriginText({ createdAt: draft.createdAt }, 'subject-1', null)).toBe('Draft started Oct 25, 2026 10:00 UTC');
  });
});
