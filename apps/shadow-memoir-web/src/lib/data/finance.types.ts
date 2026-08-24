import { type EntryCapAdvisory } from './entry-caps';

export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'NOK' | 'SEK' | 'DKK' | 'CHF' | 'JPY' | 'INR' | 'AUD' | 'CAD' | 'NZD' | 'SGD' | 'HKD' | 'PLN' | 'CZK' | 'ZAR' | 'BRL';

export interface CurrencyMeta {
  code: CurrencyCode;
  label: string;
  symbol: string;
  /** Minor units per major unit, as a power of ten. Zero for the currencies that have no subunit. */
  exponent: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  EUR: { code: 'EUR', label: 'Euro', symbol: '€', exponent: 2 },
  USD: { code: 'USD', label: 'US dollar', symbol: '$', exponent: 2 },
  GBP: { code: 'GBP', label: 'Pound sterling', symbol: '£', exponent: 2 },
  NOK: { code: 'NOK', label: 'Norwegian krone', symbol: 'kr', exponent: 2 },
  SEK: { code: 'SEK', label: 'Swedish krona', symbol: 'kr', exponent: 2 },
  DKK: { code: 'DKK', label: 'Danish krone', symbol: 'kr', exponent: 2 },
  CHF: { code: 'CHF', label: 'Swiss franc', symbol: 'CHF', exponent: 2 },
  JPY: { code: 'JPY', label: 'Japanese yen', symbol: '¥', exponent: 0 },
  INR: { code: 'INR', label: 'Indian rupee', symbol: '₹', exponent: 2 },
  AUD: { code: 'AUD', label: 'Australian dollar', symbol: '$', exponent: 2 },
  CAD: { code: 'CAD', label: 'Canadian dollar', symbol: '$', exponent: 2 },
  NZD: { code: 'NZD', label: 'New Zealand dollar', symbol: '$', exponent: 2 },
  SGD: { code: 'SGD', label: 'Singapore dollar', symbol: '$', exponent: 2 },
  HKD: { code: 'HKD', label: 'Hong Kong dollar', symbol: '$', exponent: 2 },
  PLN: { code: 'PLN', label: 'Polish złoty', symbol: 'zł', exponent: 2 },
  CZK: { code: 'CZK', label: 'Czech koruna', symbol: 'Kč', exponent: 2 },
  ZAR: { code: 'ZAR', label: 'South African rand', symbol: 'R', exponent: 2 },
  BRL: { code: 'BRL', label: 'Brazilian real', symbol: 'R$', exponent: 2 },
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCIES) as CurrencyCode[];

export type ExpenseCategoryId = 'food' | 'groceries' | 'transport' | 'bills' | 'health' | 'shopping' | 'home' | 'subs' | 'uncat';

export interface ExpenseCategory {
  id: ExpenseCategoryId;
  name: string;
  glyph: string;
  hint: string;
  swatch: string;
  archived: boolean;
}

export const UNCATEGORISED: ExpenseCategory = {
  id: 'uncat',
  name: 'Uncategorised',
  glyph: '◌',
  hint: 'Waiting for a category',
  swatch: 'var(--sh-border-strong)',
  archived: false,
};

export const BUILT_IN_CATEGORIES: ExpenseCategory[] = [
  { id: 'food', name: 'Food', glyph: '◍', hint: 'Coffee, eating out, takeaway', swatch: 'var(--sh-accent)', archived: false },
  { id: 'groceries', name: 'Groceries', glyph: '⌾', hint: 'The weekly shop', swatch: 'var(--sh-accent)', archived: false },
  { id: 'transport', name: 'Transport', glyph: '⛁', hint: 'Tram, fuel, parking', swatch: 'var(--sh-info-solid)', archived: false },
  { id: 'bills', name: 'Bills', glyph: '▤', hint: 'Power, water, phone', swatch: 'var(--sh-info-solid)', archived: false },
  { id: 'health', name: 'Health', glyph: '✚', hint: 'Gym, physio, kit', swatch: 'var(--sh-success-solid)', archived: false },
  { id: 'shopping', name: 'Shopping', glyph: '✦', hint: 'Clothes, books, gifts', swatch: 'var(--sh-success-solid)', archived: false },
  { id: 'home', name: 'Home', glyph: '⌂', hint: 'Rent, repairs, furniture', swatch: 'var(--sh-accent)', archived: false },
  { id: 'subs', name: 'Subscriptions', glyph: '♪', hint: 'Managed on the Subscriptions screen', swatch: 'var(--sh-warning-solid)', archived: false },
  UNCATEGORISED,
];

export type ExpenseSource = 'manual' | 'ocr';

export type SyncState = 'synced' | 'queued';

export interface ReceiptLine {
  label: string;
  value: string;
  lowConfidence: boolean;
}

export interface ExpenseReceipt {
  fileName: string;
  sizeBytes: number;
  lines: ReceiptLine[];
}

export interface Expense {
  id: string;
  amountMinor: number;
  /** The display representation exactly as the owner typed it — never re-derived from `amountMinor`. */
  amountText: string;
  currency: CurrencyCode;
  /** Locked at entry time and never refreshed; null when the rate could not be fetched. */
  fxRate: number | null;
  homeAmountMinor: number | null;
  categoryId: ExpenseCategoryId;
  merchant?: string;
  note?: string;
  occurredOnDate: string;
  loggedAt: string;
  source: ExpenseSource;
  syncState: SyncState;
  linkedQuestTitle?: string;
  linkedQuestNote?: string;
  linkedSubscriptionId?: string;
  receipt?: ExpenseReceipt;
}

