import { type Command } from './command.types';
import { formatMinor, parseAmountToMinor } from './finance.rules';
import { CURRENCIES, type CurrencyCode, type ExpenseCategory, type FinanceCommand } from './finance.types';
import { type OccurrenceState } from './quest.types';
import { lbToKg, toDisplayMetricValue, WEIGHT_RANGE_KG } from './quick-logs.rules';
import { type HealthMetricEntry, type HealthMetricKey, type QuickLogCommand, type WeightEntry } from './quick-logs.types';
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
  | { kind: 'quest-resolved'; questName: string; state: OccurrenceState }
  | { kind: 'weight-out-of-range' }
  | { kind: 'sleep-out-of-range' }
  | { kind: 'water-out-of-range' }
  | { kind: 'health-unavailable' }
  | { kind: 'reading-failed'; on: CaptureReadingSource }
  | { kind: 'money-unavailable' }
  | { kind: 'currency-not-enabled'; symbol: string; homeCurrency: CurrencyCode };

export type CaptureParse =
  | { status: 'idle' }
  | { status: 'draft'; draft: CaptureDraft }
  | { status: 'ambiguous'; question: string; choices: CaptureChoice[] }
  | { status: 'waiting'; on: CaptureReadingSource }
  | { status: 'unrecognised'; problem: CaptureProblem };

/** An `unavailable` choice is still listed, so the owner sees why that reading can't be saved. */
export type CaptureChoice = { status: 'available'; draft: CaptureDraft } | { status: 'unavailable'; kind: CaptureKind; kindLabel: string; summary: string };

export interface CaptureMoney {
  homeCurrency: CurrencyCode;
  currencies: CurrencyCode[];
  categories: ExpenseCategory[];
}

export interface CaptureOccurrence extends CaptureTarget {
  state: OccurrenceState;
}

export interface CaptureContext {
  date: string;
  occurrences: CaptureOccurrence[];
  /** Null until the account's Money settings are known; an amount is never saved in a guessed currency. */
  money: CaptureMoney | null;
  weight: CaptureWeight;
  health: CaptureHealth;
}

export type CaptureReadingSource = 'weight' | 'health';

export type CaptureWeight = { status: 'loading' } | { status: 'failed' } | { status: 'known'; today: WeightEntry | null };

/** `unavailable`: the first sync has not landed, so a value already on the server would be neither shown nor addressable. */
export type CaptureHealth = { status: 'loading' } | { status: 'unavailable' } | { status: 'failed' } | { status: 'known'; today: HealthMetricEntry[] };

export const CAPTURE_SLEEP_MAX_HOURS = 24;

export const CAPTURE_WATER_MAX_LITRES = 10;

const TWO_THINGS = 'That could be two things. Pick one — nothing is saved until you do.';
const THOUSANDS_GROUPED = /^\d{1,3}(?:[.,]\d{3})+$/;

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

interface QuestMatch {
  target: CaptureOccurrence;
  match: QuestNameMatch;
}

/** `rescheduled` only moves the time, so it can still be completed. */
function isOpen(state: OccurrenceState): boolean {
  return state === 'upcoming' || state === 'rescheduled';
}

function matchScore({ target, match }: QuestMatch): number {
  return NAME_MATCH_RANK[match] * 2 + (isOpen(target.state) ? 0 : 1);
}

function matchQuest(query: string, occurrences: CaptureOccurrence[]): QuestMatch | null {
  let best: QuestMatch | null = null;
  for (const target of occurrences) {
    const match = matchQuestName(query, target.questName);
    if (match === null) continue;
    const candidate = { target, match };
    if (best === null || matchScore(candidate) < matchScore(best)) best = candidate;
  }
  return best;
}

function resolvedQuest(target: CaptureOccurrence): CaptureParse {
  return { status: 'unrecognised', problem: { kind: 'quest-resolved', questName: target.questName, state: target.state } };
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
  if (context.weight.status === 'failed') return { status: 'unrecognised', problem: { kind: 'reading-failed', on: 'weight' } };
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

function formatAmount(value: number, fractionDigits?: number): string {
  const digits = fractionDigits === undefined ? { maximumFractionDigits: 3 } : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits };
  return new Intl.NumberFormat('en-US', digits).format(value);
}

function typedFractionDigits(typed: string): number {
  return typed.split(/[.,]/)[1]?.length ?? 0;
}

interface MetricReading {
  key: HealthMetricKey;
  label: string;
  unit: string;
  stored: number;
  /** The value at the precision the owner typed it, so the preview never rounds away what is saved. */
  shown: string;
  hint: string;
}

type TodaysMetric = { status: 'blocked'; parse: CaptureParse } | { status: 'read'; earlier: HealthMetricEntry | null };

function readTodaysMetric(key: HealthMetricKey, context: CaptureContext): TodaysMetric {
  const { health } = context;
  if (health.status === 'loading') return { status: 'blocked', parse: { status: 'waiting', on: 'health' } };
  if (health.status === 'unavailable') return { status: 'blocked', parse: { status: 'unrecognised', problem: { kind: 'health-unavailable' } } };
  if (health.status === 'failed') return { status: 'blocked', parse: { status: 'unrecognised', problem: { kind: 'reading-failed', on: 'health' } } };
  return { status: 'read', earlier: health.today.find(entry => entry.key === key && entry.date === context.date) ?? null };
}

function storedAmount(key: HealthMetricKey, stored: number, unit: string): string {
  return `${formatAmount(toDisplayMetricValue(key, stored))} ${unit}`;
}

interface MetricSave {
  stored: number;
  fields: CaptureField[];
  warning: string | null;
}

