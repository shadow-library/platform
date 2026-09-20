import { excerptAround } from '@server/common';

import { LATIN_PROFILE, type ScriptProfile } from './script-profile';
import { findTerm, occurrenceRanges, sourceTerms } from './term-matcher';
import { type FidelityIssue, type TranslationTermLike } from './translation.types';

export interface FidelityScanBands {
  lengthRatio?: [number, number];
  paragraphRatio?: [number, number];
}

export interface FidelityScanInput {
  original: string;
  translation: string;
  entries: TranslationTermLike[];
  profile: ScriptProfile;
  bands?: FidelityScanBands;
}

const FULLWIDTH_DIGIT_OFFSET = 0xff10 - 0x30;
const DIALOGUE_DRIFT_MIN_QUOTES = 4;
const DIALOGUE_DRIFT_THRESHOLD = 0.25;

function countMarks(text: string, marks: string[]): number {
  return marks.reduce((sum, mark) => sum + occurrenceRanges(text, mark).length, 0);
}

function normalizeDigits(text: string): string {
  return text.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - FULLWIDTH_DIGIT_OFFSET));
}

function digitRuns(text: string): string[] {
  return normalizeDigits(text).match(/\d+/g) ?? [];
}

function tally(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function countParagraphs(text: string): number {
  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean).length;
}

function scanScriptResidue(translation: string, entries: TranslationTermLike[], profile: ScriptProfile): FidelityIssue[] {
  const ignoredRanges = entries
    .filter(entry => entry.treatment === 'preserve')
    .flatMap(sourceTerms)
    .flatMap(term => occurrenceRanges(translation, term));

  const pattern = new RegExp(profile.residue.source, 'gu');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(translation))) {
    const index = match.index;
    if (ignoredRanges.some(([start, end]) => index >= start && index < end)) continue;
    return [
      {
        source: 'fidelity',
        type: 'source_script_residue',
        detail: 'source-script characters remain in the translation',
        excerpt: excerptAround(translation, index, match[0].length),
      },
    ];
  }
  return [];
}

function scanGlossaryViolations(original: string, translation: string, entries: TranslationTermLike[], profile: ScriptProfile): FidelityIssue[] {
  const issues: FidelityIssue[] = [];
  const translationLower = translation.toLowerCase();

  for (const entry of entries) {
    if (entry.status === 'rejected') continue;
    let matchIndex = -1;
    let matchedTerm = '';
    for (const term of sourceTerms(entry)) {
      matchIndex = findTerm(original, term, profile);
      if (matchIndex !== -1) {
        matchedTerm = term;
        break;
      }
    }
    if (matchIndex === -1) continue;
    if (translationLower.includes(entry.target.toLowerCase())) continue;
    issues.push({
      source: 'fidelity',
      type: 'glossary_violation',
      detail: `"${entry.sourceTerm}" → "${entry.target}" not found in the translation`,
      excerpt: excerptAround(original, matchIndex, matchedTerm.length),
    });
  }

  return issues;
}

function scanNumberDrift(original: string, translation: string): FidelityIssue[] {
  const issues: FidelityIssue[] = [];
  const originalCounts = tally(digitRuns(original));
  const translationCounts = tally(digitRuns(translation));

  const missing: string[] = [];
  for (const [run, count] of originalCounts) for (let i = count - (translationCounts.get(run) ?? 0); i > 0; i--) missing.push(run);
  const extra: string[] = [];
  for (const [run, count] of translationCounts) for (let i = count - (originalCounts.get(run) ?? 0); i > 0; i--) extra.push(run);

  if (missing.length > 0) issues.push({ source: 'fidelity', type: 'number_drift', detail: `missing number(s) from the translation: ${missing.join(', ')}` });
  if (extra.length > 0) issues.push({ source: 'fidelity', type: 'number_drift', detail: `unexpected number(s) not in the original: ${extra.join(', ')}` });
  return issues;
}

/**
 * Deterministic fidelity checks that run before the AI audit: stuck source
 * script, dropped/renamed glossary terms, digit drift, and coarse shape ratios. `scanScriptResidue`
 * applies the caller's script profile to the translation itself — that is what makes the check
 * meaningful, since it is the source script that must not survive into English prose. Only the
 * dialogue check reads the translation side against `LATIN_PROFILE` instead, since the output is
 * always English regardless of `profile.language`, while its original side still reads against the
 * caller's script profile.
 */
export function scanFidelity(input: FidelityScanInput): FidelityIssue[] {
  const { original, translation, entries, profile } = input;
  const issues: FidelityIssue[] = [
    ...scanScriptResidue(translation, entries, profile),
    ...scanGlossaryViolations(original, translation, entries, profile),
    ...scanNumberDrift(original, translation),
  ];

  const originalParagraphs = countParagraphs(original);
  const translationParagraphs = countParagraphs(translation);
  if (originalParagraphs > 0) {
    const [low, high] = input.bands?.paragraphRatio ?? profile.paragraphBand;
    const ratio = translationParagraphs / originalParagraphs;
    if (ratio < low || ratio > high) {
      issues.push({
        source: 'fidelity',
        type: 'paragraph_drift',
        detail: `paragraph count ratio ${ratio.toFixed(2)} outside [${low}, ${high}] (original ${originalParagraphs}, translation ${translationParagraphs})`,
      });
    }
  }

  const originalQuotes = countMarks(original, profile.quoteMarks);
  const translationQuotes = countMarks(translation, LATIN_PROFILE.quoteMarks);
  if (originalQuotes >= DIALOGUE_DRIFT_MIN_QUOTES) {
    const drift = Math.abs(originalQuotes - translationQuotes) / originalQuotes;
    if (drift > DIALOGUE_DRIFT_THRESHOLD) {
      issues.push({ source: 'fidelity', type: 'dialogue_drift', detail: `opening quote count drifted: original ${originalQuotes}, translation ${translationQuotes}` });
    }
  }

  if (original.length > 0) {
    const [low, high] = input.bands?.lengthRatio ?? profile.lengthBand;
    const ratio = translation.length / original.length;
    if (ratio < low || ratio > high) issues.push({ source: 'fidelity', type: 'length_band', detail: `length ratio ${ratio.toFixed(2)} outside [${low}, ${high}]` });
  }

  return issues;
}
