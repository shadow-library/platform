import { sourceTerms as combineTerms, escapeRegExp, isCaseInsensitiveTerm } from '@server/common';

import { type ScriptProfile } from './script-profile';
import { type TranslationTermLike } from './translation.types';

export function sourceTerms(entry: TranslationTermLike): string[] {
  return combineTerms(entry.sourceTerm, entry.variants);
}

export function occurrenceRanges(text: string, term: string): [number, number][] {
  if (term.length === 0) return [];
  const ranges: [number, number][] = [];
  let index = text.indexOf(term);
  while (index !== -1) {
    ranges.push([index, index + term.length]);
    index = text.indexOf(term, index + term.length);
  }
  return ranges;
}

export function findTerm(text: string, term: string, profile: ScriptProfile): number {
  if (term.length < profile.minTermLength) return -1;
  if (!profile.wordBoundaries) return text.indexOf(term);

  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, isCaseInsensitiveTerm(term) ? 'i' : '');
  return pattern.exec(text)?.index ?? -1;
}

export function countTerm(text: string, term: string, profile: ScriptProfile): number {
  if (term.length < profile.minTermLength) return 0;
  if (!profile.wordBoundaries) return occurrenceRanges(text, term).length;

  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, isCaseInsensitiveTerm(term) ? 'gi' : 'g');
  return (text.match(pattern) ?? []).length;
}
