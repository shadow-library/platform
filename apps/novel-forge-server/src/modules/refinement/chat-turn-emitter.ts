import { type Refinement } from '@server/database';

import { type ReplyStreamHandlers } from '../ai/model-router.service';
import { type ChangeSetElement } from '../ai/reply-stream-scanner';

export interface ChatLookupEvent {
  round: number;
  tool: string;
  args: Record<string, unknown>;
  status: 'running' | 'ok' | 'error';
}

/** Where a change sits in the Story Bible progress list: people are characters and factions, threads are promises. */
export type ChatChangeGroup = 'premise' | 'pages' | 'people' | 'places' | 'power' | 'threads' | 'other';

/**
 * One change of the reply being written, sent the moment the model finishes writing it — display-only, never its body. It is provisional:
 * the turn's `done` decides what was applied or carded, and a `reset` voids every change event before it, because the reply they belonged to
 * was replaced. `index` counts the current reply's changes from 0 and restarts after each `reset`.
 */
export interface ChatChangeEvent {
  index: number;
  op: string;
  label: string;
  group: ChatChangeGroup;
}

/**
 * Progress a caller can observe while a turn runs. Its members are the events the turn itself produces — `ready`, `done` and `error`
 * belong to the transport, which knows things the turn does not — so the SSE route relays rather than translates.
 */
export interface ChatTurnEmitter {
  /** The run this turn was given, reported as soon as it exists — long before the turn settles. */
  onRunId: (runId: string) => void;
  onUserMessage: (message: Refinement.ChatMessage) => void;
  onLookup: (event: ChatLookupEvent) => void;
  onDelta: (text: string) => void;
  onChange: (event: ChatChangeEvent) => void;
  onReset: () => void;
}

const MAX_LABEL_LENGTH = 120;

const ENTITY_GROUPS: Record<string, ChatChangeGroup> = { character: 'people', faction: 'people', location: 'places', power_rule: 'power' };

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function key(value: unknown): string | undefined {
  return typeof value === 'number' ? String(value) : text(value);
}

const PREMISE_FIELDS = ['premise', 'brief', 'themes', 'instructions'] as const;
const STORY_FIELD_LABELS = {
  theme: 'Theme',
  readerPromise: 'Reader promise',
  protagonistKey: 'Protagonist',
  opposition: 'Opposition',
  endingQuestion: 'Ending question',
  ending: 'Ending',
} as const;

/** Names the story basics a premise.update sets, with "Premise" standing for the premise, brief, themes and instructions together. */
function storySubject(element: Readonly<Record<string, unknown>>): string {
  const named = Object.entries(STORY_FIELD_LABELS).flatMap(([field, name]) => (element[field] === undefined ? [] : [name]));
  const premise = PREMISE_FIELDS.some(field => element[field] !== undefined) || named.length === 0;
  return [...(premise ? ['Premise'] : []), ...named].join(', ');
}

function subject(element: ChangeSetElement): string | undefined {
  const { op } = element;
  if (op === 'premise.update') return storySubject(element);
  if (op === 'organise.rule') return 'Rule';
  if (op === 'action.plan_chapter') return 'Plan the next chapter';
  if (op === 'action.organise_notes') return 'Organise your notes';
  if (op.startsWith('volume.')) return text(element.title) ?? `Volume ${key(element.volumeKey) ?? ''}`;
  if (op.startsWith('milestone.')) return text(element.label) ?? key(element.milestoneKey);
  if (op.startsWith('promise.')) return text(element.label) ?? key(element.key);
  if (op.startsWith('brief.') || op.startsWith('draft.')) return text(element.title) ?? `Chapter ${key(element.chapter) ?? ''}`;
  if (op.startsWith('bible_document.')) {
    const frontmatter = element.frontmatter;
    const title = typeof frontmatter === 'object' && frontmatter !== null ? text((frontmatter as Record<string, unknown>).title) : undefined;
    return title ?? key(element.slug)?.replace(/[-_]/g, ' ');
  }
  return text(element.name) ?? key(element.entityKey) ?? key(element.factKey);
}

function label(element: ChangeSetElement): string {
  const value = (subject(element) ?? element.op).replace(/\s+/g, ' ').trim() || element.op;
  return value.length > MAX_LABEL_LENGTH ? `${value.slice(0, MAX_LABEL_LENGTH - 1)}…` : value;
}

function group(element: ChangeSetElement): ChatChangeGroup {
  const { op } = element;
  if (op === 'premise.update') return 'premise';
  if (op.startsWith('bible_document.')) return 'pages';
  if (op.startsWith('promise.')) return 'threads';
  if (op === 'entity.upsert' && typeof element.type === 'string') return ENTITY_GROUPS[element.type] ?? 'other';
  return 'other';
}

/** Titles an op the way the web titles its cards, so the progress list and the settled turn name a change alike. */
export function describeStreamedChange(index: number, element: ChangeSetElement): ChatChangeEvent {
  return { index, op: element.op, label: label(element), group: group(element) };
}

/**
 * Failure-isolated view of the caller's emitter. The first throw — an SSE write to a browser that has
 * already gone — retires it and the turn runs on unobserved, because the turn persists its exchange
 * whether or not anyone is still listening.
 */
export class EmitterRelay {
  private retired = false;
  private shown = false;
  private supersede = false;

  constructor(
    private readonly emitter: ChatTurnEmitter,
    private readonly onError: (err: unknown) => void,
  ) {}

  get streamHandlers(): ReplyStreamHandlers {
    return {
      onDelta: text => {
        this.show();
        this.send(() => this.emitter.onDelta(text));
      },
      onChange: ({ index, element }) => {
        this.show();
        this.send(() => this.emitter.onChange(describeStreamedChange(index, element)));
      },
      onReset: () => this.reset(),
    };
  }

  runId(runId: string): void {
    this.send(() => this.emitter.onRunId(runId));
  }

  userMessage(message: Refinement.ChatMessage): void {
    this.send(() => this.emitter.onUserMessage(message));
  }

  lookup(event: ChatLookupEvent): void {
    this.send(() => this.emitter.onLookup(event));
  }

  /**
   * A lookup round re-invokes the model for a reply that replaces the one already displayed, but the
   * replacement is only worth a blank composer once its own text or changes start arriving: a round that
   * streams nothing would otherwise leave the author staring at nothing until the turn lands.
   */
  supersedeOnNextDelta(): void {
    this.supersede = this.shown;
  }

  private show(): void {
    if (this.supersede) this.reset();
    this.shown = true;
  }

  private reset(): void {
    this.supersede = false;
    if (!this.shown) return;
    this.shown = false;
    this.send(() => this.emitter.onReset());
  }

  private send(emit: () => void): void {
    if (this.retired) return;
    try {
      emit();
    } catch (err) {
      this.retired = true;
      this.onError(err);
    }
  }
}
