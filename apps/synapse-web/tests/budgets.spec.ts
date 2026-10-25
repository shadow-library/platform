import { describe, expect, it } from 'bun:test';

import { type CatalogChange } from '../src/features/catalog/catalog-changes';
import { type BudgetEntry } from '../src/features/catalog/catalog-spec.types';
import { NOTE_MAX_LENGTH } from '../src/features/catalog/catalog-change';
import {
  BUDGET_FORM_MESSAGES,
  budgetApps,
  budgetBasisOf,
  budgetFormOf,
  budgetNote,
  budgetsOf,
  planBudgetPublish,
  sameBudgets,
  sharesCounter,
  validateBudgetForm,
  withBudgetChange,
} from '../src/features/budgets/budget-form';
import { budgetCards, budgetTitle, catalogCards, limitLevel, limitsText, metersOf, percentUsed, statusCards, subjectSummary } from '../src/features/budgets/budget-view';
import { type BudgetStatusEntryResponse, type BudgetStatusResponse } from '../src/lib/apis/api-types.gen';

const WINDOW = { windowStart: '2026-10-25T14:00:00.000Z', windowEnd: '2026-10-25T15:00:00.000Z' };

function appEntry(overrides: Partial<BudgetStatusEntryResponse> = {}): BudgetStatusEntryResponse {
  return {
    index: 0,
    app: 'novel-forge',
    per: 'app',
    window: '1h',
    maxCalls: 1000,
    maxListCostUsd: 50,
    ...WINDOW,
    usage: { kind: 'app', calls: 120, listCostUsd: 31.2 },
    ...overrides,
  };
}

function subjectEntry(overrides: Partial<BudgetStatusEntryResponse> = {}): BudgetStatusEntryResponse {
  return {
    index: 1,
    app: 'novel-forge',
    per: 'subject',
    window: '1h',
    maxListCostUsd: 50,
    ...WINDOW,
    usage: {
      kind: 'subject',
      activeSubjects: 12,
      atLimit: 1,
      top: [
        { subjectType: 'user', subjectId: 'u-1', calls: 40, listCostUsd: 50 },
        { subjectType: 'user', subjectId: 'u-2', calls: 90, listCostUsd: 31.2 },
      ],
    },
    ...overrides,
  };
}

const status = (version: number, budgets: BudgetStatusEntryResponse[]): BudgetStatusResponse => ({ catalogVersion: version, budgets });

const entry = (index: number, overrides: Partial<BudgetEntry> = {}): BudgetEntry => ({ index, app: 'novel-forge', per: 'app', window: '1h', maxListCostUsd: 50, ...overrides });

describe('limitLevel', () => {
  it('should stay clear below 80 % and turn near at 80 %', () => {
    expect(limitLevel(39.99, 50)).toBe('clear');
    expect(limitLevel(40, 50)).toBe('near');
  });

  it('should be at the limit from 100 % on, including overshoot', () => {
    expect(limitLevel(50, 50)).toBe('at');
    expect(limitLevel(55, 50)).toBe('at');
  });

  it('should treat a zero limit as reached', () => {
    expect(limitLevel(0, 0)).toBe('at');
    expect(percentUsed(0, 0)).toBe(100);
  });

  it('should round the percentage down without floating-point noise', () => {
    expect(percentUsed(31.2, 50)).toBe(62);
    expect(percentUsed(0.29, 1)).toBe(29);
    expect(percentUsed(49.99, 50)).toBe(99);
    expect(percentUsed(60, 50)).toBe(120);
  });
});

