import { type DiffHunkResponse, type DiffOp, type DraftResponse, type DraftRevisionSource, type DraftVersionResponse, type VersionComparisonResponse } from '@/lib/apis';

const SOURCE_LABELS: Record<DraftRevisionSource, string> = {
  generated: 'Written from the plan',
  patched: 'Patched by the AI',
  rewritten: 'Rewritten by the AI',
  revised: 'Revised from your note',
  imported: 'Imported',
  hand_edited: 'You edited the text',
  chat_edited: 'The chat edited the text',
  amended: 'Amended by you',
  restored: 'Restored',
  passage_rewritten: 'One passage rewritten at your request',
};

export function versionSourceLabel(version: Pick<DraftVersionResponse, 'source' | 'restoredFrom'>): string {
  if (version.source === null) return 'Text from before versions were kept';
  if (version.source === 'restored' && version.restoredFrom !== null) return `Restored version ${version.restoredFrom} as a new version`;
  return SOURCE_LABELS[version.source];
}

type RestoreDraft = Pick<DraftResponse, 'status' | 'reviewStatus' | 'approvedRevision'>;

export type RestoreGate = { allowed: true } | { allowed: false; reason: string };

export const FINAL_RESTORE_REASON = 'Restore isn’t available on a final chapter — Amend the text instead.';

export function restoreGate(draft: RestoreDraft, version: Pick<DraftVersionResponse, 'current'>, generating: boolean): RestoreGate {
  if (draft.status === 'final') return { allowed: false, reason: FINAL_RESTORE_REASON };
  if (version.current) return { allowed: false, reason: 'This is the current version.' };
  if (generating || draft.reviewStatus === 'generating') return { allowed: false, reason: 'The chapter is being written — restore once that’s done.' };
  return { allowed: true };
}

/** What the confirm step says before a restore: it writes a new version through the hand-save path, so an approval never survives it. */
export function restoreConsequences(draft: RestoreDraft, version: Pick<DraftVersionResponse, 'revision' | 'approved'>): string[] {
  const lines = [`Version ${version.revision}’s text comes back as a new version. Nothing is lost — the current text stays in the list.`];
  if (version.approved) lines.push('This is the version you approved, but restoring still makes a new version, so you’ll approve it again.');
  else if (draft.approvedRevision !== null) lines.push('Restoring clears your approval — you’ll approve the restored text again.');
  lines.push('Later chapters written from this one are marked as out of date, as after any edit.');
  return lines;
}

export function restoredMessage(before: Pick<DraftResponse, 'revision' | 'saveSeq'>, after: Pick<DraftResponse, 'revision' | 'saveSeq'>, restored: number): string {
  if (before.revision === after.revision && before.saveSeq === after.saveSeq) return `Version ${restored} is the same as the current text — nothing changed.`;
  return `Version ${restored} restored as version ${after.revision}`;
}

export function orderedPair(a: number, b: number): { from: number; to: number } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

export interface DiffPiece {
  op: DiffOp;
  text: string;
}

export interface DiffParagraph {
  pieces: DiffPiece[];
  changed: boolean;
}

export type DiffRow = { kind: 'paragraph'; paragraph: DiffParagraph } | { kind: 'unchanged'; count: number };

export interface DiffView {
  rows: DiffRow[];
  summary: string;
  identical: boolean;
}

/** Hunks run in reading order across paragraph breaks; the view re-cuts them into paragraphs so each renders as its own block. */
export function diffParagraphs(hunks: readonly DiffHunkResponse[]): DiffParagraph[] {
  const paragraphs: DiffParagraph[] = [];
  let current: DiffPiece[] = [];
  const close = (): void => {
    if (current.some(piece => piece.text.trim())) paragraphs.push({ pieces: current, changed: current.some(piece => piece.op !== 'equal' && piece.text.trim() !== '') });
    current = [];
  };
  for (const hunk of hunks) {
    const parts = hunk.text.split(/\n\s*\n/);
    parts.forEach((part, index) => {
      if (index > 0) close();
      if (part) current.push({ op: hunk.op, text: part });
    });
  }
  close();
  return paragraphs;
}

/** Runs of unchanged paragraphs fold into one row, keeping `context` paragraphs either side of every change. */
export function foldUnchanged(paragraphs: readonly DiffParagraph[], context = 1): DiffRow[] {
  const keep = paragraphs.map((paragraph, index) => paragraph.changed || paragraphs.slice(Math.max(0, index - context), index + context + 1).some(near => near.changed));
  const rows: DiffRow[] = [];
  paragraphs.forEach((paragraph, index) => {
    if (keep[index]) {
      rows.push({ kind: 'paragraph', paragraph });
      return;
    }
    const last = rows[rows.length - 1];
    if (last?.kind === 'unchanged') last.count++;
    else rows.push({ kind: 'unchanged', count: 1 });
  });
  return rows;
}

function words(count: number): string {
  return count === 1 ? '1 word' : `${count.toLocaleString()} words`;
}

export function diffView(comparison: VersionComparisonResponse, context = 1): DiffView {
  const identical = comparison.hunks.every(hunk => hunk.op === 'equal');
  const summary = identical
    ? `Versions ${comparison.from} and ${comparison.to} have the same text`
    : `${words(comparison.wordsAdded)} added · ${words(comparison.wordsRemoved)} removed, from version ${comparison.from} to ${comparison.to}`;
  return { rows: foldUnchanged(diffParagraphs(comparison.hunks), context), summary, identical };
}
