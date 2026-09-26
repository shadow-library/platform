import { getEncoding } from 'js-tiktoken';

// Shared encoder instance — o200k_base for consistency across all token counting.
const enc = getEncoding('o200k_base');

export function countTokens(text: string): number {
  if (!text) return 0;
  return enc.encode(text).length;
}

/** The longest run of `text`'s leading characters within `maxTokens`, found by bisection: the cut for a word longer than the limit, or for a script written without spaces. */
export function leadingChars(text: string, maxTokens: number): string {
  const chars = Array.from(text);
  let fits = 0;
  let over = chars.length + 1;
  while (over - fits > 1) {
    const middle = Math.floor((fits + over) / 2);
    if (countTokens(chars.slice(0, middle).join('')) <= maxTokens) fits = middle;
    else over = middle;
  }
  return chars.slice(0, fits).join('');
}

/** `leadingChars` from the end of the text. */
export function trailingChars(text: string, maxTokens: number): string {
  const chars = Array.from(text);
  let fits = 0;
  let over = chars.length + 1;
  while (over - fits > 1) {
    const middle = Math.floor((fits + over) / 2);
    if (countTokens(chars.slice(chars.length - middle).join('')) <= maxTokens) fits = middle;
    else over = middle;
  }
  return chars.slice(chars.length - fits).join('');
}

/**
 * The longest run of whole words from one end of a paragraph within `maxTokens`, found by bisection; when not even one word fits (a
 * script written without spaces), that word is cut by character instead.
 */
function wordRun(words: string[], maxTokens: number, end: 'head' | 'tail'): string {
  const take = (count: number): string[] => (end === 'head' ? words.slice(0, count) : words.slice(words.length - count));
  let fits = 0;
  let over = words.length + 1;
  while (over - fits > 1) {
    const middle = Math.floor((fits + over) / 2);
    if (countTokens(take(middle).join(' ')) <= maxTokens) fits = middle;
    else over = middle;
  }
  if (fits > 0) return take(fits).join(' ');
  return end === 'head' ? leadingChars(words[0] ?? '', maxTokens) : trailingChars(words.at(-1) ?? '', maxTokens);
}

export function truncateAtParagraph(text: string, maxTokens: number): { text: string; truncated: boolean } {
  if (maxTokens === 0) return { text: '', truncated: true };

  const paragraphs = text.split(/\n\n+/);
  let accumulated = '';
  let usedTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = countTokens(para);
    const separator = accumulated ? '\n\n' : '';
    const separatorTokens = accumulated ? countTokens('\n\n') : 0;

    if (usedTokens + separatorTokens + paraTokens <= maxTokens) {
      accumulated += separator + para;
      usedTokens += separatorTokens + paraTokens;
    } else if (accumulated === '') {
      return { text: wordRun(para.split(/\s+/), maxTokens, 'head'), truncated: true };
    } else {
      return { text: accumulated, truncated: true };
    }
  }

  return { text: accumulated, truncated: false };
}

// Keeps the END of the text — the tail — up to maxTokens, dropping from the front instead of the back.
// Used for `prev_ending`: the model must see how the previous chapter actually stopped, not how it started.
export function truncateAtParagraphTail(text: string, maxTokens: number): { text: string; truncated: boolean } {
  if (maxTokens === 0) return { text: '', truncated: true };

  const paragraphs = text.split(/\n\n+/);
  let accumulated = '';
  let usedTokens = 0;

  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const para = paragraphs[i] ?? '';
    const paraTokens = countTokens(para);
    const separator = accumulated ? '\n\n' : '';
    const separatorTokens = accumulated ? countTokens('\n\n') : 0;

    if (usedTokens + separatorTokens + paraTokens <= maxTokens) {
      accumulated = para + separator + accumulated;
      usedTokens += separatorTokens + paraTokens;
    } else if (accumulated === '') {
      return { text: wordRun(para.split(/\s+/), maxTokens, 'tail'), truncated: true };
    } else {
      return { text: accumulated, truncated: true };
    }
  }

  return { text: accumulated, truncated: false };
}

interface BudgetOmission {
  key: string;
  reason: 'budget' | 'unresolved';
  tokens?: number;
}

export interface BudgetResult<T> {
  fitting: T[];
  omitted: BudgetOmission[];
}

interface BudgetedSection {
  key: string;
  tokens: number;
  required?: boolean;
  /** Lower claims the leftover budget first; unprioritised sections compete after every prioritised one, in list order. */
  priority?: number;
}

/** Decides which sections fit; the survivors keep their list order, which is the order they render in. */
export function applyBudget<T extends BudgetedSection>(sections: T[], budgetTokens: number): BudgetResult<T> {
  const kept = new Set<T>();
  const omitted: BudgetOmission[] = [];
  // Required sections are charged against the budget before anything competes for it, so a pack whose
  // meaning depends on one section (a round's own input) can never lose it to a long prefix.
  let used = sections.reduce((sum, section) => sum + (section.required ? section.tokens : 0), 0);
  const byPriority = [...sections].sort((left, right) => (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER));
  for (const section of byPriority) {
    if (section.required) {
      kept.add(section);
    } else if (used + section.tokens <= budgetTokens) {
      kept.add(section);
      used += section.tokens;
    } else {
      omitted.push({ key: section.key, reason: 'budget', tokens: section.tokens });
    }
  }
  // Guarantee at least one section so the LLM always has context to work with.
  // If nothing fit (budget > 0 but every section overshoots), force-include the first.
  const first = sections[0];
  if (kept.size === 0 && first !== undefined && budgetTokens > 0) {
    kept.add(first);
    const idx = omitted.findIndex(o => o.key === first.key);
    if (idx !== -1) omitted.splice(idx, 1);
  }
  return { fitting: sections.filter(section => kept.has(section)), omitted };
}