describe('budget text', () => {
  it('should title a budget as a sentence of app, scope and window', () => {
    expect(budgetTitle({ app: 'novel-forge', per: 'subject', window: '1h' })).toBe('Novel Forge — each user — per hour');
    expect(budgetTitle({ app: 'memoir', per: 'app', window: '30d' })).toBe('Memoir — whole app — per 30 days');
  });

  it('should list whichever limits are set', () => {
    expect(limitsText({ maxListCostUsd: 50, maxCalls: 1000 })).toBe('$50.00 and 1,000 calls');
    expect(limitsText({ maxCalls: 1 })).toBe('1 call');
    expect(limitsText({ maxListCostUsd: 50 })).toBe('$50.00');
    expect(limitsText({})).toBe('No limit set');
  });

  it('should label each meter with its amount, limit and percentage', () => {
    const meters = metersOf({ maxListCostUsd: 50, maxCalls: 1000 }, { listCostUsd: 31.2, calls: 850 });
    expect(meters.map(meter => [meter.text, meter.intent])).toEqual([
      ['$31.20 of $50.00 (62%)', 'accent'],
      ['850 of 1,000 calls (85%)', 'warning'],
    ]);
  });

  it('should summarise a per-user budget', () => {
    const budget = { app: 'novel-forge', per: 'subject' as const, window: '1h' as const, maxListCostUsd: 50 };
    expect(subjectSummary(budget, { activeSubjects: 12, atLimit: 1, top: [{ subjectType: 'user', subjectId: 'u', calls: 3, listCostUsd: 31.2 }] })).toBe(
      '12 users active this hour · 1 at its limit · highest $31.20 of $50.00',
    );
    expect(
      subjectSummary({ ...budget, window: '1d', maxCalls: 100 }, { activeSubjects: 1, atLimit: 0, top: [{ subjectType: 'user', subjectId: 'u', calls: 7, listCostUsd: 2 }] }),
    ).toBe('1 user active today · none at the limit · highest $2.00 of $50.00 · highest 7 of 100 calls');
    expect(subjectSummary(budget, { activeSubjects: 0, atLimit: 0, top: [] })).toBe('No users active this hour');
  });
});

describe('statusCards', () => {
  it('should show a per-app budget as cost and call meters with the worst level on the card', () => {
    const [card] = statusCards(status(4, [appEntry({ usage: { kind: 'app', calls: 990, listCostUsd: 10 } })]));
    expect(card?.title).toBe('Novel Forge — whole app — per hour');
    expect(card?.resets).toBe('Oct 25, 2026 15:00 UTC');
    expect(card?.level).toBe('near');
  });

  it('should mark a per-user budget at its limit when the server counts anyone there', () => {
    const [card] = statusCards(status(4, [subjectEntry()]));
    expect(card?.level).toBe('at');
    expect(card?.usage.kind === 'subject' && card.usage.rows.map(row => [row.subjectId, row.percent, row.intent])).toEqual([
      ['u-1', 100, 'danger'],
      ['u-2', 62, 'accent'],
    ]);
  });

  it('should flag the app’s own counter among the top users', () => {
    const top = [{ subjectType: 'app', subjectId: 'novel-forge', calls: 5, listCostUsd: 1 }];
    const [card] = statusCards(status(4, [subjectEntry({ usage: { kind: 'subject', activeSubjects: 1, atLimit: 0, top } })]));
    expect(card?.usage.kind === 'subject' && card.usage.appCounterShown).toBe(true);
    expect(card?.level).toBe('clear');
  });

  it('should order cards by catalog position', () => {
    expect(statusCards(status(4, [subjectEntry(), appEntry()])).map(card => card.index)).toEqual([0, 1]);
  });
});

