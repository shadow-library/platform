import { getEncoding } from 'js-tiktoken';

// Shared encoder instance — o200k_base for consistency across all token counting.
const enc = getEncoding('o200k_base');

export function countTokens(text: string): number {
  if (!text) return 0;
  return enc.encode(text).length;
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
      const words = para.split(/\s+/);
      let wordAccumulated = '';
      for (const word of words) {
        const candidate = wordAccumulated ? wordAccumulated + ' ' + word : word;
        if (countTokens(candidate) <= maxTokens) wordAccumulated = candidate;
        else break;
      }
      return { text: wordAccumulated, truncated: true };
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
      const words = para.split(/\s+/);
      let wordAccumulated = '';
      for (let w = words.length - 1; w >= 0; w--) {
        const word = words[w] ?? '';
        const candidate = wordAccumulated ? word + ' ' + wordAccumulated : word;
        if (countTokens(candidate) <= maxTokens) wordAccumulated = candidate;
        else break;
      }
      return { text: wordAccumulated, truncated: true };
    } else {
      return { text: accumulated, truncated: true };
    }
  }

  return { text: accumulated, truncated: false };
}

export function applyBudget<T extends { tokens: number }>(sections: T[], budgetTokens: number): T[] {
  const result: T[] = [];
  let used = 0;
  for (const section of sections) {
    if (used + section.tokens <= budgetTokens) {
      result.push(section);
      used += section.tokens;
    }
  }
  // Guarantee at least one section so the LLM always has context to work with.
  // If nothing fit (budget > 0 but every section overshoots), force-include the first.
  if (result.length === 0 && sections.length > 0 && budgetTokens > 0) {
    const first = sections[0];
    if (first !== undefined) result.push(first);
  }
  return result;
}
