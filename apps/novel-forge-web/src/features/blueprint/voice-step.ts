import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

import { decisionPayload, lockedDecision, passList, passText, sameJson } from './engine-pass';

export const VOICE_TOPIC = 'voice';
export const VOICE_LABEL_MAX = 60;
export const VOICE_LINE_MAX = 240;
export const VOICE_NOTES_MAX = 600;
export const VOICE_SAMPLE_MAX = 1_200;

export interface VoiceSample {
  id: string;
  label: string;
  tradeoff: string;
  opening: string;
}

export interface VoiceRound {
  samples: VoiceSample[];
}

export function parseVoiceRound(round: BlueprintRoundResponse | null): VoiceRound {
  const options = round?.options as Record<string, unknown> | null;
  const samples = passList(options?.['samples']).flatMap(item => {
    const sample = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const id = passText(sample['id']);
    return id ? [{ id, label: passText(sample['label']), tradeoff: passText(sample['tradeoff']), opening: passText(sample['opening']) }] : [];
  });
  return { samples };
}

export interface VoiceDraft {
  optionId: string;
  label: string;
  notes: string;
  paragraph: string;
  why: string;
}

export const EMPTY_VOICE_DRAFT: VoiceDraft = { optionId: '', label: '', notes: '', paragraph: '', why: '' };

/** Picking a sample takes its label and its opening as the starting paragraph; both stay the author's to rewrite afterwards. */
export function pickVoice(draft: VoiceDraft, sample: VoiceSample): VoiceDraft {
  return { ...draft, optionId: sample.id, label: sample.label, paragraph: sample.opening };
}

export function voiceLockIssue(draft: VoiceDraft): string | null {
  if (!draft.label.trim()) return 'Pick a voice, or name the one you want in your own words.';
  if (!draft.paragraph.trim()) return 'Keep a paragraph in that voice — it is what the notes are about.';
  if (!draft.notes.trim()) return 'Say what this voice means for whoever writes the chapters; it rides every chapter pack.';
  return null;
}

export interface VoiceSelectionBody {
  optionId?: string;
  label: string;
  notes: string;
  paragraph: string;
  why?: string;
}

export function buildVoiceSelection(draft: VoiceDraft, round: VoiceRound): VoiceSelectionBody | null {
  if (voiceLockIssue(draft)) return null;
  const offered = round.samples.some(sample => sample.id === draft.optionId);
  const why = draft.why.trim();
  return {
    ...(offered ? { optionId: draft.optionId } : {}),
    label: draft.label.trim(),
    notes: draft.notes.trim(),
    paragraph: draft.paragraph.trim(),
    ...(why ? { why } : {}),
  };
}

export function voiceDraftFrom(round: VoiceRound): VoiceDraft {
  const first = round.samples[0];
  return first ? pickVoice(EMPTY_VOICE_DRAFT, first) : EMPTY_VOICE_DRAFT;
}

export function restoreVoiceDraft(entries: LedgerEntryResponse[]): VoiceDraft | null {
  const decided = lockedDecision(entries, VOICE_TOPIC);
  if (!decided) return null;
  const payload = decisionPayload(decided);
  return {
    optionId: '',
    label: passText(payload['label']) || decided.statement,
    notes: decided.writerLine ?? '',
    paragraph: passText(payload['paragraph']),
    why: decided.why ?? '',
  };
}

/**
 * A new round offers three new samples: whatever the author has only been shown is replaced, and the label and paragraph they wrote
 * or locked stay theirs. Sample ids name a different voice in every round, so the pick is resolved again by its label.
 */
export function nextVoiceDraft(current: VoiceDraft, offered: VoiceDraft, round: VoiceRound): VoiceDraft {
  if (sameJson(current, offered)) return voiceDraftFrom(round);
  return { ...current, optionId: round.samples.find(sample => sample.label.trim() === current.label.trim())?.id ?? '' };
}
