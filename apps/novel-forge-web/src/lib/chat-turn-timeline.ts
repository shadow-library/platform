import { type ChatTurnTraceResponse } from './apis/api-types.gen';
import { type ChatTurnLookup, type ChatTurnStreamState } from './apis/refinement.api';
import { GENERIC_LOOKUP_LABEL, lookupLabel } from './chat-lookup-label';
import { type ChatTurnPhase, turnPhase, turnSummary } from './chat-turn-phase';
import { formatElapsed } from './format';

export type TurnMode = 'auto' | 'manual';

export interface TurnSource {
  key: string;
  tool: string;
  label: string;
  status: ChatTurnLookup['status'];
}

/** A row with sources is a disclosure over them; one without is a plain line. */
export interface TurnRow {
  key: 'read' | 'think' | 'save';
  label: string;
  running: boolean;
  sources: TurnSource[];
}

export type TurnTail = { kind: 'starting'; slow: boolean } | { kind: 'working'; elapsed: string; slow: boolean };

export interface TurnTimeline {
  live: boolean;
  /** What happened before the reply: reading, then thinking. */
  trace: TurnRow[];
  /** What happens after it: the changes being written. */
  saving: TurnRow | null;
  tail: TurnTail | null;
  worked: string | null;
}

type Noun = string | readonly [string, string];

const SOURCE_NOUNS: Record<string, Noun> = {
  get_notes: 'your notes',
  get_bible_document: ['Bible page', 'Bible pages'],
  get_entity: ['profile', 'profiles'],
  get_character_timeline: ['character timeline', 'character timelines'],
  get_draft: ['draft', 'drafts'],
  get_brief: ['chapter plan', 'chapter plans'],
  get_review: ['review', 'reviews'],
  get_chapter_summaries: 'chapter summaries',
  get_canon_facts: 'canon facts',
  get_world_facts: 'world facts',
  get_plot_threads: 'plot threads',
  get_volume: ['volume plan', 'volume plans'],
  get_usage: 'usage figures',
  search_lore: ['lore search', 'lore searches'],
  search_prose: ['prose search', 'prose searches'],
};

// Past this the wait is worth naming: the median turn lands well inside it, so the copy switching is
// itself the signal that this one is unusual.
export const SLOW_TURN_MS = 45_000;
export const SLOW_TURN_NOTE = 'This one’s taking longer than usual. The model is still answering.';

const OTHER_SOURCE: Noun = ['other source', 'other sources'];
const MAX_NAMED_GROUPS = 3;
const MIN_THOUGHT_MS = 1000;

