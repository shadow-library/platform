/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { csrfHeaders, memoirDb } from '../../lib';
import { expectApplied, submitCommandWithHeaders, withAccountLockHeld } from './concurrency-helpers';
import { expect, test } from './fixtures';
import { getAccount, pullFullDelta, submitCommand, todayLocal } from './helpers';

/**
 * Defining types
 */

interface ExpenseAuditRow {
  id: string;
  expenseId: string;
  action: string;
  changes: { field: string; from: string | null; to: string | null }[];
}

interface ExpenseCategoryRow {
  id: string;
  key: string;
  label: string;
  builtin: boolean;
  active: boolean;
  archivedAt: string | null;
}

interface ExpenseRow {
  id: string;
  amountMinor: string;
  amountText: string;
  currency: string;
  fxRate: string | null;
  homeAmountMinor: string | null;
  merchant: string | null;
}

interface SubscriptionRow {
  id: string;
  nextDueDate: string;
  lastConfirmedDate: string | null;
}

/**
 * Declaring the constants
 *
 * Finance (ARCHITECTURE §14): the expense audit trail, the lazy 9-category seed and its archive toggle, FX
 * capture-at-entry, and subscription cycle confirmation. The "idempotent under a race" claims prove genuine
 * concurrent overlap via `concurrency-helpers.ts`'s `withAccountLockHeld`, not by hoping `Promise.all` races in time.
 */

const BUILTIN_CATEGORY_KEYS = ['food', 'groceries', 'transport', 'bills', 'health', 'shopping', 'home', 'subs', 'uncat'].sort();

function auditRowsFor(delta: Awaited<ReturnType<typeof pullFullDelta>>, expenseId: string): ExpenseAuditRow[] {
  return (delta.domains['expense_audits'] as unknown as ExpenseAuditRow[]).filter(row => row.expenseId === expenseId);
}

function expenseRow(delta: Awaited<ReturnType<typeof pullFullDelta>>, expenseId: string): ExpenseRow | undefined {
  return (delta.domains['expenses'] as unknown as ExpenseRow[]).find(row => row.id === expenseId);
}

function categoryRow(delta: Awaited<ReturnType<typeof pullFullDelta>>, key: string): ExpenseCategoryRow | undefined {
  return (delta.domains['expense_categories'] as unknown as ExpenseCategoryRow[]).find(row => row.key === key);
}

function subscriptionRowOf(delta: Awaited<ReturnType<typeof pullFullDelta>>, subscriptionId: string): SubscriptionRow | undefined {
  return (delta.domains['subscriptions'] as unknown as SubscriptionRow[]).find(row => row.id === subscriptionId);
}

/** `fx_rates` carries no `account_id` — it's a shared, date-scoped cache across every lane on this cluster, so a randomized far-past date keeps a seeded row from colliding with anyone else's real traffic. */
function randomPastDate(): string {
  const start = Date.UTC(2015, 0, 1);
  const end = Date.UTC(2023, 11, 31);
  return new Date(start + Math.floor(Math.random() * (end - start))).toISOString().slice(0, 10);
}

