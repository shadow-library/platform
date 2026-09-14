import { type CommandDelivery } from './command.types';
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

export type CategoryTone = 'accent' | 'success' | 'warning' | 'neutral';

export interface ExpenseCategory {
  id: ExpenseCategoryId;
  name: string;
  glyph: string;
  hint: string;
  tone: CategoryTone;
  swatch: string;
  archived: boolean;
}

export const UNCATEGORISED: ExpenseCategory = {
  id: 'uncat',
  name: 'Uncategorised',
  glyph: '?',
  hint: 'Waiting for a category',
  tone: 'neutral',
  swatch: 'var(--sh-neutral-solid)',
  archived: false,
};

export const BUILT_IN_CATEGORIES: ExpenseCategory[] = [
  { id: 'food', name: 'Food', glyph: '◍', hint: 'Coffee, eating out, takeaway', tone: 'warning', swatch: 'var(--sh-warning-solid)', archived: false },
  { id: 'groceries', name: 'Groceries', glyph: '⌾', hint: 'The weekly shop', tone: 'success', swatch: 'var(--sh-success-solid)', archived: false },
  { id: 'transport', name: 'Transport', glyph: '⛁', hint: 'Tram, fuel, parking', tone: 'accent', swatch: 'var(--sh-accent)', archived: false },
  { id: 'bills', name: 'Bills', glyph: '▤', hint: 'Power, water, phone', tone: 'neutral', swatch: 'var(--sh-neutral-solid)', archived: false },
  { id: 'health', name: 'Health', glyph: '✚', hint: 'Gym, physio, kit', tone: 'success', swatch: 'var(--sh-success-solid)', archived: false },
  { id: 'shopping', name: 'Shopping', glyph: '✦', hint: 'Clothes, books, gifts', tone: 'accent', swatch: 'var(--sh-accent)', archived: false },
  { id: 'home', name: 'Home', glyph: '⌂', hint: 'Rent, repairs, furniture', tone: 'warning', swatch: 'var(--sh-warning-solid)', archived: false },
  { id: 'subs', name: 'Subscriptions', glyph: '♪', hint: 'Managed on the Subscriptions screen', tone: 'accent', swatch: 'var(--sh-accent)', archived: false },
  UNCATEGORISED,
];

type ExpenseSource = 'manual' | 'ocr';

type SyncState = 'synced' | 'queued';

interface ReceiptLine {
  label: string;
  value: string;
  lowConfidence: boolean;
}

interface ExpenseReceipt {
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
  linkedQuestId?: string;
  /** Line items read from a scanned receipt; the web cannot write them back, so an expense carrying them cannot be re-created. */
  hasLineItems?: boolean;
  receiptRef?: string;
  receipt?: ExpenseReceipt;
}

export type ExpenseAuditAction = 'created' | 'updated' | 'deleted' | 'receipt_confirmed';

export type ExpenseAuditField = 'amountMinor' | 'currency' | 'occurredOn' | 'categoryId' | 'note' | 'merchant';

export interface ExpenseAuditChange {
  field: ExpenseAuditField;
  from: string | null;
  to: string | null;
}

export interface ExpenseAuditEntry {
  id: string;
  action: ExpenseAuditAction;
  changes: ExpenseAuditChange[];
  /** ISO timestamp of when the change reached the server; a queued local edit carries the time it was made. */
  at: string;
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
  /** A receipt already uploaded and confirmed; only an expense being created can carry one. */
  receiptRef?: string;
}

export type SubscriptionFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

export type SubscriptionDueState = 'none' | 'upcoming' | 'due' | 'overdue';

export type ReminderLead = 'on-day' | '1-day' | '2-day' | '3-day' | '1-week';

export type SubscriptionCategoryId = 'music' | 'tools' | 'health' | 'books' | 'media';

export const SUBSCRIPTION_CATEGORIES: Record<SubscriptionCategoryId, { name: string; expenseCategoryId: ExpenseCategoryId }> = {
  music: { name: 'Music', expenseCategoryId: 'subs' },
  tools: { name: 'Subscriptions', expenseCategoryId: 'subs' },
  health: { name: 'Health', expenseCategoryId: 'health' },
  books: { name: 'Shopping', expenseCategoryId: 'shopping' },
  media: { name: 'Media', expenseCategoryId: 'subs' },
};