function metricDraft({ key, label, hint }: MetricReading, date: string, { stored, fields, warning }: MetricSave): CaptureDraft {
  return { kind: 'metric', kindLabel: label, hint, warning, fields, action: { domain: 'quick-log', command: { type: 'health.save', key, date, value: stored } } };
}

/** `health.save` stores the day's value, the same as the Body & health screen, so a line never adds to what is already logged unless the owner picks Add. */
function replacingDraft(reading: MetricReading, date: string, earlier: HealthMetricEntry | null): CaptureDraft {
  const { key, label, unit, stored, shown } = reading;
  const fields = [
    { label, value: shown, mono: true },
    { label: 'Date', value: 'Today', guessed: true },
  ];
  const warning = earlier
    ? `Saving sets today’s ${label.toLowerCase()} to ${shown} (was ${storedAmount(key, earlier.value, unit)}). It replaces that value rather than adding to it.`
    : null;
  return metricDraft(reading, date, { stored, fields, warning });
}

function metricParse(reading: MetricReading, context: CaptureContext): CaptureParse {
  const today = readTodaysMetric(reading.key, context);
  if (today.status === 'blocked') return today.parse;
  return { status: 'draft', draft: replacingDraft(reading, context.date, today.earlier) };
}

function waterParse(amount: string, unit: string, context: CaptureContext): CaptureParse {
  const inMillilitres = unit.toLowerCase().startsWith('m');
  const exact = inMillilitres ? (THOUSANDS_GROUPED.test(amount) ? Number(amount.replace(/[.,]/g, '')) : decimal(amount)) : decimal(amount) * 1000;
  const millilitres = Math.round(exact);
  if (Math.abs(exact - millilitres) > 1e-6 || millilitres > CAPTURE_WATER_MAX_LITRES * 1000) return { status: 'unrecognised', problem: { kind: 'water-out-of-range' } };

  const shown = inMillilitres ? `${formatAmount(millilitres)} ml` : `${formatAmount(decimal(amount), typedFractionDigits(amount))} l`;
  const reading: MetricReading = { key: 'water', label: 'Water', unit: 'l', stored: millilitres, shown, hint: 'sets today’s total' };
  const today = readTodaysMetric('water', context);
  if (today.status === 'blocked') return today.parse;
  const { earlier } = today;
  if (!earlier) return { status: 'draft', draft: replacingDraft(reading, context.date, null) };

  const was = storedAmount('water', earlier.value, 'l');
  const total = earlier.value + millilitres;
  const choice = (value: string, stored: number): CaptureChoice => ({
    status: 'available',
    draft: metricDraft(reading, context.date, { stored, fields: [{ label: 'Water', value }], warning: null }),
  });
  const add: CaptureChoice =
    total > CAPTURE_WATER_MAX_LITRES * 1000
      ? { status: 'unavailable', kind: 'metric', kindLabel: 'Water', summary: `Add ${shown} would pass ${CAPTURE_WATER_MAX_LITRES} l` }
      : choice(`Add ${shown} → ${storedAmount('water', total, 'l')}`, total);
  return {
    status: 'ambiguous',
    question: `Today already has ${was} of water. Add ${shown} to it, or set it to ${shown}? Nothing is saved until you pick.`,
    choices: [add, choice(`Set today to ${shown} (replaces ${was})`, millilitres)],
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
    if (!found) return { status: 'unrecognised', problem: { kind: 'no-quest' } };
    return isOpen(found.target.state) ? { status: 'draft', draft: questDraft(found.target) } : resolvedQuest(found.target);
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
    return metricParse({ key: 'steps', label: 'Steps', unit: 'steps', stored: steps, shown: `${formatAmount(steps)} steps`, hint: 'overwrites today’s steps' }, context);
  }

  match = /(?<![\d.,])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(ml|millilitres?|milliliters?|l|litres?|liters?|water)\b/i.exec(text);
  if (match) return waterParse(match[1] as string, match[2] as string, context);

  match = /(?:slept|sleep)\s*(\d+(?:[.,]\d+)?)/i.exec(text);
  if (match) {
    const typed = match[1] as string;
    const hours = decimal(typed);
    if (hours > CAPTURE_SLEEP_MAX_HOURS) return { status: 'unrecognised', problem: { kind: 'sleep-out-of-range' } };
    return metricParse({ key: 'sleep', label: 'Sleep', unit: 'h', stored: hours, shown: `${formatAmount(hours, typedFractionDigits(typed))} h`, hint: 'last night' }, context);
  }

  match = /(\d[\d.,]*)\s*(?:kcal|calories)\b/i.exec(text);
  if (match) {
    const calories = Number((match[1] as string).replace(/[.,]/g, ''));
    return metricParse({ key: 'calories', label: 'Calories burned', unit: 'kcal', stored: calories, shown: `${formatAmount(calories)} kcal`, hint: 'optional metric' }, context);
  }

  const named = matchQuest(text, context.occurrences);
  if (named?.match === 'exact' && !isOpen(named.target.state)) return resolvedQuest(named.target);
  const open = context.occurrences.filter(occurrence => isOpen(occurrence.state));

  if (/^[a-z][a-z\s]*[a-z]\s+\d+(?:[.,]\d{1,2})?$/i.test(text)) {
    const quest = matchQuest(text, open);
    if (quest) {
      const choices: CaptureChoice[] = [questDraft(quest.target), sideQuestDraft(text, date)].map(draft => ({ status: 'available', draft }));
      return { status: 'ambiguous', question: TWO_THINGS, choices };
    }
  }

  const openNamed = matchQuest(text, open);
  if (openNamed && openNamed.match !== 'words-besides-number') return { status: 'draft', draft: questDraft(openNamed.target) };

  const found = findAmount(text);
  if (found) return expenseParse(text, found, context);

  return { status: 'draft', draft: journalDraft(text, date) };
}