describe('budgetCards', () => {
  it('should use the report alone when the active catalog is unknown', () => {
    expect(budgetCards({ status: status(4, [appEntry()]) })).toHaveLength(1);
    expect(budgetCards({})).toEqual([]);
  });

  it('should fall back to the catalog when live usage failed', () => {
    const cards = budgetCards({ active: { version: 4, budgets: [entry(0)] } });
    expect(cards[0]?.usage).toEqual({ kind: 'unavailable', reason: 'failed' });
    expect(catalogCards([entry(2)])[0]?.index).toBe(2);
  });

  it('should take limits from a newer active catalog and counters from the trailing report', () => {
    const cards = budgetCards({ status: status(3, [appEntry()]), active: { version: 4, budgets: [entry(0, { maxListCostUsd: 40 }), entry(1, { per: 'subject' })] } });
    expect(cards[0]?.limits).toBe('$40.00');
    expect(cards[0]?.usage.kind === 'app' && cards[0].usage.meters[0]?.text).toBe('$31.20 of $40.00 (78%)');
    expect(cards[1]?.usage).toEqual({ kind: 'unavailable', reason: 'pending' });
  });

  it('should drop the at-limit count when it was measured against other limits', () => {
    const cards = budgetCards({ status: status(3, [subjectEntry({ index: 0 })]), active: { version: 4, budgets: [entry(0, { per: 'subject', maxListCostUsd: 80 })] } });
    expect(cards[0]?.usage.kind === 'subject' && cards[0].usage.summary).toBe('12 users active this hour · highest $50.00 of $80.00');
    expect(cards[0]?.level).toBe('clear');
  });

  it('should not lend counters to a budget whose window changed', () => {
    const cards = budgetCards({ status: status(3, [appEntry()]), active: { version: 4, budgets: [entry(0, { window: '1d' })] } });
    expect(cards[0]?.usage).toEqual({ kind: 'unavailable', reason: 'pending' });
  });
});

describe('validateBudgetForm', () => {
  const base = { app: 'novel-forge', per: 'subject' as const, window: '1h' as const, cost: '', calls: '' };

  it('should require at least one limit, like the server’s budget_without_limit', () => {
    expect(validateBudgetForm(base)).toEqual({ ok: false, errors: { cost: BUDGET_FORM_MESSAGES.noLimit } });
  });

  it('should require an app', () => {
    expect(validateBudgetForm({ ...base, app: '', cost: '5' })).toEqual({ ok: false, errors: { app: BUDGET_FORM_MESSAGES.app } });
  });

  it('should accept dollar signs and thousands separators', () => {
    expect(validateBudgetForm({ ...base, cost: ' $1,250.50 ', calls: '1,000' })).toEqual({
      ok: true,
      budget: { app: 'novel-forge', per: 'subject', window: '1h', maxCalls: 1000, maxListCostUsd: 1250.5 },
    });
  });

  it('should keep a zero limit the edited budget already had, but refuse a newly typed one', () => {
    const original = { app: 'novel-forge', per: 'subject' as const, window: '1h' as const, maxCalls: 0, maxListCostUsd: 5 };
    expect(validateBudgetForm({ ...base, calls: '0', cost: '5' }, original)).toEqual({ ok: true, budget: original });
    expect(validateBudgetForm({ ...base, cost: '0' }, original)).toEqual({ ok: false, errors: { cost: BUDGET_FORM_MESSAGES.costZero } });
    expect(validateBudgetForm({ ...base, calls: '0' })).toEqual({ ok: false, errors: { calls: BUDGET_FORM_MESSAGES.callsZero } });
  });

  it('should refuse amounts whose notation is ambiguous', () => {
    for (const cost of ['1.250,50', '1,25', '12,50', '1,2345', '50.', '.5', '$$5', '5 000'])
      expect(validateBudgetForm({ ...base, cost })).toEqual({ ok: false, errors: { cost: BUDGET_FORM_MESSAGES.cost } });
    expect(validateBudgetForm({ ...base, calls: '1.000' })).toEqual({ ok: false, errors: { calls: BUDGET_FORM_MESSAGES.calls } });
    expect(validateBudgetForm({ ...base, cost: '$ 12,345,678.9' })).toMatchObject({ ok: true, budget: { maxListCostUsd: 12_345_678.9 } });
  });

  it('should refuse negative, fractional calls and non-numbers', () => {
    expect(validateBudgetForm({ ...base, cost: '-5' })).toEqual({ ok: false, errors: { cost: BUDGET_FORM_MESSAGES.cost } });
    expect(validateBudgetForm({ ...base, cost: '1e3' })).toEqual({ ok: false, errors: { cost: BUDGET_FORM_MESSAGES.cost } });
    expect(validateBudgetForm({ ...base, calls: '2.5' })).toEqual({ ok: false, errors: { calls: BUDGET_FORM_MESSAGES.calls } });
  });

  it('should round-trip a budget through the form', () => {
    const budget = { app: 'memoir', per: 'app' as const, window: '30d' as const, maxCalls: 10, maxListCostUsd: 2.5 };
    expect(validateBudgetForm(budgetFormOf(budget, []))).toEqual({ ok: true, budget });
  });

  it('should preselect the only app for a new budget', () => {
    expect(budgetFormOf(undefined, ['memoir']).app).toBe('memoir');
    expect(budgetFormOf(undefined, ['memoir', 'novel-forge']).app).toBe('');
  });
});

