import { type BlueprintFeedbackVerdict, type BlueprintOptionFeedbackBody, type BlueprintRoundResponse, type StartBlueprintRoundBody } from '@/lib/apis';

export interface SteerDraft {
  text: string;
  nudges: string[];
  keepAsDirection: boolean;
}

export const EMPTY_STEER: SteerDraft = { text: '', nudges: [], keepAsDirection: false };

export interface OptionVerdict {
  verdict: BlueprintFeedbackVerdict;
  reason?: string;
}

export type OptionVerdicts = Record<string, OptionVerdict>;

export function toggleNudge(nudges: string[], nudge: string): string[] {
  return nudges.includes(nudge) ? nudges.filter(candidate => candidate !== nudge) : [...nudges, nudge];
}

export function toFeedbackBody(verdicts: OptionVerdicts): BlueprintOptionFeedbackBody[] {
  return Object.entries(verdicts).map(([optionId, { verdict, reason }]) => {
    const trimmed = reason?.trim();
    return trimmed ? { optionId, verdict, reason: trimmed } : { optionId, verdict };
  });
}

/**
 * A step's own input and selection are typed per step, but the endpoints take a free-form object — each
 * step validates its own shape server-side. This is the one place the two meet, so a step never has to
 * cast at its call site.
 */
export function stepPayload(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

/**
 * The body a round starts with. Empty parts are omitted rather than sent blank, and "keep as a direction"
 * only rides a steer that has words in it — a kept nothing would write an empty direction every later step
 * then reads.
 */
export function buildRoundBody(draft: SteerDraft, verdicts: OptionVerdicts = {}, input?: Record<string, unknown>): StartBlueprintRoundBody {
  const steer = draft.text.trim();
  const nudges = [...new Set(draft.nudges.map(nudge => nudge.trim()).filter(Boolean))];
  const feedback = toFeedbackBody(verdicts);
  return {
    ...(steer ? { steer } : {}),
    ...(nudges.length > 0 ? { nudges } : {}),
    ...(steer && draft.keepAsDirection ? { keepAsDirection: true } : {}),
    ...(feedback.length > 0 ? { feedback } : {}),
    ...(input ? { input } : {}),
  };
}

export interface SteerMessage {
  who: 'you' | 'coach';
  text: string;
}

/** The thread a step shows once it has been steered: what the author asked for last, and what the coach answered. */
export function roundThread(round: BlueprintRoundResponse | null): SteerMessage[] {
  if (!round) return [];
  const asked = [round.steer?.trim(), ...round.nudges].filter((line): line is string => Boolean(line)).join(' · ');
  const messages: SteerMessage[] = [];
  if (asked) messages.push({ who: 'you', text: asked });
  const coach = round.coachMessage?.trim();
  if (coach) messages.push({ who: 'coach', text: coach });
  return messages;
}
