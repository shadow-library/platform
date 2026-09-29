import { type ChatTurnStreamState } from './apis/refinement.api';
import { lookupLabel } from './chat-lookup-label';

export type ChatTurnPhase =
  | { kind: 'starting' }
  | { kind: 'reading'; sources: number; settled: number; current: string }
  | { kind: 'thinking'; sinceMs: number }
  | { kind: 'writing' }
  | { kind: 'saving'; count: number }
  | { kind: 'settled' };

export interface ChatTurnSummary {
  sources: number;
  thoughtMs: number;
  workedMs: number;
}

export function turnPhase(state: ChatTurnStreamState, now: number): ChatTurnPhase {
  if (state.status !== 'idle' && state.status !== 'streaming') return { kind: 'settled' };
  const { lookups, timing } = state;
  const running = lookups.filter(lookup => lookup.status === 'running');
  const current = running.at(-1);
  if (current) return { kind: 'reading', sources: lookups.length, settled: lookups.length - running.length, current: lookupLabel(current.tool, current.args) };
  if (timing.writingSince !== null) return timing.lastWrite === 'change' ? { kind: 'saving', count: state.changes.length } : { kind: 'writing' };
  if (state.status === 'idle' && lookups.length === 0) return { kind: 'starting' };
  const since = timing.waitingSince ?? timing.startedAt ?? now;
  return { kind: 'thinking', sinceMs: Math.max(0, now - since) };
}

export function turnSummary(state: ChatTurnStreamState, now: number): ChatTurnSummary {
  const { timing } = state;
  const until = timing.endedAt ?? now;
  const stillThinking = timing.waitingSince === null ? 0 : Math.max(0, until - timing.waitingSince);
  const workedMs = timing.startedAt === null ? 0 : Math.max(0, until - timing.startedAt);
  return { sources: state.lookups.length, thoughtMs: timing.thoughtMs + stillThinking, workedMs };
}