describe('budget changes', () => {
  const malformed = { app: 'x' };
  const raw = [{ per: 'app', app: 'novel-forge', window: '1h', maxListCostUsd: 50 }, malformed];
  const budget = { app: 'memoir', per: 'subject' as const, window: '1d' as const, maxCalls: 5 };

  it('should add, edit and remove by position, keeping other entries untouched', () => {
    expect(withBudgetChange(raw, { kind: 'add', budget })).toEqual([...raw, budget]);
    expect(withBudgetChange(raw, { kind: 'edit', index: 0, budget })[1]).toBe(malformed);
    expect(withBudgetChange(raw, { kind: 'remove', index: 0 })).toEqual([malformed]);
    expect(withBudgetChange(raw, { kind: 'remove', index: 5 })).toEqual(raw);
  });

  it('should see an edit that rewrites the same values as no change', () => {
    const same = { app: 'novel-forge', per: 'app' as const, window: '1h' as const, maxListCostUsd: 50 };
    expect(sameBudgets(raw, withBudgetChange(raw, { kind: 'edit', index: 0, budget: same }))).toBe(true);
  });

  it('should read a catalog without budgets as an empty list', () => {
    expect(budgetsOf({})).toEqual([]);
  });

  it('should find another budget sharing the counter, ignoring the one being edited', () => {
    const budgets = [entry(0), entry(1, { per: 'subject' })];
    expect(sharesCounter(budgets, { app: 'novel-forge', per: 'app', window: '1h' })).toBe(true);
    expect(sharesCounter(budgets, { app: 'novel-forge', per: 'app', window: '1h' }, 0)).toBe(false);
  });

  it('should offer the apps that have features, plus the edited budget’s own', () => {
    expect(budgetApps([{ app: 'novel-forge' }, { app: 'memoir' }, { app: 'novel-forge' }], 'pulse')).toEqual(['memoir', 'novel-forge', 'pulse']);
  });

  it('should plan a publish on the basis the edit opened on', () => {
    const basis = budgetBasisOf(4, { tasks: {}, budgets: raw });
    const plan = planBudgetPublish(basis, { kind: 'edit', index: 0, budget: { ...budget, app: 'novel-forge' } });
    expect(plan?.expectedVersion).toBe(4);
    expect(plan?.budgets[1]).toBe(malformed);
    expect(plan?.changes.length).toBeGreaterThan(0);
    expect(planBudgetPublish(basis, { kind: 'edit', index: 0, budget: { app: 'novel-forge', per: 'app', window: '1h', maxListCostUsd: 50 } })).toBeNull();
  });

  it('should default the note to the change and keep it within the server’s limit', () => {
    const change = { sentence: 'Budget for Memoir — added' } as CatalogChange;
    expect(budgetNote([change], '  ')).toBe('Budget for Memoir — added');
    expect(budgetNote([change], 'Raise for launch')).toBe('Raise for launch');
    expect(budgetNote([], '')).toBeUndefined();
    expect(budgetNote([], 'x'.repeat(600))).toHaveLength(NOTE_MAX_LENGTH);
  });
});
