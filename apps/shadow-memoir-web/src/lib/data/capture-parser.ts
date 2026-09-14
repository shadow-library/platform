import { type Command } from './command.types';
import { formatMinor, parseAmountToMinor } from './finance.rules';
import { CURRENCIES, type CurrencyCode, type ExpenseCategory, type FinanceCommand } from './finance.types';
import { lbToKg, toStoredMetricValue, WEIGHT_RANGE_KG } from './quick-logs.rules';
import { type HealthMetricKey, type QuickLogCommand, type WeightEntry } from './quick-logs.types';
import { type CaptureTarget } from './view.types';

export type CaptureKind = 'expense' | 'metric' | 'weight' | 'journal' | 'side-quest' | 'quest-action';

export type CaptureAction = { domain: 'quest'; command: Command } | { domain: 'finance'; command: FinanceCommand } | { domain: 'quick-log'; command: QuickLogCommand };

interface CaptureField {
  label: string;
  value: string;
  /** Filled in from a default rather than typed, so the preview can say so in words. */
  guessed?: boolean;
  mono?: boolean;
}

export interface CaptureDraft {
  kind: CaptureKind;
  kindLabel: string;
  hint: string;
  warning: string | null;
  fields: CaptureField[];
  action: CaptureAction;
}

export type CaptureProblem =
  | { kind: 'no-quest' }
  | { kind: 'weight-out-of-range' }
  | { kind: 'sleep-out-of-range' }
  | { kind: 'money-unavailable' }
  | { kind: 'currency-not-enabled'; symbol: string; homeCurrency: CurrencyCode };

export type CaptureParse =
  | { status: 'idle' }
  | { status: 'draft'; draft: CaptureDraft }
  | { status: 'ambiguous'; candidates: CaptureDraft[] }
  | { status: 'waiting'; on: 'weight' }
  | { status: 'unrecognised'; problem: CaptureProblem };

export interface CaptureMoney {
  homeCurrency: CurrencyCode;
  currencies: CurrencyCode[];
  categories: ExpenseCategory[];
}

export interface CaptureContext {
  date: string;
  occurrences: CaptureTarget[];
  /** Null until the account's Money settings are known; an amount is never saved in a guessed currency. */
  money: CaptureMoney | null;
  weight: CaptureWeight;
}

export type CaptureWeight = { status: 'loading' } | { status: 'known'; today: WeightEntry | null };

export const CAPTURE_SLEEP_MAX_HOURS = 24;

/**
 * A number is only an amount when it stands on its own: never glued to a letter (`e2e`, `2e5`), never part
 * of a longer digit run (a millisecond timestamp, an IBAN), and never more than nine digits.
 */
const AMOUNT = /(^|[^\w.,])((€|\$|£|¥|₹)\s?)?(\d{1,9}(?:[.,]\d{1,2})?)(?![\w.,]*\d)(\s?(€|\$|£|¥|₹))?/g;
const FOOD = /coffee|lunch|dinner|groceries|food|takeaway|snack|breakfast/i;
const DONE_PREFIX = /^(?:done|completed?)\s+/i;
const WORD = /[\p{L}\p{N}]+/gu;
const DIGITS = /^\p{N}+$/u;

interface AmountMatch {
  start: number;
  end: number;
  digits: string;
  symbol: string | undefined;
  decimalFormatted: boolean;
}

function decimal(value: string): number {
  return Number(value.replace(',', '.'));
}

/** A currency-marked number wins, then the first written as a decimal, then the first number at all. */
function findAmount(text: string): AmountMatch | null {
  const candidates: AmountMatch[] = [];
  for (const match of text.matchAll(AMOUNT)) {
    const digits = match[4] as string;
    candidates.push({
      start: match.index + (match[1] as string).length,
      end: match.index + match[0].length,
      digits,
      symbol: match[3] ?? match[6],
      decimalFormatted: /[.,]/.test(digits),
    });
  }

  return candidates.find(candidate => candidate.symbol !== undefined) ?? candidates.find(candidate => candidate.decimalFormatted) ?? candidates[0] ?? null;
}

/** The line as typed, minus the amount token alone — the seam's doubled space is closed, nothing else is touched. */
function noteWithout(text: string, amount: AmountMatch): string {
  const before = text.slice(0, amount.start);
  const after = text.slice(amount.end);
  const joined = /\s$/.test(before) && /^\s/.test(after) ? before + after.slice(1) : before + after;
  return joined.trim();
}

/** A symbol is several currencies (`$`), so it only ever reads as one this account already uses. */
function accountCurrencyFor(symbol: string, money: CaptureMoney): CurrencyCode | null {
  return [money.homeCurrency, ...money.currencies].find(code => CURRENCIES[code].symbol === symbol) ?? null;
}

function words(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? [];
}

export type QuestNameMatch = 'exact' | 'words' | 'words-besides-number' | 'prefix';

