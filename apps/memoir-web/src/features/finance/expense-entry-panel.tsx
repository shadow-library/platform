import { type FormEvent, type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, DatePicker, type FileItem, FileUpload, FormField, Input, Select, type UploadHandle } from '@shadow-library/ui';

import { EntryCapNote } from '@/components/EntryCapNote';
import { RECEIPT_EXTENSIONS, RECEIPT_FAILURE_COPY, RECEIPT_MAX_BYTES, receiptContentType, ReceiptUploadError, type ReceiptUploadFailure } from '@/lib/apis';
import {
  BUILT_IN_CATEGORIES,
  convertToHomeMinor,
  CURRENCIES,
  type CurrencyCode,
  type EntryCapAdvisory,
  type ExpenseCategory,
  type ExpenseCategoryId,
  type ExpenseDetail,
  type ExpenseDraft,
  expenseTitle,
  type FinanceSettings,
  formatMinor,
  type FxRateSnapshot,
  notifyOutcome,
  parseAmountToMinor,
  useFinanceCommand,
  useMemoirData,
} from '@/lib/data';
import { formatLocalDate } from '@/lib/format';

import styles from './finance.module.css';

export interface ExpenseEntryPanelProps {
  today: string;
  settings: FinanceSettings;
  rates: FxRateSnapshot[];
  categories?: ExpenseCategory[];
  existing?: ExpenseDetail;
  onClose: () => void;
}

interface FormDraft {
  amountText: string;
  currency: CurrencyCode;
  categoryId: ExpenseCategoryId;
  occurredOnDate: string;
  merchant: string;
  note: string;
}

const LOCKED_CURRENCY_HELPER = 'A saved expense keeps its currency. To use another, delete it and add it again.';

type ReceiptState = { kind: 'none' } | { kind: 'uploading' } | { kind: 'ready'; ref: string } | { kind: 'invalid'; message: string };

function initialDraft(today: string, homeCurrency: CurrencyCode, existing?: ExpenseDetail): FormDraft {
  return {
    amountText: existing?.amountText ?? '',
    currency: existing?.currency ?? homeCurrency,
    categoryId: existing?.categoryId ?? 'uncat',
    occurredOnDate: existing?.occurredOnDate ?? today,
    merchant: existing?.merchant ?? '',
    note: existing?.note ?? '',
  };
}

/** An untouched empty field stays absent so an edit never invents an empty note; clearing a filled one sends the "" the server stores as null. */
function editedText(value: string, current: string | undefined): string | undefined {
  if (value) return value;
  return current ? '' : undefined;
}

function toCommandDraft(form: FormDraft, existing: ExpenseDetail | undefined, receiptRef: string | undefined): ExpenseDraft {
  const base = { amountText: form.amountText, categoryId: form.categoryId, occurredOnDate: form.occurredOnDate };
  if (existing) {
    const merchant = editedText(form.merchant, existing.merchant);
    return { ...base, currency: existing.currency, source: existing.source, merchant, note: editedText(form.note, existing.note) };
  }
  return { ...base, currency: form.currency, merchant: form.merchant || undefined, note: form.note || undefined, receiptRef };
}

function failureOf(file: File): ReceiptUploadFailure {
  if (!receiptContentType(file)) return 'unsupported-type';
  return file.size > RECEIPT_MAX_BYTES ? 'too-large' : 'failed';
}

function receiptStateOf(items: FileItem[], refs: ReadonlyMap<File, string>, failures: ReadonlyMap<File, ReceiptUploadFailure>): ReceiptState {
  const [item] = items;
  if (!item) return { kind: 'none' };
  if (item.status === 'error') return { kind: 'invalid', message: RECEIPT_FAILURE_COPY[failures.get(item.file) ?? failureOf(item.file)] };
  const ref = item.status === 'complete' ? refs.get(item.file) : undefined;
  return ref ? { kind: 'ready', ref } : { kind: 'uploading' };
}

