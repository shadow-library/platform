import { type FormEvent, type ReactElement, useEffect, useRef, useState } from 'react';
import { Button, Card, DatePicker, FormField, Input, Select } from '@shadow-library/ui';

import {
  CURRENCIES,
  type CurrencyCode,
  type FinanceSettings,
  notifyOutcome,
  parseAmountToMinor,
  SUBSCRIPTION_CATEGORIES,
  SUBSCRIPTION_CATEGORY_OPTIONS,
  type SubscriptionCategoryId,
  type SubscriptionDraft,
  type SubscriptionFrequency,
  useFinanceCommand,
} from '@/lib/data';

import styles from './finance.module.css';

export interface SubscriptionEntryPanelProps {
  today: string;
  settings: FinanceSettings;
  onClose: () => void;
}

interface FormDraft {
  name: string;
  amountText: string;
  currency: CurrencyCode;
  frequency: SubscriptionFrequency;
  nextDueDate: string;
  categoryId: SubscriptionCategoryId;
}

const FREQUENCY_OPTIONS: { value: SubscriptionFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

function scrollAreaHeight(element: HTMLElement): number {
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.scrollHeight > ancestor.clientHeight && /auto|scroll/.test(getComputedStyle(ancestor).overflowY)) return ancestor.clientHeight;
  }
  return window.innerHeight;
}

/** `nearest` leaves a panel taller than its clear area wherever it lands, which can hide its heading and focused field under the chrome. */
function revealBlock(panel: HTMLElement): ScrollLogicalPosition {
  const { scrollMarginTop, scrollMarginBottom } = getComputedStyle(panel);
  const needed = panel.getBoundingClientRect().height + (parseFloat(scrollMarginTop) || 0) + (parseFloat(scrollMarginBottom) || 0);
  return needed > scrollAreaHeight(panel) ? 'start' : 'nearest';
}

function initialDraft(today: string, homeCurrency: CurrencyCode): FormDraft {
  return { name: '', amountText: '', currency: homeCurrency, frequency: 'monthly', nextDueDate: today, categoryId: 'tools' };
}

export function SubscriptionEntryPanel({ today, settings, onClose }: SubscriptionEntryPanelProps): ReactElement {
  const command = useFinanceCommand();
  const [draft, setDraft] = useState<FormDraft>(() => initialDraft(today, settings.homeCurrency));
  const [confirming, setConfirming] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollIntoView({ block: revealBlock(panelRef.current) });
    nameRef.current?.focus({ preventScroll: true });
  }, []);

  const patch = (values: Partial<FormDraft>): void => setDraft(current => ({ ...current, ...values }));
  const amountMinor = parseAmountToMinor(draft.amountText, draft.currency);
  const amountInvalid = draft.amountText.length > 0 && amountMinor === null;
  const name = draft.name.trim();
  const nameInvalid = draft.name.length > 0 && name.length === 0;
  const saveBlocked = amountMinor === null || name.length === 0;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (submitting.current || saveBlocked) return;
    submitting.current = true;
    setConfirming(true);
    try {
      const subscriptionDraft: SubscriptionDraft = {
        name,
        amountText: draft.amountText,
        currency: draft.currency,
        frequency: draft.frequency,
        nextDueDate: draft.nextDueDate,
        categoryId: draft.categoryId,
        reminderEnabled: true,
        reminderLead: '1-day',
      };
      const outcome = await command.run({ type: 'subscription.create', draft: subscriptionDraft });
      const local = outcome.status === 'applied' || outcome.status === 'queued-offline' ? outcome.local : null;
      notifyOutcome(outcome, { success: local?.message ?? '', action: 'add', subject: name });
      if (local) onClose();
    } finally {
      submitting.current = false;
      setConfirming(false);
    }
  };

  return (
    <Card ref={panelRef} padding="lg" className={styles.entryPanel} aria-labelledby="subscription-entry-title">
      <Card.Body>
        <form onSubmit={event => void submit(event)}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle} id="subscription-entry-title">
              Add subscription
            </h2>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>

          <div className={styles.formGrid}>
            <FormField label="Name" required error={nameInvalid ? 'Enter a name' : undefined}>
              <Input ref={nameRef} size="md" autoComplete="off" value={draft.name} onValueChange={value => patch({ name: value })} invalid={nameInvalid} />
            </FormField>

            <FormField label="Amount" required error={amountInvalid ? 'Enter an amount, for example 9.99' : undefined}>
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

            <FormField label="Currency">
              <Select size="md" value={draft.currency} onValueChange={value => patch({ currency: value as CurrencyCode })} aria-label="Currency">
                {settings.currencies.map(code => (
                  <Select.Item key={code} value={code}>
                    {code} {CURRENCIES[code].symbol}
                  </Select.Item>
                ))}
              </Select>
            </FormField>

            <FormField label="Frequency">
              <Select size="md" value={draft.frequency} onValueChange={value => patch({ frequency: value as SubscriptionFrequency })} aria-label="Frequency">
                {FREQUENCY_OPTIONS.map(option => (
                  <Select.Item key={option.value} value={option.value}>
                    {option.label}
                  </Select.Item>
                ))}
              </Select>
            </FormField>

            <FormField label="Next due date">
              <DatePicker
                aria-label="Next due date"
                value={draft.nextDueDate}
                min={today}
                weekStartsOn={settings.weekStartsOn}
                clearable={false}
                onValueChange={value => patch({ nextDueDate: value ?? draft.nextDueDate })}
              />
            </FormField>

            <FormField label="Category">
              <Select size="md" value={draft.categoryId} onValueChange={value => patch({ categoryId: value as SubscriptionCategoryId })} aria-label="Category">
                {SUBSCRIPTION_CATEGORY_OPTIONS.map(id => (
                  <Select.Item key={id} value={id}>
                    {SUBSCRIPTION_CATEGORIES[id].name}
                  </Select.Item>
                ))}
              </Select>
            </FormField>
          </div>

          <div className={styles.formActions}>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={confirming || command.isPending} disabled={saveBlocked}>
              Save subscription
            </Button>
          </div>
        </form>
      </Card.Body>
    </Card>
  );
}