const NAME_MATCH_RANK: Record<QuestNameMatch, number> = { exact: 0, words: 1, 'words-besides-number': 2, prefix: 3 };

/**
 * A single letter only matches the same whole word. A number only matches the same whole number when the name has
 * one (`quest 5` is not `Quest number 35`); against a name with none it is left over (`stretch 10` is still `Evening stretch`).
 */
export function matchQuestName(query: string, name: string): QuestNameMatch | null {
  const nameWords = words(name);
  const numbered = nameWords.some(word => DIGITS.test(word));
  const typed = words(query);
  const terms = numbered ? typed : typed.filter(term => !DIGITS.test(term));
  if (terms.length === 0) return null;
  const complete = terms.length === typed.length;
  if (terms.join(' ') === nameWords.join(' ')) return complete ? 'exact' : 'words-besides-number';

  let prefixed = false;
  for (const term of terms) {
    if (nameWords.includes(term)) continue;
    if (DIGITS.test(term) || term.length === 1 || !nameWords.some(word => word.startsWith(term))) return null;
    prefixed = true;
  }
  if (prefixed) return 'prefix';
  return complete ? 'words' : 'words-besides-number';
}

export function captureQuestQuery(raw: string): string {
  return raw.trim().replace(DONE_PREFIX, '');
}

function matchQuest(query: string, occurrences: CaptureTarget[]): { target: CaptureTarget; match: QuestNameMatch } | null {
  let best: { target: CaptureTarget; match: QuestNameMatch } | null = null;
  for (const target of occurrences) {
    const match = matchQuestName(query, target.questName);
    if (match !== null && (best === null || NAME_MATCH_RANK[match] < NAME_MATCH_RANK[best.match])) best = { target, match };
  }
  return best;
}

function questDraft(target: CaptureTarget): CaptureDraft {
  return {
    kind: 'quest-action',
    kindLabel: 'Quest completion',
    hint: 'matched one of today’s occurrences',
    warning: null,
    fields: [
      { label: 'Quest', value: target.questName },
      { label: 'Outcome', value: 'Complete' },
    ],
    action: { domain: 'quest', command: { type: 'quest.complete', occurrenceId: target.occurrenceId } },
  };
}

function sideQuestDraft(text: string, date: string): CaptureDraft {
  return {
    kind: 'side-quest',
    kindLabel: 'Side quest',
    hint: 'no schedule, no streak',
    warning: null,
    fields: [
      { label: 'What you did', value: text },
      { label: 'Stat', value: 'Discipline', guessed: true },
    ],
    action: { domain: 'quick-log', command: { type: 'sidequest.log', draft: { date, name: text, statAffinity: 'discipline' } } },
  };
}

function journalDraft(text: string, date: string): CaptureDraft {
  return {
    kind: 'journal',
    kindLabel: 'Journal',
    hint: 'markdown-lite, kept as typed',
    warning: null,
    fields: [
      { label: 'Entry', value: text.length > 42 ? `${text.slice(0, 42)}…` : text },
      { label: 'Date', value: 'Today', guessed: true },
    ],
    action: { domain: 'quick-log', command: { type: 'journal.save', draft: { date, text, mood: null } } },
  };
}

function weightParse(value: number, unit: 'kg' | 'lb', context: CaptureContext): CaptureParse {
  const kg = unit === 'lb' ? lbToKg(value) : value;
  if (kg < WEIGHT_RANGE_KG.min || kg > WEIGHT_RANGE_KG.max) return { status: 'unrecognised', problem: { kind: 'weight-out-of-range' } };
  if (context.weight.status === 'loading') return { status: 'waiting', on: 'weight' };
  const earlier = context.weight.today;

  return {
    status: 'draft',
    draft: {
      kind: 'weight',
      kindLabel: 'Weight',
      hint: 'one value a day',
      warning: earlier ? `Today already has ${earlier.kg} kg. Saving replaces it, and the earlier value stays in History as corrected.` : null,
      fields: [
        { label: 'Weight', value: `${value} ${unit}`, mono: true },
        { label: 'Date', value: 'Today', guessed: true },
      ],
      action: { domain: 'quick-log', command: { type: 'weight.save', date: context.date, kg, confirmedReplacement: earlier !== null } },
    },
  };
}

function metricDraft(key: HealthMetricKey, label: string, value: number, unit: string, hint: string, date: string): CaptureDraft {
  return {
    kind: 'metric',
    kindLabel: label,
    hint,
    warning: null,
    fields: [
      { label, value: `${value} ${unit}`, mono: true },
      { label: 'Date', value: 'Today', guessed: true },
    ],
    action: { domain: 'quick-log', command: { type: 'health.save', key, date, value: toStoredMetricValue(key, value) } },
  };
}

