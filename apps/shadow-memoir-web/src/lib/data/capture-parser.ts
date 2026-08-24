import { type Command } from './command.types';
import { type CaptureTarget } from './view.types';

export type CaptureKind = 'expense' | 'metric' | 'weight' | 'journal' | 'side-quest' | 'quest-action';

export interface CaptureField {
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
  command: Command;
}

export type CaptureParse = { status: 'idle' } | { status: 'draft'; draft: CaptureDraft } | { status: 'ambiguous'; candidates: CaptureDraft[] } | { status: 'unrecognised' };

export interface CaptureContext {
  date: string;
  currency: string;
  occurrences: CaptureTarget[];
}

/**
 * A number is only an amount when it stands on its own: never glued to a letter (`e2e`, `2e5`), never part
 * of a longer digit run (a millisecond timestamp, an IBAN), and never more than nine digits.
 */
const AMOUNT = /(^|[^\w.,])((?:€|\$|£)\s?)?(\d{1,9}(?:[.,]\d{1,2})?)(?![\w.,]*\d)(\s?(?:€|\$|£))?/g;
const FOOD = /coffee|lunch|dinner|groceries|food|takeaway|snack|breakfast/i;

interface AmountMatch {
  start: number;
  end: number;
  value: number;
  currencyAdjacent: boolean;
  decimalFormatted: boolean;
}

function decimal(value: string): number {
  return Number(value.replace(',', '.'));
}

/** A currency-marked number wins, then the first written as a decimal, then the first number at all. */
function findAmount(text: string): AmountMatch | null {
  const candidates: AmountMatch[] = [];
  for (const match of text.matchAll(AMOUNT)) {
    const digits = match[3] as string;
    const start = match.index + (match[1] as string).length;
    candidates.push({
      start,
      end: match.index + match[0].length,
      value: decimal(digits),
      currencyAdjacent: match[2] !== undefined || match[4] !== undefined,
      decimalFormatted: /[.,]/.test(digits),
    });
  }

  return candidates.find(candidate => candidate.currencyAdjacent) ?? candidates.find(candidate => candidate.decimalFormatted) ?? candidates[0] ?? null;
}

/** The line as typed, minus the amount token alone — the seam's doubled space is closed, nothing else is touched. */
function noteWithout(text: string, amount: AmountMatch): string {
  const before = text.slice(0, amount.start);
  const after = text.slice(amount.end);
  const joined = /\s$/.test(before) && /^\s/.test(after) ? before + after.slice(1) : before + after;
  return joined.trim();
}

function matchQuest(query: string, occurrences: CaptureTarget[]): CaptureTarget | null {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(term => term.length > 1);
  if (terms.length === 0) return null;
  return occurrences.find(target => terms.every(term => target.questName.toLowerCase().includes(term))) ?? null;
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
    command: { type: 'quest.complete', occurrenceId: target.occurrenceId },
  };
}

function sideQuestDraft(text: string): CaptureDraft {
  return {
    kind: 'side-quest',
    kindLabel: 'Side quest',
    hint: 'no schedule, no streak',
    warning: null,
    fields: [
      { label: 'What you did', value: text },
      { label: 'Stat', value: 'Discipline', guessed: true },
    ],
    command: { type: 'sideQuest.record', text, statAffinity: 'discipline' },
  };
}

function journalDraft(text: string): CaptureDraft {
  return {
    kind: 'journal',
    kindLabel: 'Journal',
    hint: 'markdown-lite, kept as typed',
    warning: null,
    fields: [
      { label: 'Entry', value: text.length > 42 ? `${text.slice(0, 42)}…` : text },
      { label: 'Date', value: 'Today', guessed: true },
    ],
    command: { type: 'journal.record', text },
  };
}

/**
 * Local-first heuristics only (PRODUCT.md §6.2) — the palette must never wait on a network or model call, so
 * an unrecognised line falls back to a journal draft rather than asking anything to interpret it.
 */