test.describe('memoir finance', () => {
  test('should write one audit row per expense mutation, skip no-op writes, never duplicate on replay, and start fresh history on id reuse', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'fin-audit', onboard: true });
    const today = todayLocal();
    const expenseId = randomUUID();
    const createCommandId = randomUUID();

    const created = await submitCommand(
      persona.ctx,
      'expense.create',
      { id: expenseId, currency: 'USD', occurredOn: today, categoryId: 'uncat', amountText: '5.00', amountMinor: 500, note: 'first note' },
      { commandId: createCommandId },
    );
    expectApplied(created);

    let delta = await pullFullDelta(persona.ctx);
    let rows = auditRowsFor(delta, expenseId);
    expect(rows.map(row => row.action)).toEqual(['created']);
    const createdAuditId = rows[0]!.id;

    const updated = await submitCommand(persona.ctx, 'expense.update', { id: expenseId, categoryId: 'uncat', note: 'second note' });
    expectApplied(updated);
    delta = await pullFullDelta(persona.ctx);
    rows = auditRowsFor(delta, expenseId);
    expect(rows.map(row => row.action)).toEqual(['created', 'updated']);
    const updatedRow = rows.find(row => row.action === 'updated')!;
    expect(updatedRow.changes, 'an unchanged categoryId included in the payload must not appear in the diff').toEqual([{ field: 'note', from: 'first note', to: 'second note' }]);
    const updatedAuditId = updatedRow.id;

    const noOp = await submitCommand(persona.ctx, 'expense.update', { id: expenseId, note: 'second note' });
    expectApplied(noOp);
    delta = await pullFullDelta(persona.ctx);
    expect(auditRowsFor(delta, expenseId), 'a no-op update writes no audit row').toHaveLength(2);

    const replayed = await submitCommand(persona.ctx, 'expense.create', {}, { commandId: createCommandId });
    expect(replayed.replayed, JSON.stringify(replayed)).toBe(true);
    delta = await pullFullDelta(persona.ctx);
    expect(auditRowsFor(delta, expenseId), 'replaying the create command must not touch audit history').toHaveLength(2);

    const preDeleteDelta = await pullFullDelta(persona.ctx);
    expect(JSON.stringify(preDeleteDelta), 'positive control: the pre-delete delta really does carry the free text').toContain('second note');

    const deleted = await submitCommand(persona.ctx, 'expense.delete', { id: expenseId });
    expectApplied(deleted);
    delta = await pullFullDelta(persona.ctx);
    rows = auditRowsFor(delta, expenseId);
    expect(
      rows.map(row => row.action),
      'delete removes the prior live rows and leaves only its own',
    ).toEqual(['deleted']);

    const tombstonedAuditRows = delta.tombstones.filter(tombstone => tombstone.domain === 'expense_audits');
    expect(
      tombstonedAuditRows.map(tombstone => tombstone.recordId),
      'the created/updated rows delete removed must be the ones tombstoned',
    ).toEqual(expect.arrayContaining([createdAuditId, updatedAuditId]));
    for (const tombstone of tombstonedAuditRows) expect(Object.keys(tombstone).sort()).toEqual(['domain', 'recordId', 'syncSeq']);
    expect(JSON.stringify(delta), "deleted rows' free text must not leak into the delta at all").not.toContain('first note');
    expect(JSON.stringify(delta)).not.toContain('second note');

    const recreated = await submitCommand(persona.ctx, 'expense.create', {
      id: expenseId,
      currency: 'USD',
      occurredOn: today,
      categoryId: 'uncat',
      amountText: '9.00',
      amountMinor: 900,
    });
    expectApplied(recreated);
    delta = await pullFullDelta(persona.ctx);
    expect(auditRowsFor(delta, expenseId), 'recreating under the same id starts a fresh history').toEqual([expect.objectContaining({ action: 'created' })]);
  });

  test("should never leak one account's expense audits into another account's delta pull", async ({ memoir }) => {
    const owner = await memoir.persona({ label: 'fin-isolation-owner', onboard: true });
    const stranger = await memoir.persona({ label: 'fin-isolation-stranger', onboard: true });

    const expense = await submitCommand(owner.ctx, 'expense.create', {
      id: randomUUID(),
      currency: 'USD',
      occurredOn: todayLocal(),
      categoryId: 'uncat',
      amountText: '3.00',
      amountMinor: 300,
      merchant: 'Owner Only',
    });
    expectApplied(expense);

    const strangerDelta = await pullFullDelta(stranger.ctx);
    expect(strangerDelta.domains['expense_audits'] ?? []).toEqual([]);
    expect(strangerDelta.domains['expenses'] ?? []).toEqual([]);

    const ownerDelta = await pullFullDelta(owner.ctx);
    expect((ownerDelta.domains['expense_audits'] ?? []).length).toBeGreaterThan(0);
  });

  test('should lazily seed exactly 9 built-in categories idempotently under contention, and toggle archival correctly', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'fin-categories', onboard: true });
    await pullFullDelta(persona.ctx);
    const account = await getAccount(persona.ctx);

    const preCategories = await memoirDb()<{ n: number }[]>`SELECT count(*)::int AS n FROM expense_categories WHERE account_id = ${account.id}::bigint`;
    expect(preCategories[0]?.n, 'the race needs an account finance has never touched').toBe(0);

    const headers = await csrfHeaders(persona.ctx);
    const [first, second] = await withAccountLockHeld(account.id, 2, () =>
      Promise.all([
        submitCommandWithHeaders(persona.ctx, headers, 'expense.create', {
          id: randomUUID(),
          currency: 'USD',
          occurredOn: todayLocal(),
          categoryId: 'uncat',
          amountText: '1.00',
          amountMinor: 100,
        }),
        submitCommandWithHeaders(persona.ctx, headers, 'expense.create', {
          id: randomUUID(),
          currency: 'USD',
          occurredOn: todayLocal(),
          categoryId: 'uncat',
          amountText: '2.00',
          amountMinor: 200,
        }),
      ]),
    );
    expectApplied(first);
    expectApplied(second);

    let delta = await pullFullDelta(persona.ctx);
    const categories = delta.domains['expense_categories'] as unknown as ExpenseCategoryRow[];
    expect(categories.map(category => category.key).sort()).toEqual(BUILTIN_CATEGORY_KEYS);
    expect(categories.every(category => category.builtin)).toBe(true);

    const archived = await submitCommand(persona.ctx, 'category.setArchived', { categoryId: 'food', archived: true });
    expectApplied(archived);
    expect(archived.result['archivedAt']).not.toBeNull();

    delta = await pullFullDelta(persona.ctx);
    let foodRow = categoryRow(delta, 'food');
    expect(foodRow?.active).toBe(false);
    expect(foodRow?.archivedAt).toBe(archived.result['archivedAt']);

    const archivedAgain = await submitCommand(persona.ctx, 'category.setArchived', { categoryId: 'food', archived: true });
    expectApplied(archivedAgain);
    expect(archivedAgain.result['archivedAt'], 'archiving an already-archived category is a no-op, not a re-stamp').toBe(archived.result['archivedAt']);

    const unarchived = await submitCommand(persona.ctx, 'category.setArchived', { categoryId: 'food', archived: false });
    expectApplied(unarchived);
    expect(unarchived.result['archivedAt']).toBeNull();

    delta = await pullFullDelta(persona.ctx);
    foodRow = categoryRow(delta, 'food');
    expect(foodRow?.active).toBe(true);
    expect(foodRow?.archivedAt).toBeNull();

    const unarchivedAgain = await submitCommand(persona.ctx, 'category.setArchived', { categoryId: 'food', archived: false });
    expectApplied(unarchivedAgain);
    expect(unarchivedAgain.result['archivedAt'], 'unarchiving an already-active category is also a no-op').toBeNull();

    const protectedBuiltin = await submitCommand(persona.ctx, 'category.setArchived', { categoryId: 'uncat', archived: true });
    expect(protectedBuiltin.status).toBe('failed');
    expect(protectedBuiltin.error?.code).toBe('FIN_007');

    delta = await pullFullDelta(persona.ctx);
    const uncatRow = categoryRow(delta, 'uncat');
    expect(uncatRow?.active, 'the refused archive must not have touched the protected builtin').toBe(true);
    expect(uncatRow?.archivedAt).toBeNull();

    const unowned = await submitCommand(persona.ctx, 'category.setArchived', { categoryId: 'does-not-exist', archived: true });
    expect(unowned.status).toBe('failed');
    expect(unowned.error?.code).toBe('FIN_005');

    const legitClose = await submitCommand(persona.ctx, 'category.setArchived', { categoryId: 'groceries', archived: true });
    expectApplied(legitClose);
    expect(legitClose.result['archivedAt'], 'the refusal group ends on a legitimate call that still works').not.toBeNull();
  });

  test('should trigger lazy category seeding from category.setArchived itself, not only from an expense command', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'fin-categories-first', onboard: true });
    const outcome = await submitCommand(persona.ctx, 'category.setArchived', { categoryId: 'shopping', archived: true });
    expectApplied(outcome);

    const delta = await pullFullDelta(persona.ctx);
    const categories = delta.domains['expense_categories'] as unknown as ExpenseCategoryRow[];
    expect(categories.map(category => category.key).sort()).toEqual(BUILTIN_CATEGORY_KEYS);
  });

  test('should round-trip amountMinor/amountText losslessly, leave fxRate null with no cached rate, and lock a resolved rate against everything but an amount edit', async ({
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'fin-fx', onboard: true });
    const eurDate = randomPastDate();
    const gbpDate = randomPastDate();

    const existingEur = await memoirDb()<{ n: number }[]>`SELECT count(*)::int AS n FROM fx_rates WHERE date = ${eurDate} AND base = 'EUR' AND quote = 'USD'`;
    expect(existingEur[0]?.n, `fx_rates already has a EUR/USD row for ${eurDate} — an astronomically unlucky random collision`).toBe(0);
    await memoirDb()`INSERT INTO fx_rates (date, base, quote, rate) VALUES (${eurDate}, 'EUR', 'USD', '1.10000000')`;

    try {
      const roundTripId = randomUUID();
      const roundTrip = await submitCommand(persona.ctx, 'expense.create', {
        id: roundTripId,
        currency: 'USD',
        occurredOn: todayLocal(),
        categoryId: 'uncat',
        amountText: '1234567.89',
        amountMinor: 123456789,
      });
      expectApplied(roundTrip);
      let delta = await pullFullDelta(persona.ctx);
      let row = expenseRow(delta, roundTripId);
      expect(row?.amountMinor).toBe('123456789');
      expect(row?.amountText).toBe('1234567.89');

      const noCachedGbp = await memoirDb()<{ n: number }[]>`SELECT count(*)::int AS n FROM fx_rates WHERE date = ${gbpDate} AND base = 'GBP' AND quote = 'USD'`;
      expect(noCachedGbp[0]?.n, `precondition: no GBP/USD fx_rates row for ${gbpDate}`).toBe(0);

      const noRateId = randomUUID();
      const noRate = await submitCommand(persona.ctx, 'expense.create', {
        id: noRateId,
        currency: 'GBP',
        occurredOn: gbpDate,
        categoryId: 'uncat',
        amountText: '10.00',
        amountMinor: 1000,
      });
      expectApplied(noRate);
      delta = await pullFullDelta(persona.ctx);
      row = expenseRow(delta, noRateId);
      expect(row?.fxRate, 'no cached fx_rates row for this pair/date must not fail the write').toBeNull();
      expect(row?.homeAmountMinor).toBeNull();

      const lockedId = randomUUID();
      const lockedCreate = await submitCommand(persona.ctx, 'expense.create', {
        id: lockedId,
        currency: 'EUR',
        occurredOn: eurDate,
        categoryId: 'uncat',
        amountText: '10.00',
        amountMinor: 1000,
        merchant: 'Original',
      });
      expectApplied(lockedCreate);
      delta = await pullFullDelta(persona.ctx);
      row = expenseRow(delta, lockedId);
      expect(row?.fxRate).toBe('1.10000000');
      expect(row?.homeAmountMinor).toBe('1100');

      const noteEdit = await submitCommand(persona.ctx, 'expense.update', { id: lockedId, note: 'edited note' });
      expectApplied(noteEdit);
      delta = await pullFullDelta(persona.ctx);
      row = expenseRow(delta, lockedId);
      expect(row?.fxRate, 'a note edit must never touch the locked rate').toBe('1.10000000');
      expect(row?.homeAmountMinor).toBe('1100');

      const categoryEdit = await submitCommand(persona.ctx, 'expense.update', { id: lockedId, categoryId: 'groceries' });
      expectApplied(categoryEdit);
      delta = await pullFullDelta(persona.ctx);
      row = expenseRow(delta, lockedId);
      expect(row?.fxRate, 'a categoryId edit must never touch the locked rate either').toBe('1.10000000');
      expect(row?.homeAmountMinor).toBe('1100');

      const amountEdit = await submitCommand(persona.ctx, 'expense.update', { id: lockedId, amountMinor: 2000 });
      expectApplied(amountEdit);
      delta = await pullFullDelta(persona.ctx);
      row = expenseRow(delta, lockedId);
      expect(row?.fxRate, 'an amount edit recomputes under the already-locked rate, never re-fetching it').toBe('1.10000000');
      expect(row?.homeAmountMinor).toBe('2200');

      const currencyChange = await submitCommand(persona.ctx, 'expense.update', { id: lockedId, currency: 'GBP' });
      expect(currencyChange.status).toBe('failed');
      expect(currencyChange.error?.code).toBe('FIN_006');

      delta = await pullFullDelta(persona.ctx);
      row = expenseRow(delta, lockedId);
      expect(row?.currency, 'the refused currency change must not have touched the row').toBe('EUR');
      expect(row?.fxRate).toBe('1.10000000');

      const legitAfterRefusal = await submitCommand(persona.ctx, 'expense.update', { id: lockedId, currency: 'eur', note: 'legit update after FIN_006' });
      expectApplied(legitAfterRefusal);
      delta = await pullFullDelta(persona.ctx);
      row = expenseRow(delta, lockedId);
      expect(row?.currency, 'a same-currency (case-insensitive) update is accepted, not a real currency change').toBe('EUR');
    } finally {
      await memoirDb()`DELETE FROM fx_rates WHERE date = ${eurDate} AND base = 'EUR' AND quote = 'USD'`;
    }
  });

  test('should confirm a subscription cycle idempotently, clamp a billingDay:31 month-end advance without it sticking, and keep occurredOn edits out of cycle identity', async ({
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'fin-subscription', onboard: true });
    await pullFullDelta(persona.ctx);
    const before = await getAccount(persona.ctx);

    const subscription = await submitCommand(persona.ctx, 'subscription.create', {
      name: 'Month-end plan',
      amountMinor: 999,
      amountText: '9.99',
      currency: 'USD',
      frequency: 'monthly',
      billingDay: 31,
      nextDueDate: '2026-01-31',
      categoryId: 'uncat',
    });
    expectApplied(subscription);
    const subscriptionId = String(subscription.result['id']);

    const firstConfirm = await submitCommand(persona.ctx, 'subscription.confirmCycle', { id: subscriptionId, billingDate: '2026-01-31' });
    expectApplied(firstConfirm);
    const expenseId = String(firstConfirm.result['expenseId']);
    expect(firstConfirm.result['coinsGranted']).toBe(1);

    let delta = await pullFullDelta(persona.ctx);
    expect(subscriptionRowOf(delta, subscriptionId)?.nextDueDate, 'billingDay 31 clamps into a 28-day February rather than overflowing').toBe('2026-02-28');

    const editOccurredOn = await submitCommand(persona.ctx, 'expense.update', { id: expenseId, occurredOn: '2026-01-15' });
    expectApplied(editOccurredOn);

    const secondConfirm = await submitCommand(persona.ctx, 'subscription.confirmCycle', { id: subscriptionId, billingDate: '2026-01-31' });
    expectApplied(secondConfirm);
    expect(secondConfirm.result['expenseId'], 'the same cycle resolves to the same expense regardless of its edited occurredOn').toBe(expenseId);

    delta = await pullFullDelta(persona.ctx);
    expect(subscriptionRowOf(delta, subscriptionId)?.nextDueDate, 'a duplicate confirm of an already-confirmed cycle must not advance the due date again').toBe('2026-02-28');

    const afterDuplicate = await getAccount(persona.ctx);
    expect(afterDuplicate.coins, 'confirming the same cycle twice must grant exactly one coin').toBe(before.coins + 1);
    // The occurredOn edit is one legitimate 'updated' row; the duplicate confirm must not add another.
    expect(auditRowsFor(delta, expenseId).map(row => row.action)).toEqual(['created', 'updated']);

    const thirdConfirm = await submitCommand(persona.ctx, 'subscription.confirmCycle', { id: subscriptionId, billingDate: '2026-02-28' });
    expectApplied(thirdConfirm);
    const secondExpenseId = String(thirdConfirm.result['expenseId']);
    expect(secondExpenseId, 'the next cycle is a genuinely different expense').not.toBe(expenseId);
    expect(thirdConfirm.result['coinsGranted']).toBe(1);

    delta = await pullFullDelta(persona.ctx);
    expect(subscriptionRowOf(delta, subscriptionId)?.nextDueDate, "the billingDay 31 clamp doesn't stick — rebased on March it runs the full 31 days").toBe('2026-03-31');

    const afterSecondCycle = await getAccount(persona.ctx);
    expect(afterSecondCycle.coins, 'a genuinely new cycle grants its own coin').toBe(before.coins + 2);
  });

  test('should converge two genuinely concurrent confirmCycle calls for one cycle on exactly one expense and one reward', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'fin-subscription-race', onboard: true });
    await pullFullDelta(persona.ctx);
    const account = await getAccount(persona.ctx);

    const subscription = await submitCommand(persona.ctx, 'subscription.create', {
      name: 'Race plan',
      amountMinor: 500,
      amountText: '5.00',
      currency: 'USD',
      frequency: 'monthly',
      billingDay: 10,
      nextDueDate: todayLocal(),
      categoryId: 'uncat',
    });
    expectApplied(subscription);
    const subscriptionId = String(subscription.result['id']);
    const billingDate = todayLocal();
    const before = await getAccount(persona.ctx);

    const headers = await csrfHeaders(persona.ctx);
    const [first, second] = await withAccountLockHeld(account.id, 2, () =>
      Promise.all([
        submitCommandWithHeaders(persona.ctx, headers, 'subscription.confirmCycle', { id: subscriptionId, billingDate }),
        submitCommandWithHeaders(persona.ctx, headers, 'subscription.confirmCycle', { id: subscriptionId, billingDate }),
      ]),
    );
    expectApplied(first);
    expectApplied(second);
    const expenseId = String(first.result['expenseId']);
    expect(second.result['expenseId'], 'both concurrent confirms must resolve to the same cycle expense').toBe(expenseId);

    const after = await getAccount(persona.ctx);
    expect(after.coins, 'a genuine race on one cycle must still grant exactly one coin').toBe(before.coins + 1);

    const delta = await pullFullDelta(persona.ctx);
    expect(auditRowsFor(delta, expenseId).map(row => row.action)).toEqual(['created']);
  });
});