function expenseParse(text: string, found: AmountMatch, context: CaptureContext): CaptureParse {
  const { money } = context;
  if (!money) return { status: 'unrecognised', problem: { kind: 'money-unavailable' } };

  const symbolCurrency = found.symbol === undefined ? null : accountCurrencyFor(found.symbol, money);
  if (found.symbol !== undefined && symbolCurrency === null) {
    return { status: 'unrecognised', problem: { kind: 'currency-not-enabled', symbol: found.symbol, homeCurrency: money.homeCurrency } };
  }
  const currency = symbolCurrency ?? money.homeCurrency;
  const amountMinor = parseAmountToMinor(found.digits, currency) ?? 0;
  const note = noteWithout(text, found);
  const food = money.categories.find(category => category.id === 'food' && !category.archived);
  const category = food && FOOD.test(note) ? food : null;

  return {
    status: 'draft',
    draft: {
      kind: 'expense',
      kindLabel: 'Expense',
      hint: category ? 'category guessed from the note' : 'no category matched the note',
      warning: null,
      fields: [
        { label: 'Amount', value: formatMinor(amountMinor, currency), mono: true },
        { label: 'Note', value: note || '—' },
        category ? { label: 'Category', value: category.name, guessed: true } : { label: 'Category', value: 'Uncategorised' },
        { label: 'Date', value: 'Today', guessed: true },
      ],
      action: {
        domain: 'finance',
        command: {
          type: 'expense.create',
          draft: { amountText: found.digits, currency, categoryId: category?.id ?? 'uncat', occurredOnDate: context.date, note: note || undefined },
        },
      },
    },
  };
}

/**
 * Local-first heuristics only (PRODUCT.md §6.2) — the palette must never wait on a network or model call, so
 * an unrecognised line falls back to a journal draft rather than asking anything to interpret it. A typed
 * prefix (`done`, `j`, `sq`) is the owner saying what the line is, so it is read before any number in it.
 */
export function parseCapture(raw: string, context: CaptureContext): CaptureParse {
  const text = raw.trim();
  if (text.length === 0) return { status: 'idle' };
  const { date } = context;

  if (DONE_PREFIX.test(text)) {
    const found = matchQuest(captureQuestQuery(text), context.occurrences);
    return found ? { status: 'draft', draft: questDraft(found.target) } : { status: 'unrecognised', problem: { kind: 'no-quest' } };
  }

  let match = /^(?:j|journal)\s+(.{3,})/i.exec(text);
  if (match) return { status: 'draft', draft: journalDraft(match[1] as string, date) };

  match = /^(?:sq|side\s*quest)\s+(.{3,})/i.exec(text);
  if (match) return { status: 'draft', draft: sideQuestDraft(match[1] as string, date) };

  match = /^(?:w|weight)?\s*(\d+(?:[.,]\d+)?)\s*(kg|lbs?)\b/i.exec(text);
  if (match) return weightParse(decimal(match[1] as string), (match[2] as string).toLowerCase() === 'kg' ? 'kg' : 'lb', context);

  match = /(\d[\d.,]*)\s*(k)?\s*steps?\b/i.exec(text);
  if (match) {
    const steps = match[2] ? Math.round(decimal(match[1] as string) * 1000) : Number((match[1] as string).replace(/[.,]/g, ''));
    return { status: 'draft', draft: metricDraft('steps', 'Steps', steps, 'steps', 'overwrites today’s steps', date) };
  }

  match = /(\d+(?:[.,]\d)?)\s*(?:l|litres?|liters?|water)\b/i.exec(text);
  if (match) return { status: 'draft', draft: metricDraft('water', 'Water', decimal(match[1] as string), 'l', 'adds to today', date) };

  match = /(?:slept|sleep)\s*(\d+(?:[.,]\d+)?)/i.exec(text);
  if (match) {
    const hours = decimal(match[1] as string);
    if (hours > CAPTURE_SLEEP_MAX_HOURS) return { status: 'unrecognised', problem: { kind: 'sleep-out-of-range' } };
    return { status: 'draft', draft: metricDraft('sleep', 'Sleep', hours, 'h', 'last night', date) };
  }

  match = /(\d[\d.,]*)\s*(?:kcal|calories)\b/i.exec(text);
  if (match) return { status: 'draft', draft: metricDraft('calories', 'Calories burned', Number((match[1] as string).replace(/[.,]/g, '')), 'kcal', 'optional metric', date) };

  if (/^[a-z][a-z\s]*[a-z]\s+\d+(?:[.,]\d{1,2})?$/i.test(text)) {
    const quest = matchQuest(text, context.occurrences);
    if (quest) return { status: 'ambiguous', candidates: [questDraft(quest.target), sideQuestDraft(text, date)] };
  }

  const named = matchQuest(text, context.occurrences);
  if (named && named.match !== 'words-besides-number') return { status: 'draft', draft: questDraft(named.target) };

  const found = findAmount(text);
  if (found) return expenseParse(text, found, context);

  return { status: 'draft', draft: journalDraft(text, date) };
}