export function parseCapture(raw: string, context: CaptureContext): CaptureParse {
  const text = raw.trim();
  if (text.length === 0) return { status: 'idle' };

  let match = /^(?:w|weight)?\s*(\d{2,3}(?:[.,]\d)?)\s*(kg|lb)\b/i.exec(text);
  if (match)
    return {
      status: 'draft',
      draft: {
        kind: 'weight',
        kindLabel: 'Weight',
        hint: 'replaces today’s value',
        warning: 'An earlier weight for today stays in History as corrected.',
        fields: [
          { label: 'Weight', value: `${decimal(match[1] as string)} ${(match[2] as string).toLowerCase()}`, mono: true },
          { label: 'Date', value: 'Today', guessed: true },
        ],
        command: { type: 'weight.record', value: decimal(match[1] as string), unit: (match[2] as string).toLowerCase() === 'lb' ? 'lb' : 'kg' },
      },
    };

  match = /(\d[\d.,]*)\s*(?:k\s*)?steps?\b/i.exec(text);
  if (match) return { status: 'draft', draft: metricDraft('steps', 'Steps', Number((match[1] as string).replace(/[.,]/g, '')), 'steps', 'overwrites today’s steps') };

  match = /(\d+(?:[.,]\d)?)\s*(?:l|litres?|liters?|water)\b/i.exec(text);
  if (match) return { status: 'draft', draft: metricDraft('water', 'Water', decimal(match[1] as string), 'l', 'adds to today') };

  match = /(?:slept|sleep)\s*(\d+(?:[.,]\d)?)/i.exec(text);
  if (match) return { status: 'draft', draft: metricDraft('sleep', 'Sleep', decimal(match[1] as string), 'h', 'last night') };

  match = /(\d[\d.,]*)\s*(?:kcal|calories)\b/i.exec(text);
  if (match) return { status: 'draft', draft: metricDraft('calories', 'Calories burned', Number((match[1] as string).replace(/[.,]/g, '')), 'kcal', 'optional metric') };

  match = /^(?:j|journal)\s+(.{3,})/i.exec(text);
  if (match) return { status: 'draft', draft: journalDraft(match[1] as string) };

  match = /^(?:sq|side\s*quest)\s+(.{3,})/i.exec(text);
  if (match) return { status: 'draft', draft: sideQuestDraft(match[1] as string) };

  match = /^(?:done|completed?)\s+(.{2,})/i.exec(text);
  if (match) {
    const target = matchQuest(match[1] as string, context.occurrences);
    return target ? { status: 'draft', draft: questDraft(target) } : { status: 'unrecognised' };
  }

  const wordAndNumber = /^([a-z][a-z\s]*[a-z])\s+(\d+(?:[.,]\d{1,2})?)$/i.exec(text);
  if (wordAndNumber) {
    const target = matchQuest(wordAndNumber[1] as string, context.occurrences);
    if (target) return { status: 'ambiguous', candidates: [questDraft(target), sideQuestDraft(text)] };
  }

  const named = matchQuest(text, context.occurrences);
  if (named) return { status: 'draft', draft: questDraft(named) };

  const found = findAmount(text);
  if (found) {
    const note = noteWithout(text, found);
    const amount = found.value;
    return {
      status: 'draft',
      draft: {
        kind: 'expense',
        kindLabel: 'Expense',
        hint: 'category guessed from the note',
        warning: null,
        fields: [
          { label: 'Amount', value: `${amount.toFixed(2)} ${context.currency}`, mono: true },
          { label: 'Note', value: note || '—' },
          { label: 'Category', value: FOOD.test(note) ? 'Food' : 'Uncategorised', guessed: true },
          { label: 'Date', value: 'Today', guessed: true },
        ],
        command: { type: 'expense.record', amountMinor: Math.round(amount * 100), currency: context.currency, note },
      },
    };
  }

  return { status: 'draft', draft: journalDraft(text) };
}

function metricDraft(metric: 'steps' | 'water' | 'sleep' | 'calories', label: string, value: number, unit: string, hint: string): CaptureDraft {
  return {
    kind: 'metric',
    kindLabel: label,
    hint,
    warning: null,
    fields: [
      { label, value: `${value} ${unit}`, mono: true },
      { label: 'Date', value: 'Today', guessed: true },
    ],
    command: { type: 'metric.record', metric, value },
  };
}