/** Only these round-trip through the server. */
export const SUBSCRIPTION_CATEGORY_OPTIONS: readonly SubscriptionCategoryId[] = ['tools', 'health', 'books'];

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
  /** The expense category key the server stores, which `categoryId` maps lossily; confirmed cycles are filed under it, so its current name is the subscription's tag. */
  expenseCategoryId: ExpenseCategoryId;
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
  /** The expense date the rate was captured for. */
  date: string;
}

export interface FinanceSettings {
  homeCurrency: CurrencyCode;
  /** The account's enabled currencies, home first; the entry form offers only these. */
  currencies: CurrencyCode[];
  weekStartsOn: 0 | 1;
  /** Minor units of `homeCurrency`; null when the owner has not set a budget. */
  monthlyBudgetMinor: number | null;
}

export type BudgetStanding = { kind: 'unset' } | { kind: 'set'; budgetMinor: number; spentMinor: number; leftMinor: number; daysLeft: number };

export interface RangeSpend {
  range: FinanceRange;
  periodLabel: string;
  spentMinor: number;
  /** Change against the same stretch of the previous period; null when that stretch holds no spending to compare with. */
  spentDeltaFraction: number | null;
  /** The stretch the delta compares against, phrased to follow "more than" or "less than". */
  comparisonLabel: string;
  averageDayMinor: number;
  daysLogged: number;
  categories: CategorySlice[];
  /** Rates the expenses in range were converted at. */
  fxRates: FxRateSnapshot[];
}

/** Active subscriptions whose monthly equivalent could not be converted to the home currency yet (no FX rate seen for their currency) — excluded from every total rather than counted as 0. */
export interface UnconvertedSubscriptions {
  count: number;
  currencies: CurrencyCode[];
}

export interface FinanceSummary {
  settings: FinanceSettings;
  categories: ExpenseCategory[];
  ranges: Record<FinanceRange, RangeSpend>;
  /** Always the calendar month, whatever range is on screen: the budget is monthly. */
  budget: BudgetStanding;
  subscriptionsMonthlyMinor: number;
  unconvertedSubscriptions: UnconvertedSubscriptions;
  activeSubscriptions: number;
  nextSubscription: { name: string; dueDate: string } | null;
  totalExpenses: number;
  /** The newest locked rate per foreign currency, for the entry form's conversion estimate. */
  latestRates: FxRateSnapshot[];
  queuedExpense: Expense | null;
}

export interface ExpenseView {
  expense: ExpenseDetail | null;
  settings: FinanceSettings;
  categories: ExpenseCategory[];
  /** The newest locked rate per foreign currency, for the entry form's conversion estimate. */
  rates: FxRateSnapshot[];
}

export interface ReceiptScanQuota {
  cap: number;
  used: number;
  resetAt: string;
}

export interface ReceiptUploadProgress {
  onProgress: (percent: number) => void;
  signal: AbortSignal;
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

export interface SubscriptionCollision {
  date: string;
  names: string[];
  /** Sum of the charges with a known rate; `null` when none of them converted. */
  totalMinor: number | null;
  /** Charges on this date that could not be converted — reported in their own currency rather than folded into `totalMinor` as 0. */
  unconvertedCharges: { currency: CurrencyCode; amountMinor: number }[];
}

export interface SubscriptionsView {
  items: Subscription[];
  categories: ExpenseCategory[];
  homeCurrency: CurrencyCode;
  settings: FinanceSettings;
  activeCount: number;
  monthlyTotalMinor: number;
  yearlyTotalMinor: number;
  upcoming: UpcomingCharge[];
  /** Days on which more than one active subscription renews — surfaced as information, never as a warning. */
  collisions: SubscriptionCollision[];
  /** The newest locked rate per foreign currency, for converting each subscription's monthly equivalent to `homeCurrency`. */
  rates: FxRateSnapshot[];
  unconverted: UnconvertedSubscriptions;
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
  delivery?: CommandDelivery;
}
