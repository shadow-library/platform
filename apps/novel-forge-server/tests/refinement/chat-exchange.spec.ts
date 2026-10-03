import { describe, expect, it } from 'bun:test';

import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages';

import { type Refinement } from '@server/database';

import { type ContextSection, joinSections } from '@modules/ai/context/sections';
import { contextUpdate, heldSegment, playbookDigest, replayWindow } from '@modules/refinement/chat-exchange';

function section(key: string, segment: 'stable' | 'volatile', body: string): ContextSection {
  return { key, segment, tier: 'canonical', tokens: 10, truncated: false, sourceRefs: [], rendered: `## ${key.toUpperCase()}\n\n${body}` };
}

function pack(sections: ContextSection[], omitted: string[] = []) {
  return { sections, omitted: omitted.map(key => ({ key, reason: 'budget' as const })), renderedVolatile: joinSections(sections.filter(s => s.segment === 'volatile')) };
}

function row(ordinal: number, role: 'user' | 'assistant', runId: string, exchange?: Refinement.ChatExchange): Refinement.ChatMessage {
  return { id: BigInt(ordinal), ordinal, role, runId, content: `${role} ${ordinal}`, contexts: null, question: null, exchange: exchange ?? null } as Refinement.ChatMessage;
}

const PLAYBOOK = playbookDigest('playbook');
const OPENING = { through: 0, playbook: PLAYBOOK, stableContext: 'STABLE' };

function exchange(segment: string, messages: string[], opening?: Refinement.ChatSegmentOpening): Refinement.ChatExchange {
  return {
    segment,
    ...(opening ? { opening } : {}),
    sections: { story: { digest: 'digest', heading: '## STORY' } },
    messages: messages.map((content, index) => ({ role: index % 2 === 0 ? 'user' : 'assistant', content })),
  };
}

const plain = (message: Refinement.ChatMessage): BaseMessage[] => [message.role === 'user' ? new HumanMessage(message.content) : new AIMessage(message.content)];
const shape = (messages: BaseMessage[]) => messages.map(message => `${message.getType()}: ${String(message.content)}`);

describe('contextUpdate', () => {
  const story = section('story', 'stable', 'Mara keeps the lighthouse.');
  const handoff = section('handoff', 'volatile', 'Chapter 3 is planned.');

  it('should send the whole volatile context when the segment opens, and hold every section it sent', () => {
    const update = contextUpdate(pack([story, handoff]));

    expect(update.text).toBe(handoff.rendered);
    expect(Object.keys(update.sections)).toEqual(['story', 'handoff']);
  });

  it('should say nothing changed when every section is as the conversation holds it', () => {
    const held = contextUpdate(pack([story, handoff])).sections;

    expect(contextUpdate(pack([story, handoff]), held)).toEqual({ text: 'Unchanged since the previous turn.', sections: held });
  });

  it('should send a changed stable section as a replacement, and not the sections that stayed put', () => {
    const held = contextUpdate(pack([story, handoff])).sections;
    const edited = section('story', 'stable', 'Mara sold the lighthouse.');

    const update = contextUpdate(pack([edited, handoff]), held);

    expect(update.text).toStartWith('Changed since the previous turn — each section below replaces the one of the same name earlier in this conversation:');
    expect(update.text).toContain('Mara sold the lighthouse.');
    expect(update.text).not.toContain(handoff.rendered);
    expect(update.sections['story']?.digest).not.toBe(held['story']?.digest);
  });

  it('should report a section that is gone under the heading it was sent with', () => {
    const plugin = { ...section('acme:weather', 'volatile', 'Rain all week.'), rendered: '## WEATHER\n\nRain all week.' };
    const held = contextUpdate(pack([story, handoff, plugin])).sections;

    const update = contextUpdate(pack([story, handoff]), held);

    expect(update.text).toContain('## WEATHER\n\nNothing now.');
    expect(update.sections).not.toHaveProperty('acme:weather');
  });

  it('should flag a held section the budget left out as possibly stale, and send it whole when it returns', () => {
    const progress = section('progress', 'volatile', 'The premise is set.');
    const held = contextUpdate(pack([story, handoff, progress])).sections;

    const omitted = contextUpdate(pack([story, handoff], ['progress']), held);
    const returned = contextUpdate(pack([story, handoff, progress]), omitted.sections);

    expect(omitted.text).toContain('## PROGRESS\n\nLeft out this turn for space — the earlier version may be out of date; look it up if you need it.');
    expect(omitted.sections).not.toHaveProperty('progress');
    expect(returned.text).toContain(progress.rendered);
  });

  it('should send "nothing" when a segment opens on an empty volatile context', () => {
    expect(contextUpdate(pack([story])).text).toBe('nothing');
  });
});

describe('heldSegment', () => {
  const rows = [row(1, 'user', 'r1'), row(2, 'assistant', 'r1', exchange('s1', ['turn 1'], OPENING)), row(3, 'user', 'r2'), row(4, 'assistant', 'r2', exchange('s1', ['turn 2']))];

  it('should continue the latest reply’s segment with the stable context its opening sent', () => {
    expect(heldSegment(rows, 0, PLAYBOOK)).toEqual({ id: 's1', stableContext: 'STABLE', sections: { story: { digest: 'digest', heading: '## STORY' } } });
  });

  it('should end the segment once a compaction has moved the watermark', () => {
    expect(heldSegment(rows, 2, PLAYBOOK)).toBeNull();
  });

  it('should end the segment when the playbook changed', () => {
    expect(heldSegment(rows, 0, playbookDigest('another playbook'))).toBeNull();
  });

  it('should leave nothing to continue after a reply the gateway kept no session for', () => {
    expect(heldSegment([...rows, row(5, 'user', 'r3'), row(6, 'assistant', 'r3')], 0, PLAYBOOK)).toBeNull();
  });
});

describe('replayWindow', () => {
  it('should send each segment turn as recorded, every other row as rendered, and an unanswered message where it stands', () => {
    const rows = [
      row(1, 'user', 'r0'),
      row(2, 'assistant', 'r0', exchange('old', ['old turn'], OPENING)),
      row(3, 'user', 'r1'),
      row(4, 'assistant', 'r1', exchange('s1', ['turn 1', '{"lookups":[]}', 'Lookup results: x'], OPENING)),
      row(5, 'user', 'failed'),
      row(6, 'user', 'r2'),
      row(7, 'assistant', 'r2', exchange('s1', ['turn 2'])),
    ];

    expect(shape(replayWindow(rows, 's1', plain))).toEqual([
      'human: user 1',
      'ai: assistant 2',
      'human: turn 1',
      'ai: {"lookups":[]}',
      'human: Lookup results: x',
      'ai: assistant 4',
      'human: user 5',
      'human: turn 2',
      'ai: assistant 7',
    ]);
  });
});
