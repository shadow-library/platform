import { type BlueprintRoundResponse } from '@/lib/apis';

import { passList, passText } from './engine-pass';

export const CHECK_TOPIC = 'check';
export const CHECK_REASON_MAX = 400;

export const CHECK_SLICES = ['rules', 'cast', 'shape'] as const;

export type CheckSlice = (typeof CHECK_SLICES)[number];

export const CHECK_SLICE_LABELS: Record<CheckSlice, string> = {
  rules: 'Rules and briefs',
  cast: 'Cast, places and ages',
  shape: 'Premise, spine and arcs',
};

export interface CheckChoice {
  id: string;
  label: string;
  detail: string;
}

export interface CheckFinding {
  id: string;
  slice: string;
  kind: string;
  title: string;
  detail: string;
  choices: CheckChoice[];
}

export interface CheckSliceState {
  slice: string;
  run: boolean;
  passed: number;
}

export interface CheckRound {
  slices: CheckSliceState[];
  findings: CheckFinding[];
}

function passNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function parseCheckRound(round: BlueprintRoundResponse | null): CheckRound {
  const options = round?.options as Record<string, unknown> | null;
  const slices = passList(options?.['slices']).flatMap(item => {
    const state = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const slice = passText(state['slice']);
    return slice ? [{ slice, run: state['run'] === true, passed: passNumber(state['passed']) }] : [];
  });
  const findings = passList(options?.['findings']).flatMap(item => {
    const finding = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const id = passText(finding['id']);
    if (!id) return [];
    const choices = passList(finding['choices']).flatMap(entry => {
      const choice = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
      const choiceId = passText(choice['id']);
      return choiceId ? [{ id: choiceId, label: passText(choice['label']), detail: passText(choice['detail']) }] : [];
    });
    return [{ id, slice: passText(finding['slice']), kind: passText(finding['kind']), title: passText(finding['title']), detail: passText(finding['detail']), choices }];
  });
  return { slices, findings };
}

/** Counted against the slices the step has, not the ones a round happens to list: a screen with no round has checked nothing. */
export function uncheckedSlices(round: CheckRound): string[] {
  return CHECK_SLICES.filter(slice => !round.slices.some(state => state.slice === slice && state.run)).map(slice => CHECK_SLICE_LABELS[slice]);
}

export function nextSlice(round: CheckRound): CheckSlice | null {
  return CHECK_SLICES.find(slice => !round.slices.some(state => state.slice === slice && state.run)) ?? null;
}

export function passedCount(round: CheckRound): number {
  return round.slices.reduce((total, state) => total + state.passed, 0);
}

export interface Resolution {
  choiceId?: string;
  text: string;
  dismissed: boolean;
}

export type Resolutions = Record<string, Resolution>;

export function chooseFix(resolutions: Resolutions, findingId: string, choiceId: string): Resolutions {
  const current = resolutions[findingId];
  if (current?.choiceId === choiceId && !current.dismissed) {
    const { [findingId]: _dropped, ...rest } = resolutions;
    return rest;
  }
  return { ...resolutions, [findingId]: { choiceId, text: '', dismissed: false } };
}

export function writeOwnFix(resolutions: Resolutions, findingId: string, text: string): Resolutions {
  return { ...resolutions, [findingId]: { text, dismissed: false } };
}

export function dismissFinding(resolutions: Resolutions, findingId: string, reason: string): Resolutions {
  return { ...resolutions, [findingId]: { text: reason, dismissed: true } };
}

export function clearResolution(resolutions: Resolutions, findingId: string): Resolutions {
  const { [findingId]: _dropped, ...rest } = resolutions;
  return rest;
}

/** One click takes the first way out of every arithmetic finding still open: there is a right answer, so there is nothing to weigh. */
export function resolveArithmetic(resolutions: Resolutions, round: CheckRound): Resolutions {
  return round.findings
    .filter(finding => finding.kind === 'arithmetic' && finding.choices.length > 0 && !resolutions[finding.id])
    .reduce<Resolutions>((next, finding) => ({ ...next, [finding.id]: { choiceId: finding.choices[0]?.id, text: '', dismissed: false } }), resolutions);
}

export function openFindings(round: CheckRound, resolutions: Resolutions): CheckFinding[] {
  return round.findings.filter(finding => !resolutions[finding.id]);
}

export function checkLockIssue(round: CheckRound, resolutions: Resolutions): string | null {
  const unchecked = uncheckedSlices(round);
  if (unchecked.length > 0) return `${unchecked.join(' and ')} ${unchecked.length === 1 ? 'has' : 'have'} not been checked yet.`;
  const unanswered = round.findings.find(finding => {
    const resolution = resolutions[finding.id];
    if (!resolution) return false;
    if (resolution.dismissed) return !resolution.text.trim();
    return !resolution.choiceId && !resolution.text.trim();
  });
  if (unanswered) return `“${unanswered.title}” needs a fix, or a reason for leaving it.`;
  return null;
}

export interface CheckSelectionBody {
  resolutions: { findingId: string; choiceId?: string; text?: string; dismissed: boolean }[];
}

export function buildCheckSelection(round: CheckRound, resolutions: Resolutions): CheckSelectionBody | null {
  if (checkLockIssue(round, resolutions)) return null;
  return {
    resolutions: round.findings.flatMap(finding => {
      const resolution = resolutions[finding.id];
      if (!resolution) return [];
      const text = resolution.text.trim();
      return [{ findingId: finding.id, ...(resolution.choiceId ? { choiceId: resolution.choiceId } : {}), ...(text ? { text } : {}), dismissed: resolution.dismissed }];
    }),
  };
}
