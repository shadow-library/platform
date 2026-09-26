import { type CharacterEventResponse } from './apis/api-types.gen';

export type TimelineEvent = Pick<CharacterEventResponse, 'id' | 'chapter' | 'kind' | 'before' | 'after' | 'status'>;

export interface TimelineRow {
  chapter: number;
  lines: string[];
  provisional: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((item): item is string => item !== undefined) : [];
}

function sentence(value: string): string {
  const capital = `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  return /[.!?…]$/.test(capital) ? capital : `${capital}.`;
}

function stateLines(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const location = text(after['location']);
  if (location && location !== text(before['location'])) lines.push(`Now at ${location}.`);
  const earlier = new Set(list(before['conditions']));
  const conditions = list(after['conditions']).filter(condition => !earlier.has(condition));
  if (conditions.length > 0) lines.push(sentence(conditions.join('; ')));
  const goal = text(after['immediateGoal']);
  if (goal && goal !== text(before['immediateGoal'])) lines.push(`Wants now: ${goal.replace(/[.]$/, '')}.`);
  const note = text(after['statusNote']);
  if (note && note !== text(before['statusNote'])) lines.push(sentence(note));
  return lines;
}

function relationshipLine(before: Record<string, unknown>, after: Record<string, unknown>, names: ReadonlyMap<string, string>): string | undefined {
  const target = text(after['targetKey']);
  if (!target) return undefined;
  const name = names.get(target) ?? target;
  const kind = text(after['kind'])?.replace(/_/g, ' ');
  const note = text(after['note']);
  const head = `${text(before['targetKey']) ? 'With' : 'New tie to'} ${name}${kind ? ` (${kind})` : ''}`;
  return note ? `${head}: ${note.replace(/[.]$/, '')}.` : `${head}.`;
}

/** One event's change as reader-facing lines; a shape this page does not know yet, or a mere appearance, yields nothing rather than raw JSON. */
export function describeEvent(event: TimelineEvent, names: ReadonlyMap<string, string>): string[] {
  const before = record(event.before);
  const after = record(event.after);
  if (event.kind === 'appearance') return [];
  if (event.kind === 'relationship') {
    const line = relationshipLine(before, after, names);
    return line ? [line] : [];
  }
  return stateLines(before, after);
}

/** Newest chapter first; one row per chapter, provisional while any of its events still waits on finalize. Only the first appearance is a change worth a line. */
export function timelineRows(events: readonly TimelineEvent[], names: ReadonlyMap<string, string>): TimelineRow[] {
  const byChapter = new Map<number, TimelineRow>();
  const firstAppearance = Math.min(...events.filter(event => event.kind === 'appearance').map(event => event.chapter));
  for (const event of events) {
    const lines = event.kind === 'appearance' && event.chapter === firstAppearance ? ['First appears.'] : describeEvent(event, names);
    if (lines.length === 0) continue;
    const row = byChapter.get(event.chapter) ?? { chapter: event.chapter, lines: [], provisional: false };
    for (const line of lines) if (!row.lines.includes(line)) row.lines.push(line);
    row.provisional ||= event.status === 'provisional';
    byChapter.set(event.chapter, row);
  }
  return [...byChapter.values()].sort((a, b) => b.chapter - a.chapter);
}
