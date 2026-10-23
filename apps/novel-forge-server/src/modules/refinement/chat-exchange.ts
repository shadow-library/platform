import { createHash } from 'node:crypto';

import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages';

import { type Refinement } from '@server/database';

import { type AssembledPack, type ContextSection, SECTION_SEPARATOR } from '../ai/context/sections';

/** The conversation segment a turn continues: what its opening sent, and the context sections the conversation already holds. */
export interface ChatSegment {
  id: string;
  stableContext: string;
  sections: Readonly<Record<string, Refinement.ChatHeldSection>>;
}

export interface ContextUpdate {
  /** What the turn's message says of where the story stands. */
  text: string;
  /** Every section the conversation holds once the turn is sent. */
  sections: Record<string, Refinement.ChatHeldSection>;
}

const UNCHANGED = 'Unchanged since the previous turn.';
const CHANGED = 'Changed since the previous turn — each section below replaces the one of the same name earlier in this conversation:';
const GONE = 'Nothing now.';
const LEFT_OUT = 'Left out this turn for space — the earlier version may be out of date; look it up if you need it.';

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function playbookDigest(scopeInstructions: string): string {
  return digest(scopeInstructions);
}

function held(section: Pick<ContextSection, 'rendered'>): Refinement.ChatHeldSection {
  return { digest: digest(section.rendered), heading: section.rendered.split('\n', 1)[0] ?? '' };
}

/** The opening turn sends the whole volatile context, later turns only changed sections; a section the budget left out is flagged stale and sent whole on return. */
export function contextUpdate(
  pack: Pick<AssembledPack, 'sections' | 'omitted' | 'renderedVolatile'>,
  holding?: Readonly<Record<string, Refinement.ChatHeldSection>>,
): ContextUpdate {
  const sections = Object.fromEntries(pack.sections.map(section => [section.key, held(section)]));
  if (!holding) return { text: pack.renderedVolatile || 'nothing', sections };

  const omitted = new Set(pack.omitted.map(section => section.key));
  const changed = pack.sections.filter(section => holding[section.key]?.digest !== sections[section.key]?.digest).map(section => section.rendered);
  const dropped = Object.entries(holding)
    .filter(([key]) => !(key in sections))
    .map(([key, section]) => `${section.heading}\n\n${omitted.has(key) ? LEFT_OUT : GONE}`);
  if (changed.length === 0 && dropped.length === 0) return { text: UNCHANGED, sections };
  return { text: `${CHANGED}\n\n${[...changed, ...dropped].join(SECTION_SEPARATOR)}`, sections };
}

/** The segment the latest reply belongs to while it can be continued: no compaction since, same playbook, and the reply has an exchange. */
export function heldSegment(rows: readonly Refinement.ChatMessage[], through: number, playbook: string): ChatSegment | null {
  const latest = rows.filter(row => row.role === 'assistant').at(-1)?.exchange;
  if (!latest) return null;
  const opening = rows.find(row => row.exchange?.segment === latest.segment && row.exchange.opening)?.exchange?.opening;
  if (!opening || opening.through !== through || opening.playbook !== playbook) return null;
  return { id: latest.segment, stableContext: opening.stableContext, sections: latest.sections };
}

/** The window as the segment's turns sent it; a turn's own message carries the author's, so the author's row is not sent again. */
export function replayWindow(rows: readonly Refinement.ChatMessage[], segment: string, render: (row: Refinement.ChatMessage) => BaseMessage[]): BaseMessage[] {
  const replayed = new Set(rows.flatMap(row => (row.role === 'assistant' && row.runId && row.exchange?.segment === segment ? [row.runId] : [])));
  return rows.flatMap(row => {
    if (row.role === 'user') return row.runId && replayed.has(row.runId) ? [] : render(row);
    if (row.exchange?.segment !== segment) return render(row);
    return [...row.exchange.messages.map(toBaseMessage), ...render(row)];
  });
}

export function toExchangeMessage(message: BaseMessage): Refinement.ChatExchangeMessage {
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
  return { role: message.getType() === 'ai' ? 'assistant' : 'user', content };
}

function toBaseMessage(message: Refinement.ChatExchangeMessage): BaseMessage {
  return message.role === 'assistant' ? new AIMessage(message.content) : new HumanMessage(message.content);
}