function previewText(amountMinor: number, draft: FormDraft, settings: FinanceSettings, rates: FxRateSnapshot[], existing: ExpenseDetail | undefined): string {
  const home = settings.homeCurrency;
  const typed = formatMinor(amountMinor, draft.currency);
  if (draft.currency === home) return `${typed} will be saved.`;

  const estimate = (rate: number): string => formatMinor(convertToHomeMinor(amountMinor, draft.currency, rate, home) ?? 0, home);
  if (existing) {
    return existing.fxRate === null
      ? `${typed} is kept as typed. Its ${home} value follows once the rate is known.`
      : `${typed} ≈ ${estimate(existing.fxRate)} at ${existing.fxRate.toFixed(4)}, the rate this expense is locked to.`;
  }

  const day = formatLocalDate(draft.occurredOnDate, { year: false });
  const known = rates.find(rate => rate.from === draft.currency);
  if (!known) return `${typed} is saved as typed. Its ${home} value uses the rate on ${day}, once it is known.`;
  const converted = `${typed} ≈ ${estimate(known.rate)} at ${known.rate.toFixed(4)}`;
  if (known.date === draft.occurredOnDate) return `${converted}, the rate on ${day}.`;
  return `${converted}, the last rate used (${formatLocalDate(known.date, { year: false })}). The saved value uses the rate on ${day}.`;
}

function availableCategories(categories: ExpenseCategory[], selected: ExpenseCategoryId): ExpenseCategory[] {
  return categories.filter(category => !category.archived || category.id === selected);
}

