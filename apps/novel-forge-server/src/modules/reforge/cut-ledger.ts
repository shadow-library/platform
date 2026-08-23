import { type ReforgeTransform } from '@server/database';

import { countTokens } from '../ai/context/token-budget';
import { deriveOutputNumbering, type PlanSpanLike } from './plan-validation';

/** The subset of a `reforge_cuts` row the pure ledger functions need — DB rows and model deltas both satisfy it. */
export interface CutEntryLike {
  cutKey: string;
  kind: ReforgeTransform.CutKind;
  label: string;
  aliases?: string[] | null;
  detail?: string | null;
  disposition: ReforgeTransform.CutDisposition;
  replacementNote?: string | null;
  originSpanOrdinal: number;
  firstSourceChapter: number;
  lastSourceChapter: number;
  effectiveFromOutput: number;
}

export interface SeedSpan extends PlanSpanLike {
  arcLabel?: string | null;
  rationale?: string | null;
  cutThreads?: string[] | null;
}

// The ledger and the discovered cuts share this ceiling; past it the writer stops reading the list.
export const CUT_SLICE_TOKENS = 1_500;

export function slugifyCutKey(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 128) || 'cut'
  );
}

/**
 * Seeds the ledger from an approved plan (transform design §6.1): every `drop` span becomes an entry
 * for the arc it removes, and every `cutThreads` name on any span becomes an entry of its own.
 * `effectiveFromOutput` is the first output chapter written after the cut, which is where the ban on
 * resurfacing starts.
 */
export function buildSeedCuts(spans: SeedSpan[]): CutEntryLike[] {
  const derived = deriveOutputNumbering(spans);
  const ordered = [...spans].sort((a, b) => a.ordinal - b.ordinal);
  const entries = new Map<string, CutEntryLike>();

  for (const [index, span] of ordered.entries()) {
    // The ban starts at the first chapter written at or after the cut; a trailing drop has none, so it
    // lands one past the end and can never be resurfaced.
    const nextOutput = derived.spans.slice(index).find(s => s.firstOutputChapter !== null)?.firstOutputChapter ?? derived.outputChapterCount + 1;

    if (span.action === 'drop') {
      const label = span.arcLabel ?? `source chapters ${span.fromChapter}-${span.toChapter}`;
      const key = slugifyCutKey(label);
      if (!entries.has(key)) {
        entries.set(key, {
          cutKey: key,
          kind: 'arc',
          label,
          aliases: span.arcLabel ? [span.arcLabel] : [],
          detail: span.rationale ?? null,
          disposition: 'cut',
          replacementNote: null,
          originSpanOrdinal: span.ordinal,
          firstSourceChapter: span.fromChapter,
          lastSourceChapter: span.toChapter,
          effectiveFromOutput: nextOutput,
        });
      }
    }

    for (const thread of span.cutThreads ?? []) {
      const key = slugifyCutKey(thread);
      // Insert-conflict-keeps-existing, exactly as `rebrand_glossary` merges: a cut is never re-described.
      if (entries.has(key)) continue;
      entries.set(key, {
        cutKey: key,
        kind: span.action === 'drop' ? 'subplot' : 'thread',
        label: thread,
        aliases: [thread],
        detail: span.rationale ?? null,
        disposition: span.action === 'drop' ? 'cut' : 'condensed',
        replacementNote: null,
        originSpanOrdinal: span.ordinal,
        firstSourceChapter: span.fromChapter,
        lastSourceChapter: span.toChapter,
        effectiveFromOutput: nextOutput,
      });
    }
  }

  return [...entries.values()];
}

/**
 * The bridge across a seam, composed from the plan rather than from a model call: everything §6.2 asks
 * for — what the reader last saw, what the dropped span took with it, and what must be true when this
 * chapter opens — is already authored in the plan the human approved, and a model call here would only
 * paraphrase it with a chance of contradicting it.
 */
