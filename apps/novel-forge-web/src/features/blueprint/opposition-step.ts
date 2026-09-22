import { isOppositionKind, OPPOSITION_KIND_LABELS, OPPOSITION_KINDS, type OppositionKind } from '@shadow-library/sdk';

import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

import { type AnchoredLine, anchorLine, EMPTY_ANCHORED_LINE, readAnchoredLine } from './anchored-line';
import { decisionPayload, lockedDecision, passList, passStrings, passText, sameJson } from './engine-pass';

export const OPPOSITION_TOPIC = 'opposition';
export const OPPOSITION_LINE_MAX = 200;
export const OPPOSITION_NAME_MAX = 80;
export const OPPOSITION_TEXT_MAX = 600;
export const OPPOSITION_WRITER_LINE_MAX = 240;
export const OPPOSITION_WHY_MAX = 400;
export const OPPOSITION_GOALS_MAX = 5;
export const OPPOSITION_FACES_MAX = 4;

export interface OppositionFace {
  arc: string;
  face: string;
}

export interface OppositionForm {
  id: string;
  kind: OppositionKind;
  label: string;
  name: string;
  summary: string;
  argument: string;
  wants: string;
  neverWill: string;
  faces: OppositionFace[];
  goals: string[];
  rhythm: string;
  costOfWinning: string;
  stakes: string;
  returnsFor: string;
}

export interface OppositionRound {
  preselected: OppositionKind | null;
  why: string;
  forms: OppositionForm[];
}

function parseFaces(value: unknown): OppositionFace[] {
  return passList(value).map(item => {
    const face = item as Partial<OppositionFace>;
    return { arc: passText(face.arc), face: passText(face.face) };
  });
}

export function parseOppositionRound(round: BlueprintRoundResponse | null): OppositionRound {
  const options = round?.options as { preselected?: unknown; why?: unknown; forms?: unknown } | null;
  const forms = passList(options?.forms).flatMap(item => {
    const form = item as Record<string, unknown>;
    if (!isOppositionKind(form['kind']) || typeof form['id'] !== 'string') return [];
    return [
      {
        id: form['id'],
        kind: form['kind'],
        label: passText(form['label']) || OPPOSITION_KIND_LABELS[form['kind']],
        name: passText(form['name']),
        summary: passText(form['summary']),
        argument: passText(form['argument']),
        wants: passText(form['wants']),
        neverWill: passText(form['neverWill']),
        faces: parseFaces(form['faces']),
        goals: passStrings(form['goals']),
        rhythm: passText(form['rhythm']),
        costOfWinning: passText(form['costOfWinning']),
        stakes: passText(form['stakes']),
        returnsFor: passText(form['returnsFor']),
      },
    ];
  });
  return { preselected: isOppositionKind(options?.preselected) ? options.preselected : null, why: passText(options?.why), forms };
}

export interface OppositionAnswer {
  /** The form the answer came from; dropped once the author rewrites the line it stands on. */
  optionId?: string;
  name: string;
  summary: string;
  argument: string;
  wants: string;
  neverWill: string;
  faces: OppositionFace[];
  goals: string[];
  rhythm: string;
  /** What every win that feeds the protagonist's own lie costs them — the self path's price. */
  costOfWinning: string;
  stakes: string;
  returnsFor: string;
}

export const EMPTY_OPPOSITION_ANSWER: OppositionAnswer = {
  name: '',
  summary: '',
  argument: '',
  wants: '',
  neverWill: '',
  faces: [],
  goals: [],
  rhythm: '',
  costOfWinning: '',
  stakes: '',
  returnsFor: '',
};

export interface OppositionDraft {
  kind: OppositionKind | null;
  /** One answer per kind, so switching the switcher back and forth never loses what the author typed under either. */
  answers: Partial<Record<OppositionKind, OppositionAnswer>>;
  why: AnchoredLine;
  writerLine: AnchoredLine;
}

function answerFrom(form: OppositionForm): OppositionAnswer {
  const { id, kind: _kind, label: _label, ...answer } = form;
  return { optionId: id, ...answer };
}

export function editOppositionAnswer(answer: OppositionAnswer, patch: Partial<Omit<OppositionAnswer, 'optionId'>>): OppositionAnswer {
  const summary = patch.summary ?? answer.summary;
  const rewritten = summary.trim() !== answer.summary.trim();
  return { ...answer, ...patch, ...(rewritten ? { optionId: undefined } : {}) };
}

export function oppositionAnchor(kind: OppositionKind | null, answer: OppositionAnswer | undefined): string {
  return `${kind ?? ''}|${answer?.summary.trim() ?? ''}`;
}