export function ExpenseEntryPanel({ today, settings, rates, categories = BUILT_IN_CATEGORIES, existing, onClose }: ExpenseEntryPanelProps): ReactElement {
  const { finance } = useMemoirData();
  const command = useFinanceCommand();
  const [draft, setDraft] = useState<FormDraft>(() => initialDraft(today, settings.homeCurrency, existing));
  const [advisory, setAdvisory] = useState<EntryCapAdvisory | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [receiptItems, setReceiptItems] = useState<FileItem[]>([]);
  const [receiptRefs, setReceiptRefs] = useState<ReadonlyMap<File, string>>(new Map());
  const [receiptFailures, setReceiptFailures] = useState<ReadonlyMap<File, ReceiptUploadFailure>>(new Map());
  const [saveFailure, setSaveFailure] = useState<ReceiptUploadFailure | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const amountRef = useRef<HTMLInputElement>(null);
  const uploads = useRef(new Set<AbortController>());
  const submitting = useRef(false);
  const pickedFiles = useRef<File[]>([]);

  useEffect(() => {
    amountRef.current?.focus();
    const active = uploads.current;
    return () => {
      for (const controller of active) controller.abort();
    };
  }, []);

  const amountMinor = parseAmountToMinor(draft.amountText, draft.currency);
  const amountInvalid = draft.amountText.length > 0 && amountMinor === null;
  const receipt = receiptStateOf(receiptItems, receiptRefs, receiptFailures);
  const currencies = existing && !settings.currencies.includes(existing.currency) ? [existing.currency, ...settings.currencies] : settings.currencies;
  const latestDate = existing && existing.occurredOnDate > today ? existing.occurredOnDate : today;

  const patch = (values: Partial<FormDraft>): void => setDraft(current => ({ ...current, ...values }));

  const upload = useCallback(
    async (file: File, handle: UploadHandle): Promise<void> => {
      const controller = new AbortController();
      const abort = (): void => controller.abort();
      handle.signal.addEventListener('abort', abort, { once: true });
      uploads.current.add(controller);
      try {
        const ref = await finance.uploadReceipt(file, { onProgress: handle.onProgress, signal: controller.signal });
        setReceiptRefs(current => new Map(current).set(file, ref));
      } catch (error) {
        const failure = error instanceof ReceiptUploadError ? error.failure : 'failed';
        if (!controller.signal.aborted) setReceiptFailures(current => new Map(current).set(file, failure));
        throw error;
      } finally {
        uploads.current.delete(controller);
        handle.signal.removeEventListener('abort', abort);
      }
    },
    [finance],
  );

  const changeReceipt = useCallback((items: FileItem[]): void => {
    pickedFiles.current = items.map(item => item.file);
    setReceiptItems(items);
    setSaveFailure(null);
  }, []);

  const attachReceipt = async (ref: string): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSaveFailure('offline');
      return false;
    }
    try {
      await finance.confirmReceipt(ref);
      return true;
    } catch (error) {
      setSaveFailure(error instanceof ReceiptUploadError ? error.failure : 'failed');
      return false;
    }
  };

  const reset = (): void => {
    setDraft(initialDraft(today, settings.homeCurrency));
    setReceiptItems([]);
    setUploadKey(key => key + 1);
    amountRef.current?.focus();
  };

  const save = async (): Promise<void> => {
    if (amountMinor === null || receipt.kind === 'uploading' || receipt.kind === 'invalid') return;
    const receiptRef = receipt.kind === 'ready' ? receipt.ref : undefined;
    const receiptFile = receiptItems[0]?.file;
    if (receiptRef && !(await attachReceipt(receiptRef))) return;
    if (receiptFile && !pickedFiles.current.includes(receiptFile)) return;

    const next = toCommandDraft(draft, existing, receiptRef);
    const outcome = await command.run(existing ? { type: 'expense.update', id: existing.id, draft: next } : { type: 'expense.create', draft: next });
    const local = outcome.status === 'applied' || outcome.status === 'queued-offline' ? outcome.local : null;
    notifyOutcome(outcome, { success: local?.message ?? '', action: existing ? 'update' : 'save', subject: expenseTitle(next, categories) });
    if (!local) return;

    const nextAdvisory = local.advisory ?? null;
    if (existing || !nextAdvisory?.message) return onClose();
    setAdvisory(nextAdvisory);
    setSavedNote(`${formatMinor(amountMinor, draft.currency)} saved. The form is clear for the next one.`);
    reset();
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setConfirming(true);
    try {
      await save();
    } finally {
      submitting.current = false;
      setConfirming(false);
    }
  };

  const receiptError = receipt.kind === 'invalid' ? receipt.message : saveFailure ? RECEIPT_FAILURE_COPY[saveFailure] : undefined;
  const saveBlocked = amountMinor === null || receipt.kind === 'uploading' || receipt.kind === 'invalid';

  return (
    <Card padding="lg" aria-labelledby="expense-entry-title">
      <Card.Body>
        <form onSubmit={event => void submit(event)}>
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
                ref={amountRef}
                size="md"
                inputMode="decimal"
                autoComplete="off"
                prefix={CURRENCIES[draft.currency].symbol}
                value={draft.amountText}
                onValueChange={amountText => {
                  setSavedNote(null);
                  patch({ amountText });
                }}
                invalid={amountInvalid}
              />
            </FormField>

            <FormField label="Currency" helper={existing ? LOCKED_CURRENCY_HELPER : undefined}>
              <Select size="md" value={draft.currency} onValueChange={value => patch({ currency: value as CurrencyCode })} aria-label="Currency" disabled={existing !== undefined}>
                {currencies.map(code => (
                  <Select.Item key={code} value={code}>
                    {code} {CURRENCIES[code].symbol}
                  </Select.Item>
                ))}
              </Select>
            </FormField>

            <FormField label="Category">
              <Select size="md" value={draft.categoryId} onValueChange={value => patch({ categoryId: value as ExpenseCategoryId })} aria-label="Category">
                {availableCategories(categories, draft.categoryId).map(category => (
                  <Select.Item key={category.id} value={category.id} description={category.hint}>
                    {category.name}
                  </Select.Item>
                ))}
              </Select>
            </FormField>

            <FormField label="Date">
              <DatePicker
                aria-label="Date"
                value={draft.occurredOnDate}
                max={latestDate}
                weekStartsOn={settings.weekStartsOn}
                clearable={false}
                onValueChange={value => patch({ occurredOnDate: value ?? draft.occurredOnDate })}
              />
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
            <p className={styles.preview} data-testid="expense-entry-preview">
              {previewText(amountMinor, draft, settings, rates, existing)}
            </p>
          )}

          <div className={styles.receiptGrid}>
            {existing ? (
              <div className={styles.well}>
                <p className={styles.railTitle}>{existing.receiptRef ? 'Receipt attached' : 'No receipt'}</p>
                <p className={styles.railProse}>A receipt photo can only be added while an expense is first saved.</p>
              </div>
            ) : (
              <>
                <FormField label="Receipt photo" optional error={receiptError}>
                  <FileUpload
                    key={uploadKey}
                    accept={RECEIPT_EXTENSIONS}
                    maxFiles={1}
                    maxSize={RECEIPT_MAX_BYTES}
                    upload={upload}
                    onValueChange={changeReceipt}
                    disabled={confirming}
                    invalid={receiptError !== undefined}
                    aria-label="Receipt photo"
                  />
                </FormField>
                <div className={styles.well}>
                  <p className={styles.railTitle}>Receipts are a record</p>
                  <p className={styles.railProse}>
                    The photo is kept with this expense once you save it. Attaching it here doesn’t scan it or use a scan — the amount is what you type.
                  </p>
                </div>
              </>
            )}
          </div>

          {savedNote && (
            <p className={styles.savedNote} role="status">
              {savedNote}
            </p>
          )}
          <EntryCapNote advisory={advisory} />

          <div className={styles.formActions}>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={confirming || command.isPending || receipt.kind === 'uploading'} disabled={saveBlocked}>
              {existing ? 'Save changes' : 'Save expense'}
            </Button>
          </div>
        </form>
      </Card.Body>
    </Card>
  );
}
