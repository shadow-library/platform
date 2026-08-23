import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExpenseEntryPanel, SubscriptionsScreen } from '@/features/finance';
import { type ExpenseDetail } from '@/lib/data';

import { renderWithQuery } from './harness';

const TODAY = '2026-08-23';

function foreignExpense(): ExpenseDetail {
  return {
    id: 'exp-1',
    amountMinor: 21400,
    amountText: '214.00',
    currency: 'NOK',
    fxRate: 0.086,
    homeAmountMinor: 1840,
    categoryId: 'groceries',
    occurredOnDate: TODAY,
    loggedAt: `${TODAY}T09:12:00`,
    source: 'ocr',
    syncState: 'synced',
    audit: [],
  };
}

function typeAmount(value: string): void {
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value } });
}

describe('expense entry', () => {
  it('should preview the amount it will store, in the currency it was typed in', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} onClose={() => undefined} />);
    typeAmount('18.40');
    expect(screen.getByTestId('expense-entry-preview').textContent).toContain('€18.40 will be saved.');
  });

  it('should read a comma decimal separator as the same amount', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} onClose={() => undefined} />);
    typeAmount('18,40');
    expect(screen.getByTestId('expense-entry-preview').textContent).toContain('€18.40');
  });

  it('should read a grouped amount without inflating it', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} onClose={() => undefined} />);
    typeAmount('1,284.60');
    expect(screen.getByTestId('expense-entry-preview').textContent).toContain('€1,284.60');
  });

  it('should refuse to save an amount it cannot read, without losing what was typed', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} onClose={() => undefined} />);
    typeAmount('abc');

    const amount = screen.getByLabelText('Amount') as HTMLInputElement;
    expect(amount.value).toBe('abc');
    expect((screen.getByRole('button', { name: 'Save expense' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Enter an amount, for example 18.40')).toBeDefined();
  });

  it('should tell the owner a foreign amount converts at the rate on the day of the expense', () => {
    renderWithQuery(<ExpenseEntryPanel today={TODAY} existing={foreignExpense()} onClose={() => undefined} />);
    expect(screen.getByTestId('expense-entry-preview').textContent).toContain(`rate on ${TODAY}`);
  });
});

describe('subscriptions screen', () => {
  it('should surface a due charge with a confirmation the owner has to press', async () => {
    renderWithQuery(<SubscriptionsScreen />);
    expect(await screen.findByRole('heading', { name: 'Subscriptions' })).toBeDefined();
    expect((await screen.findAllByRole('button', { name: 'Confirm charge' })).length).toBeGreaterThan(0);
  });

  it('should present an unconfirmed past charge as waiting, never as a failure', async () => {
    renderWithQuery(<SubscriptionsScreen />);
    expect(await screen.findByText('Waiting to be confirmed')).toBeDefined();
  });
});
