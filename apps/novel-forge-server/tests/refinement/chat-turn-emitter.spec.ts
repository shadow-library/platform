import { describe, expect, it } from 'bun:test';

import { type ChangeSetElement } from '@modules/ai/reply-stream-scanner';
import { type ChatChangeEvent, type ChatTurnEmitter, describeStreamedChange, EmitterRelay } from '@modules/refinement/chat-turn-emitter';

type Emitted = { type: 'delta'; text: string } | { type: 'change'; event: ChatChangeEvent } | { type: 'reset' };

function recordingEmitter(emitted: Emitted[], overrides: Partial<ChatTurnEmitter> = {}): ChatTurnEmitter {
  return {
    onRunId: () => undefined,
    onUserMessage: () => undefined,
    onLookup: () => undefined,
    onDelta: text => emitted.push({ type: 'delta', text }),
    onChange: event => emitted.push({ type: 'change', event }),
    onReset: () => emitted.push({ type: 'reset' }),
    ...overrides,
  };
}

function relay(overrides: Partial<ChatTurnEmitter> = {}) {
  const emitted: Emitted[] = [];
  const errors: unknown[] = [];
  const instance = new EmitterRelay(recordingEmitter(emitted, overrides), err => errors.push(err));
  return { relay: instance, handlers: instance.streamHandlers, emitted, errors };
}

const element = (fields: Record<string, unknown>): ChangeSetElement => fields as ChangeSetElement;

describe('describeStreamedChange', () => {
  it('should label and group each op the way the progress panel lists it', () => {
    const cases: [Record<string, unknown>, string, ChatChangeEvent['group']][] = [
      [{ op: 'premise.update', premise: 'x' }, 'Premise', 'premise'],
      [{ op: 'premise.update', opposition: 'x' }, 'Opposition', 'premise'],
      [{ op: 'premise.update', brief: 'x', theme: 'y', protagonistKey: 'mara' }, 'Premise, Theme, Protagonist', 'premise'],
      [{ op: 'bible_document.upsert', section: 'world', slug: 'tide-law', frontmatter: { title: 'The Tide Law' } }, 'The Tide Law', 'pages'],
      [{ op: 'bible_document.upsert', section: 'world', slug: 'tide_law' }, 'tide law', 'pages'],
      [{ op: 'bible_document.remove', section: 'world', slug: 'old-page' }, 'old page', 'pages'],
      [{ op: 'entity.upsert', entityKey: 'mara', type: 'character', name: 'Mara' }, 'Mara', 'people'],
      [{ op: 'entity.upsert', entityKey: 'guild', type: 'faction' }, 'guild', 'people'],
      [{ op: 'entity.upsert', entityKey: 'port', type: 'location', name: 'The Port' }, 'The Port', 'places'],
      [{ op: 'entity.upsert', entityKey: 'tides', type: 'power_rule', name: 'Tide magic' }, 'Tide magic', 'power'],
      [{ op: 'entity.upsert', entityKey: 'ledger', type: 'item', name: 'Ledger' }, 'Ledger', 'other'],
      [{ op: 'entity.remove', entityKey: 'mara' }, 'mara', 'other'],
      [{ op: 'promise.create', kind: 'mystery', key: 'bell', label: 'Who rang the bell?' }, 'Who rang the bell?', 'threads'],
      [{ op: 'promise.drop', kind: 'thread', key: 'bell' }, 'bell', 'threads'],
      [{ op: 'volume.upsert', volumeKey: 'v1', title: 'Flood Season' }, 'Flood Season', 'other'],
      [{ op: 'volume.upsert', volumeKey: 'v2' }, 'Volume v2', 'other'],
      [{ op: 'milestone.upsert', milestoneKey: 'm1', label: 'Mara learns the truth' }, 'Mara learns the truth', 'other'],
      [{ op: 'brief.update', chapter: 4 }, 'Chapter 4', 'other'],
      [{ op: 'fact.upsert', factKey: 'secret-heir' }, 'secret-heir', 'other'],
      [{ op: 'action.plan_chapter' }, 'Plan the next chapter', 'other'],
      [{ op: 'action.audit_bible' }, 'action.audit_bible', 'other'],
    ];
    for (const [fields, label, group] of cases) expect(describeStreamedChange(3, element(fields))).toEqual({ index: 3, op: String(fields.op), label, group });
  });

  it('should collapse whitespace and cap a long label', () => {
    const { label } = describeStreamedChange(0, element({ op: 'entity.upsert', entityKey: 'k', type: 'character', name: `  A\n\n${'b'.repeat(300)}  ` }));
    expect(label.startsWith('A b')).toBe(true);
    expect(label).toHaveLength(120);
    expect(label.endsWith('…')).toBe(true);
  });

  it('should fall back past blank or non-string names', () => {
    expect(describeStreamedChange(0, element({ op: 'entity.upsert', entityKey: 'mara', type: 'character', name: '   ' })).label).toBe('mara');
    expect(describeStreamedChange(0, element({ op: 'bible_document.upsert', section: 'world', slug: 's', frontmatter: { title: 7 } })).label).toBe('s');
  });
});

describe('EmitterRelay', () => {
  it('should forward a change as its display event', () => {
    const { handlers, emitted } = relay();
    handlers.onChange?.({ index: 0, element: element({ op: 'entity.upsert', entityKey: 'mara', type: 'character', name: 'Mara', body: 'secret body' }) });
    expect(emitted).toEqual([{ type: 'change', event: { index: 0, op: 'entity.upsert', label: 'Mara', group: 'people' } }]);
  });

  it('should reset once when a model reset follows a change alone', () => {
    const { handlers, emitted } = relay();
    handlers.onChange?.({ index: 0, element: element({ op: 'premise.update' }) });
    handlers.onReset?.();
    handlers.onReset?.();
    expect(emitted.map(event => event.type)).toEqual(['change', 'reset']);
  });

  it('should void the superseded reply on the next round’s first change, not before', () => {
    const { relay: instance, handlers, emitted } = relay();
    handlers.onDelta('First round.');
    handlers.onChange?.({ index: 0, element: element({ op: 'premise.update' }) });
    instance.supersedeOnNextDelta();
    expect(emitted.at(-1)?.type).toBe('change');
    handlers.onChange?.({ index: 0, element: element({ op: 'entity.upsert', entityKey: 'mara', type: 'location' }) });
    expect(emitted.map(event => event.type)).toEqual(['delta', 'change', 'reset', 'change']);
    expect(emitted.at(-1)).toEqual({ type: 'change', event: { index: 0, op: 'entity.upsert', label: 'mara', group: 'places' } });
  });

  it('should supersede a round that showed only changes', () => {
    const { relay: instance, handlers, emitted } = relay();
    handlers.onChange?.({ index: 0, element: element({ op: 'premise.update' }) });
    instance.supersedeOnNextDelta();
    handlers.onDelta('Second round.');
    expect(emitted.map(event => event.type)).toEqual(['change', 'reset', 'delta']);
  });

  it('should retire after a change sink throws and keep the turn running', () => {
    const { handlers, emitted, errors } = relay({
      onChange: () => {
        throw new Error('socket closed');
      },
    });
    expect(() => handlers.onChange?.({ index: 0, element: element({ op: 'premise.update' }) })).not.toThrow();
    handlers.onDelta('never sent');
    expect(errors).toHaveLength(1);
    expect(emitted).toEqual([]);
  });
});