export function renderBridgeDirective(dropped: SeedSpan, following: SeedSpan): string {
  const lines = [
    `The source chapters ${dropped.fromChapter}-${dropped.toChapter}${dropped.arcLabel ? ` (${dropped.arcLabel})` : ''} are cut. The reader never saw them and never will.`,
  ];
  if (dropped.rationale) lines.push(`They were cut because: ${dropped.rationale}`);
  const cuts = dropped.cutThreads ?? [];
  if (cuts.length > 0) lines.push(`Gone with them: ${cuts.join('; ')}. Any set-up they carried is either paid elsewhere or abandoned — never resumed here.`);
  lines.push(`Open this chapter on the far side of that gap: ${following.continuityNotes?.trim() ?? 'carry the story forward without referring to the removed material.'}`);
  lines.push('Do not summarise, flash back to, or have a character recall the cut material to cover the seam.');
  return lines.join('\n');
}

/** Bridge directives for a whole plan, keyed by the ordinal of the span that carries them — the one after each drop. */
export function buildBridgeDirectives(spans: SeedSpan[]): Map<number, string> {
  const ordered = [...spans].sort((a, b) => a.ordinal - b.ordinal);
  const directives = new Map<number, string>();
  for (const [index, span] of ordered.entries()) {
    const previous = ordered[index - 1];
    if (previous?.action === 'drop') directives.set(span.ordinal, renderBridgeDirective(previous, span));
  }
  return directives;
}

export interface CutSliceOptions {
  /** The span's source prose; entries whose aliases appear in it are the ones the writer is about to trip over. */
  sourceText?: string;
  /** Entries that only bind from a later output chapter are not this chapter's problem. */
  outputChapter?: number;
  budgetTokens?: number;
}

function isAtRisk(entry: CutEntryLike, haystack: string): boolean {
  for (const alias of [entry.label, ...(entry.aliases ?? [])]) {
    if (alias.length >= 3 && haystack.includes(alias.toLowerCase())) return true;
  }
  return false;
}

function renderEntry(entry: CutEntryLike): string {
  const parts = [`- ${entry.label} [${entry.kind}, ${entry.disposition}, from output ch. ${entry.effectiveFromOutput}]`];
  if (entry.detail) parts.push(`  ${entry.detail}`);
  if (entry.replacementNote) parts.push(`  Instead: ${entry.replacementNote}`);
  return parts.join('\n');
}

/**
 * Orders the ledger by what this chapter is actually at risk of resurfacing (§6.1): first the entries
 * whose aliases appear in this span's source prose, then the most recently effective. Truncation drops
 * the least-at-risk entries, never the ones the writer is reading around.
 */
export function selectCutSlice(entries: CutEntryLike[], options: CutSliceOptions = {}): CutEntryLike[] {
  const haystack = (options.sourceText ?? '').toLowerCase();
  const budget = options.budgetTokens ?? CUT_SLICE_TOKENS;
  const relevant = options.outputChapter === undefined ? entries : entries.filter(entry => entry.effectiveFromOutput <= (options.outputChapter as number));

  const ranked = [...relevant].sort((a, b) => {
    const risk = Number(isAtRisk(b, haystack)) - Number(isAtRisk(a, haystack));
    return risk !== 0 ? risk : b.effectiveFromOutput - a.effectiveFromOutput;
  });

  const fitting: CutEntryLike[] = [];
  let used = 0;
  for (const entry of ranked) {
    const tokens = countTokens(renderEntry(entry));
    if (used + tokens > budget) break;
    fitting.push(entry);
    used += tokens;
  }
  return fitting;
}

/** One block per cut, in the order `selectCutSlice` ranked them — the rendering both ledger sections use. */
export function renderCutLedger(entries: CutEntryLike[]): string {
  if (entries.length === 0) return 'Nothing has been cut yet.';
  return entries.map(renderEntry).join('\n');
}
