import { type ScriptProfile } from './script-profile';
import { countTerm, sourceTerms } from './term-matcher';
import { type TranslationTermLike } from './translation.types';

export const TRANSLATION_GLOSSARY_SLICE_CAP = 120;

export interface TranslationGlossarySlice {
  entries: TranslationTermLike[];
  rejected: TranslationTermLike[];
  appliedTerms: Record<string, number>;
}

function occurrenceCount(originalText: string, entry: TranslationTermLike, profile: ScriptProfile): number {
  return sourceTerms(entry).reduce((sum, term) => sum + countTerm(originalText, term, profile), 0);
}

/**
 * Ranks entries by occurrence in the original chapter (glossary-slice §D3/D6): rejected entries that
 * still occur are reported separately so the model is told "translate this normally" without ever
 * counting against the cap; among the rest, approved and preserve-treatment entries fill the cap
 * ahead of merely suggested ones, since those are the terms a re-run must render identically.
 */
export function selectTranslationGlossarySlice(
  originalText: string,
  entries: TranslationTermLike[],
  profile: ScriptProfile,
  cap: number = TRANSLATION_GLOSSARY_SLICE_CAP,
): TranslationGlossarySlice {
  const rejected: TranslationTermLike[] = [];
  const binding: { entry: TranslationTermLike; count: number }[] = [];
  const provisional: { entry: TranslationTermLike; count: number }[] = [];

  for (const entry of entries) {
    const count = occurrenceCount(originalText, entry, profile);
    if (count === 0) continue;
    if (entry.status === 'rejected') {
      rejected.push(entry);
      continue;
    }
    if (entry.status === 'approved' || entry.treatment === 'preserve') binding.push({ entry, count });
    else provisional.push({ entry, count });
  }

  binding.sort((a, b) => b.count - a.count);
  provisional.sort((a, b) => b.count - a.count);
  const kept = [...binding, ...provisional].slice(0, cap).map(match => match.entry);

  const appliedTerms: Record<string, number> = {};
  for (const entry of kept) if (entry.id !== undefined) appliedTerms[entry.id] = entry.revision ?? 0;

  return { entries: kept, rejected, appliedTerms };
}

function renderTermLine(entry: TranslationTermLike): string {
  const variants = (entry.variants ?? []).length > 0 ? ` (also: ${(entry.variants ?? []).join(', ')})` : '';
  const meaning = entry.meaning ? ` — ${entry.meaning}` : '';
  return `${entry.sourceTerm}${variants} → ${entry.target} [${entry.category} · ${entry.treatment}]${meaning}`;
}

export function renderTranslationGlossarySlice(slice: TranslationGlossarySlice): string {
  const approved = slice.entries.filter(entry => entry.status === 'approved');
  const suggested = slice.entries.filter(entry => entry.status === 'suggested');

  const blocks: string[] = [];
  if (approved.length > 0) blocks.push(`## Approved terms (binding)\n${approved.map(renderTermLine).join('\n')}`);
  if (suggested.length > 0) blocks.push(`## Provisional terms (use exactly as given until reviewed)\n${suggested.map(renderTermLine).join('\n')}`);
  if (slice.rejected.length > 0) blocks.push(`## Not terms (translate these normally)\n${slice.rejected.map(renderTermLine).join('\n')}`);

  if (blocks.length === 0) return 'No glossary terms apply to this chapter — report any novel-specific terms in discoveredTerms.';
  return blocks.join('\n\n');
}