export interface ExpenseAuditEntry {
  text: string;
  when: string;
}

export interface ExpenseDetail extends Expense {
  audit: ExpenseAuditEntry[];
}

export interface ExpenseDraft {
  /** Client-minted UUIDv7 (ARCHITECTURE §12.4) — an expense created offline already carries its permanent identity. Minted at dispatch when a caller leaves it out. */
  id?: string;
  amountText: string;
  currency: CurrencyCode;
  categoryId: ExpenseCategoryId;
  occurredOnDate: string;
  merchant?: string;
  note?: string;
  source?: ExpenseSource;
}

export type SubscriptionFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

export type SubscriptionDueState = 'none' | 'upcoming' | 'due' | 'overdue';

export type ReminderLead = 'on-day' | '1-day' | '2-day' | '3-day' | '1-week';

export type SubscriptionCategoryId = 'music' | 'tools' | 'health' | 'books' | 'media';

export const SUBSCRIPTION_CATEGORIES: Record<SubscriptionCategoryId, { name: string; expenseCategoryId: ExpenseCategoryId }> = {
  music: { name: 'Music', expenseCategoryId: 'subs' },
  tools: { name: 'Tools', expenseCategoryId: 'subs' },
  health: { name: 'Health', expenseCategoryId: 'health' },
  books: { name: 'Books', expenseCategoryId: 'shopping' },
  media: { name: 'Media', expenseCategoryId: 'subs' },
};

export interface Subscription {
  id: string;
  name: string;
  note?: string;
  amountMinor: number;
  amountText: string;
  currency: CurrencyCode;
  frequency: SubscriptionFrequency;
  customIntervalDays?: number;
  billingDay: number;
  nextDueDate: string;
  lastConfirmedDate: string | null;
  categoryId: SubscriptionCategoryId;
  reminderEnabled: boolean;
  reminderLead: ReminderLead;
  monthlyEquivalentMinor: number;
  active: boolean;
  createdAt: string;
  trialEndsOn?: string;
  linkedQuestTitle?: string;
}

export interface SubscriptionDraft {
  name: string;
  amountText: string;
  currency: CurrencyCode;
  frequency: SubscriptionFrequency;
  customIntervalDays?: number;
  nextDueDate: string;
  categoryId: SubscriptionCategoryId;
  reminderEnabled: boolean;
  reminderLead: ReminderLead;
  note?: string;
}

export type FinanceRange = 'week' | 'month' | 'year';

export interface CategorySlice {
  category: ExpenseCategory;
  count: number;
  totalMinor: number;
  percentOfLargest: number;
}

export interface FxRateSnapshot {
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
}

export interface FinanceSummary {
  range: FinanceRange;
  periodLabel: string;
  homeCurrency: CurrencyCode;
  spentMinor: number;
  spentDeltaFraction: number | null;
  comparisonLabel: string;
  budgetMinor: number | null;
  budgetLeftMinor: number | null;
  daysRemaining: number;
  subscriptionsMonthlyMinor: number;
  activeSubscriptions: number;
  nextSubscriptionLabel: string;
  averageDayMinor: number;
  daysLogged: number;
  totalExpenses: number;
  categories: CategorySlice[];
  fxRates: FxRateSnapshot[];
  receiptScansUsed: number;
  receiptScanLimit: number;
  receiptQuotaResetsOn: string;
  queuedExpense: Expense | null;
}

export interface ExpenseQuery {
  range: FinanceRange;
  search?: string;
  categoryId?: ExpenseCategoryId;
  limit?: number;
}

export interface ExpensePage {
  items: Expense[];
  shown: number;
  total: number;
  periodLabel: string;
  homeCurrency: CurrencyCode;
}

export interface UpcomingCharge {
  subscriptionId: string;
  name: string;
  dueDate: string;
  amountMinor: number;
  currency: CurrencyCode;
}

export interface SubscriptionsView {
  items: Subscription[];
  homeCurrency: CurrencyCode;
  activeCount: number;
  monthlyTotalMinor: number;
  yearlyTotalMinor: number;
  upcoming: UpcomingCharge[];
  /** Days on which more than one active subscription renews — surfaced as information, never as a warning. */
  collisions: { date: string; names: string[]; totalMinor: number }[];
}

export interface CategoriesView {
  items: CategorySlice[];
  homeCurrency: CurrencyCode;
  uncategorised: { count: number; totalMinor: number };
}

export type FinanceCommand =
  | { type: 'expense.create'; draft: ExpenseDraft }
  | { type: 'expense.update'; id: string; draft: ExpenseDraft }
  | { type: 'expense.delete'; id: string }
  | { type: 'subscription.create'; draft: SubscriptionDraft }
  | { type: 'subscription.setActive'; id: string; active: boolean }
  | { type: 'subscription.confirmCycle'; id: string; billingDate: string }
  | { type: 'category.rename'; id: ExpenseCategoryId; name: string }
  | { type: 'category.setArchived'; id: ExpenseCategoryId; archived: boolean };

export interface FinanceCommandResult {
  id: string;
  message: string;
  /** Present once the month's entry allowance is nearly or fully used. Advisory only — the write already happened. */
  advisory?: EntryCapAdvisory;
}
