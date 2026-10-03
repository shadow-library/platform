import { type Refinement } from '@server/database';

import { type ReplyStreamHandlers } from '../ai/model-router.service';

type TraceArgKey = keyof Refinement.ChatTraceArgs;

export type ChatTraceStatus = Refinement.ChatTraceSource['status'];

export const CHAT_TRACE_STATUSES = ['ok', 'error'] as const satisfies readonly ChatTraceStatus[];

const ARG_KINDS: Record<TraceArgKey, 'text' | 'count'> = {
  slug: 'text',
  section: 'text',
  chapter: 'count',
  from: 'count',
  to: 'count',
  part: 'count',
  status: 'text',
  entityKey: 'text',
  volumeKey: 'text',
  category: 'text',
  query: 'text',
  url: 'text',
};

/** Mirrors the keys the web's `lookupLabel` reads per tool, so a reloaded turn names its sources as the live one did. */
const TRACE_ARGS: Record<string, readonly TraceArgKey[]> = {
  get_bible_document: ['slug', 'section'],
  get_brief: ['chapter'],
  get_draft: ['chapter'],
  get_review: ['chapter'],
  get_notes: ['from', 'part', 'query'],
  get_chapter_summaries: ['from', 'to'],
  get_plot_threads: ['status'],
  get_character_timeline: ['entityKey'],
  get_entity: ['entityKey'],
  get_volume: ['volumeKey'],
  get_world_facts: ['category'],
  search_lore: ['query'],
  search_prose: ['query'],
  search_web: ['query'],
  fetch_page: ['url'],
};

// The web cuts a query at the same length and appends the same ellipsis, so a clipped query labels exactly as the unclipped one did live.
const QUERY_LIMIT = 40;
const TEXT_LIMIT = 120;
const TOOL_LIMIT = 64;
const MAX_SOURCES = 64;

function clipped(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit).trimEnd()}…` : value;
}

function traceArg(key: TraceArgKey, value: unknown): string | number | undefined {
  if (ARG_KINDS[key] === 'count') return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return clipped(value.trim(), key === 'query' ? QUERY_LIMIT : TEXT_LIMIT);
}

export function traceArgs(tool: string, args: Record<string, unknown>): Refinement.ChatTraceArgs {
  const keys = Object.hasOwn(TRACE_ARGS, tool) ? (TRACE_ARGS[tool] ?? []) : [];
  const picked: Partial<Record<TraceArgKey, string | number>> = {};
  for (const key of keys) {
    const value = traceArg(key, Object.hasOwn(args, key) ? args[key] : undefined);
    if (value !== undefined) picked[key] = value;
  }
  return picked as Refinement.ChatTraceArgs;
}

const elapsed = (ms: number): number => Math.max(0, Math.round(ms));

/** Lives on the turn's call stack because the sync route never builds `EmitterRelay`; replays the web turn reducer's clock. */
export class TurnTraceCollector {
  private readonly sources = new Map<string, Refinement.ChatTraceSource>();
  private readonly startedAt: number;
  private running = 0;
  private waitingSince: number | null;
  private writingSince: number | null = null;
  private thoughtMs = 0;
  private replyAt: number | null = null;
  private changeAt: number | null = null;
  private written = false;
  private supersede = false;

  constructor(private readonly now: () => number = () => performance.now()) {
    this.startedAt = now();
    this.waitingSince = this.startedAt;
  }

  observe(handlers: ReplyStreamHandlers): ReplyStreamHandlers {
    return {
      onDelta: text => {
        this.wrote('reply');
        handlers.onDelta(text);
      },
      onChange: change => {
        this.wrote('change');
        handlers.onChange?.(change);
      },
      onReset: () => {
        this.reset();
        handlers.onReset?.();
      },
    };
  }

  lookupStarted(): void {
    this.running++;
    this.paused();
  }

  lookupSettled(tool: string, args: Record<string, unknown>, status: ChatTraceStatus): void {
    this.running = Math.max(0, this.running - 1);
    this.paused();
    const source: Refinement.ChatTraceSource = { tool: clipped(tool, TOOL_LIMIT), args: traceArgs(tool, args), status };
    const key = `${source.tool}\u0000${JSON.stringify(source.args)}`;
    if (!this.sources.has(key) && this.sources.size >= MAX_SOURCES) return;
    this.sources.set(key, source);
  }

  /** The model is asked again for a reply that replaces the current one, which is void once the replacement writes anything. */
  supersedeOnNextWrite(): void {
    this.supersede = this.written;
  }

  finish(): Refinement.ChatTurnTrace {
    const end = this.now();
    const thinkMs = this.thoughtMs + (this.waitingSince === null ? 0 : Math.max(0, end - this.waitingSince));
    const wrote = [this.replyAt, this.changeAt].filter((at): at is number => at !== null);
    const firstWrite = wrote.length > 0 ? Math.min(...wrote) : end;
    const timing: Refinement.ChatTraceTiming = { readMs: elapsed(firstWrite - this.startedAt - thinkMs), thinkMs: elapsed(thinkMs), workedMs: elapsed(end - this.startedAt) };
    if (this.replyAt !== null) timing.writeMs = elapsed((this.changeAt ?? end) - this.replyAt);
    if (this.changeAt !== null) timing.saveMs = elapsed(end - this.changeAt);
    return { sources: [...this.sources.values()], timing };
  }

  private paused(): void {
    this.writingSince = null;
    this.waitingSince = this.running > 0 ? null : (this.waitingSince ?? this.now());
  }

  private wrote(kind: 'reply' | 'change'): void {
    if (this.supersede) this.reset();
    this.written = true;
    const at = this.now();
    if (kind === 'reply') this.replyAt ??= at;
    else this.changeAt ??= at;
    if (this.writingSince !== null) return;
    if (this.waitingSince !== null) this.thoughtMs += Math.max(0, at - this.waitingSince);
    this.waitingSince = null;
    this.writingSince = at;
  }

  private reset(): void {
    this.supersede = false;
    if (!this.written) return;
    this.written = false;
    this.paused();
    this.replyAt = null;
    this.changeAt = null;
  }
}