export interface OppositionSelectionBody {
  kind: OppositionKind;
  optionId?: string;
  name?: string;
  summary: string;
  argument?: string;
  wants?: string;
  neverWill?: string;
  faces?: OppositionFace[];
  goals?: string[];
  rhythm?: string;
  costOfWinning?: string;
  stakes?: string;
  returnsFor?: string;
  why?: string;
  writerLine: string;
}

const NAMED_KINDS: readonly OppositionKind[] = ['person', 'system'];

export function buildOppositionSelection(draft: OppositionDraft): OppositionSelectionBody | null {
  const kind = draft.kind;
  const answer = kind ? draft.answers[kind] : undefined;
  if (!kind || !answer) return null;

  const summary = answer.summary.trim();
  const name = answer.name.trim();
  const goals = answer.goals.map(goal => goal.trim()).filter(Boolean);
  const faces = answer.faces.filter(face => face.arc.trim() && face.face.trim()).map(face => ({ arc: face.arc.trim(), face: face.face.trim() }));
  if (!summary || (NAMED_KINDS.includes(kind) && !name) || (kind === 'slice' && goals.length === 0) || (kind === 'self' && !answer.costOfWinning.trim())) return null;

  const anchor = oppositionAnchor(kind, answer);
  const writerLine = readAnchoredLine(draft.writerLine, anchor).text.trim();
  if (!writerLine) return null;
  const why = readAnchoredLine(draft.why, anchor).text.trim();

  return {
    kind,
    ...(answer.optionId ? { optionId: answer.optionId } : {}),
    ...(name ? { name } : {}),
    summary,
    ...(answer.argument.trim() ? { argument: answer.argument.trim() } : {}),
    ...(answer.wants.trim() ? { wants: answer.wants.trim() } : {}),
    ...(answer.neverWill.trim() ? { neverWill: answer.neverWill.trim() } : {}),
    ...(faces.length > 0 ? { faces } : {}),
    ...(goals.length > 0 ? { goals } : {}),
    ...(answer.rhythm.trim() ? { rhythm: answer.rhythm.trim() } : {}),
    ...(answer.costOfWinning.trim() ? { costOfWinning: answer.costOfWinning.trim() } : {}),
    ...(answer.stakes.trim() ? { stakes: answer.stakes.trim() } : {}),
    ...(answer.returnsFor.trim() ? { returnsFor: answer.returnsFor.trim() } : {}),
    ...(why ? { why } : {}),
    writerLine,
  };
}

/** What the Notebook already holds for this screen, read back whole so a revisit locks the answer rather than what the round offers. */
export function restoreOppositionDraft(entries: LedgerEntryResponse[]): OppositionDraft | null {
  const decided = lockedDecision(entries, OPPOSITION_TOPIC);
  const payload = decisionPayload(decided);
  const kind = payload['kind'];
  if (!decided || !isOppositionKind(kind)) return null;

  const answer: OppositionAnswer = {
    name: passText(payload['name']),
    summary: passText(payload['summary']),
    argument: passText(payload['argument']),
    wants: passText(payload['wants']),
    neverWill: passText(payload['neverWill']),
    faces: parseFaces(payload['faces']),
    goals: passStrings(payload['goals']),
    rhythm: passText(payload['rhythm']),
    costOfWinning: passText(payload['costOfWinning']),
    stakes: passText(payload['stakes']),
    returnsFor: passText(payload['returnsFor']),
  };
  const anchor = oppositionAnchor(kind, answer);
  return { kind, answers: { [kind]: answer }, why: anchorLine(decided.why ?? '', anchor), writerLine: anchorLine(decided.writerLine ?? '', anchor) };
}

/** The screen as the round hands it over: every kind filled in, so the author finds an answer already there whichever one they switch to. */
export function oppositionDraftFrom(round: OppositionRound): OppositionDraft {
  const answers = Object.fromEntries(round.forms.map(form => [form.kind, answerFrom(form)]));
  return { kind: round.preselected, answers, why: EMPTY_ANCHORED_LINE, writerLine: EMPTY_ANCHORED_LINE };
}

/**
 * What survives a new round, kind by kind: an answer the author has not touched since it was offered takes the round's new one, and
 * one they wrote or locked stays theirs. The form ids are `op_<kind>`, which the next round gives the same meaning, so nothing has to
 * be resolved again. The chosen kind and both lines are the author's throughout.
 */
export function nextOppositionDraft(current: OppositionDraft, offered: OppositionDraft, round: OppositionRound): OppositionDraft {
  const fresh = oppositionDraftFrom(round);
  const answers: Partial<Record<OppositionKind, OppositionAnswer>> = {};
  for (const kind of OPPOSITION_KINDS) {
    const answer = sameJson(current.answers[kind], offered.answers[kind]) ? fresh.answers[kind] : current.answers[kind];
    if (answer) answers[kind] = answer;
  }
  return { ...current, kind: current.kind ?? fresh.kind, answers };
}