const SAVING: Record<TurnMode, string> = { auto: 'Saving to your Story Bible', manual: 'Preparing suggestions' };

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function listed(parts: string[]): string {
  return parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

type SourceEntry = Pick<ChatTurnLookup, 'tool' | 'args' | 'status'>;

/** One entry per distinct lookup: a later round asking the same thing again is the same source, at its latest status. */
export function turnSources(lookups: readonly SourceEntry[]): TurnSource[] {
  const sources = new Map<string, TurnSource>();
  for (const lookup of lookups) {
    const key = `${lookup.tool}\u0000${JSON.stringify(lookup.args)}`;
    sources.set(key, { key, tool: lookup.tool, label: lookupLabel(lookup.tool, lookup.args), status: lookup.status });
  }
  return [...sources.values()];
}

// A Bible page's label is its own title, so its case is the author's; every other label opens on a fixed phrase.
export function readingLabel(lookup: Pick<ChatTurnLookup, 'tool' | 'args'>): string {
  const label = lookupLabel(lookup.tool, lookup.args);
  if (label === GENERIC_LOOKUP_LABEL) return 'Looking something up…';
  if (label.startsWith('Searched ')) return `Searching ${label.slice('Searched '.length)}…`;
  return `Reading ${lookup.tool === 'get_bible_document' ? label : lowerFirst(label)}…`;
}

export function readSummary(lookups: readonly SourceEntry[]): string {
  const sources = turnSources(lookups);
  const read = sources.filter(source => source.status !== 'error');
  const failed = sources.length - read.length;
  if (read.length === 0) return `Couldn’t read ${plural(failed, 'source', 'sources')}`;
  const groups = new Map<Noun, number>();
  for (const source of read) {
    const noun = SOURCE_NOUNS[source.tool] ?? OTHER_SOURCE;
    groups.set(noun, (groups.get(noun) ?? 0) + 1);
  }
  const named = [...groups].map(([noun, count]) => (typeof noun === 'string' ? noun : plural(count, noun[0], noun[1])));
  const summary = named.length > MAX_NAMED_GROUPS ? `Read ${plural(read.length, 'source', 'sources')}` : `Read ${listed(named)}`;
  return failed > 0 ? `${summary} · ${failed} couldn’t be read` : summary;
}

function readRow(lookups: readonly SourceEntry[], live: boolean): TurnRow {
  const current = live ? lookups.filter(lookup => lookup.status === 'running').at(-1) : undefined;
  return { key: 'read', label: current ? readingLabel(current) : readSummary(lookups), running: Boolean(current), sources: turnSources(lookups) };
}

function thinkRow(phase: ChatTurnPhase, thoughtMs: number): TurnRow | null {
  if (phase.kind === 'thinking') return { key: 'think', label: 'Thinking', running: true, sources: [] };
  if (phase.kind === 'starting' || thoughtMs < MIN_THOUGHT_MS) return null;
  return { key: 'think', label: `Thought for ${formatElapsed(thoughtMs)}`, running: false, sources: [] };
}

// Streamed changes are provisional — a reset voids them and only the settled turn says what was applied or carded — so the row never
// claims them in the past tense, and is gone once the turn ends.
function savingRow(state: ChatTurnStreamState, phase: ChatTurnPhase, mode: TurnMode, live: boolean): TurnRow | null {
  if (!live || state.changes.length === 0) return null;
  return { key: 'save', label: `${SAVING[mode]} · ${state.changes.length}`, running: phase.kind === 'saving', sources: [] };
}

function workedLabel(ending: 'done' | 'stopped', workedMs: number, lookups: readonly SourceEntry[]): string {
  const read = turnSources(lookups).filter(source => source.status !== 'error').length;
  const lead = ending === 'done' ? `Worked ${formatElapsed(workedMs)}` : `Stopped after ${formatElapsed(workedMs)}`;
  return read > 0 ? `${lead} · read ${plural(read, 'source', 'sources')}` : lead;
}

function traceRows(lookups: readonly SourceEntry[], live: boolean, think: TurnRow | null): TurnRow[] {
  return [...(lookups.length > 0 ? [readRow(lookups, live)] : []), ...(think ? [think] : [])];
}

export function timelineOfTrace(trace: ChatTurnTraceResponse): TurnTimeline {
  const { timing, sources } = trace;
  const rows = traceRows(sources, false, thinkRow({ kind: 'settled' }, timing.thinkMs));
  return { live: false, trace: rows, saving: null, tail: null, worked: workedLabel('done', timing.workedMs, sources) };
}

// Drawn from the saved trace so the transcript refetch that swaps in the saved reply changes nothing.
export function turnTimeline(state: ChatTurnStreamState, now: number, mode: TurnMode): TurnTimeline {
  if (state.status === 'done' && state.turn.assistantMessage.trace) return timelineOfTrace(state.turn.assistantMessage.trace);
  const live = state.status === 'idle' || state.status === 'streaming';
  const phase = turnPhase(state, now);
  const { thoughtMs, workedMs } = turnSummary(state, now);
  const trace = traceRows(state.lookups, live, thinkRow(phase, thoughtMs));
  const slow = workedMs >= SLOW_TURN_MS;
  const tail: TurnTail | null = !live ? null : phase.kind === 'starting' ? { kind: 'starting', slow } : { kind: 'working', elapsed: formatElapsed(workedMs), slow };
  const worked = state.status === 'done' || state.status === 'stopped' ? workedLabel(state.status, workedMs, state.lookups) : null;
  return { live, trace, saving: savingRow(state, phase, mode, live), tail, worked };
}
