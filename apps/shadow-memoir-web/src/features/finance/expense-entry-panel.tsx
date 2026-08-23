import { type FormEvent, type ReactElement, useState } from 'react';
import { Badge, Button, Card, DatePicker, FileUpload, FormField, Input, Select, toast } from '@shadow-library/ui';

import { EntryCapNote } from '@/components/EntryCapNote';
import {
  BUILT_IN_CATEGORIES,
  CURRENCIES,
  type CurrencyCode,
  type EntryCapAdvisory,
  type ExpenseCategoryId,
  type ExpenseDetail,
  type ExpenseDraft,
  formatMinor,
  HOME_CURRENCY,
  parseAmountToMinor,
  SUPPORTED_CURRENCIES,
  useFinanceCommand,
} from '@/lib/data';

import styles from './finance.module.css';

export interface ExpenseEntryPanelProps {
  today: string;
  existing?: ExpenseDetail;
  onClose: () => void;
}

function initialDraft(today: string, existing?: ExpenseDetail): ExpenseDraft {
  return {
    amountText: existing?.amountText ?? '',
    currency: existing?.currency ?? HOME_CURRENCY,
    categoryId: existing?.categoryId ?? 'uncat',
    occurredOnDate: existing?.occurredOnDate ?? today,
    merchant: existing?.merchant ?? '',
    note: existing?.note ?? '',
  };
}

/**
 * The amount is read into minor units before anything else happens, and the conversion preview is the rate
 * that will be frozen onto the entry — the owner sees the number that gets stored, not one recomputed later.
 */
export function ExpenseEntryPanel({ today, existing, onClose }: ExpenseEntryPanelProps): ReactElement {
  const [draft, setDraft] = useState<ExpenseDraft>(() => initialDraft(today, existing));
  const [advisory, setAdvisory] = useState<EntryCapAdvisory | null>(null);
  const command = useFinanceCommand();

  const amountMinor = parseAmountToMinor(draft.amountText, draft.currency);
  const amountInvalid = draft.amountText.length > 0 && amountMinor === null;
  const foreign = draft.currency !== HOME_CURRENCY;

  const patch = (values: Partial<ExpenseDraft>): void => setDraft(current => ({ ...current, ...values }));

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (amountMinor === null) return;

    const payload = existing ? ({ type: 'expense.update', id: existing.id, draft } as const) : ({ type: 'expense.create', draft } as const);
    command.mutate(payload, {
      onSuccess: result => {
        setAdvisory(result.advisory ?? null);
        toast.success(result.message);
        if (!result.advisory?.message) onClose();
      },
    });
  };

  return (
    <Card padding="lg" aria-labelledby="expense-entry-title">
      <form className={styles.padLg} onSubmit={submit}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle} id="expense-entry-title">
            {existing ? 'Edit expense' : 'Add expense'}
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className={styles.formGrid}>
          <FormField label="Amount" required error={amountInvalid ? 'Enter an amount, for example 18.40' : undefined}>
            <Input
              size="md"
              inputMode="decimal"
              autoComplete="off"
              prefix={CURRENCIES[draft.currency].symbol}
              value={draft.amountText}
              onValueChange={amountText => patch({ amountText })}
              invalid={amountInvalid}
            />
          </FormField>

          <FormField label="Currency" helper={foreign ? `Converted to ${HOME_CURRENCY} at today's rate, then locked.` : undefined}>
            <Select size="md" value={draft.currency} onValueChange={value => patch({ currency: value as CurrencyCode })} aria-label="Currency">
              {SUPPORTED_CURRENCIES.map(code => (
                <Select.Item key={code} value={code}>
                  {code} {CURRENCIES[code].symbol}
                </Select.Item>
              ))}
            </Select>
          </FormField>

          <FormField label="Category">
            <Select size="md" value={draft.categoryId} onValueChange={value => patch({ categoryId: value as ExpenseCategoryId })} aria-label="Category">
              {BUILT_IN_CATEGORIES.map(category => (
                <Select.Item key={category.id} value={category.id} description={category.hint}>
                  {category.name}
                </Select.Item>
              ))}
            </Select>
          </FormField>

          <FormField label="Date">
            <DatePicker value={draft.occurredOnDate} onValueChange={value => patch({ occurredOnDate: value ?? today })} />
          </FormField>
        </div>

        <div className={styles.formWide}>
          <FormField label="Note" helper="Used to guess the category next time.">
            <Input size="md" value={draft.note} onValueChange={note => patch({ note })} />
          </FormField>
        </div>

        <div className={styles.formWide}>
          <FormField label="Merchant" optional>
            <Input size="md" value={draft.merchant} onValueChange={merchant => patch({ merchant })} />
          </FormField>
        </div>

        {amountMinor !== null && (
          <p className={styles.railProse} data-testid="expense-entry-preview">
            {foreign
              ? `${formatMinor(amountMinor, draft.currency)} saved as entered. It appears in reports as its ${HOME_CURRENCY} value at the rate on ${draft.occurredOnDate}.`
              : `${formatMinor(amountMinor, draft.currency)} will be saved.`}
          </p>
        )}

        <div className={styles.receiptGrid}>
          <FileUpload accept={['image/*']} maxFiles={1} maxSize={8 * 1024 * 1024} aria-label="Receipt photo" />
          <div className={styles.well}>
            <p className={styles.railTitle}>Receipts are a convenience</p>
            <p className={styles.railProse}>An expense can always be typed. Anything read from a photo is shown for review before it saves — nothing is written on your behalf.</p>
            <Badge variant="outline" size="sm">
              Review before saving
            </Badge>
          </div>
        </div>

        <EntryCapNote advisory={advisory} />

        <div className={styles.formActions}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={command.isPending} disabled={amountMinor === null}>
            {existing ? 'Save changes' : 'Save expense'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
