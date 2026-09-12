import { describe, expect, it } from 'bun:test';

import { type ProjectEvent, ProjectEventService } from '@modules/events';

const chat = (sessionId: string): ProjectEvent => ({ type: 'chat', sessionId });

describe('ProjectEventService', () => {
  it('should deliver an event only to the listeners of its project', () => {
    const events = new ProjectEventService();
    const first: ProjectEvent[] = [];
    const second: ProjectEvent[] = [];
    events.subscribe(1n, event => first.push(event));
    events.subscribe(2n, event => second.push(event));

    events.publish(1n, chat('s1'));

    expect(first).toEqual([chat('s1')]);
    expect(second).toEqual([]);
  });

  it('should stop delivering to a listener once it unsubscribes', () => {
    const events = new ProjectEventService();
    const received: ProjectEvent[] = [];
    const unsubscribe = events.subscribe(1n, event => received.push(event));

    unsubscribe();
    events.publish(1n, chat('s1'));

    expect(received).toEqual([]);
  });

  it('should keep delivering to other listeners when one of them throws', () => {
    const events = new ProjectEventService();
    const received: ProjectEvent[] = [];
    events.subscribe(1n, () => {
      throw new Error('listener broke');
    });
    events.subscribe(1n, event => received.push(event));

    expect(() => events.publish(1n, chat('s1'))).not.toThrow();
    expect(received).toEqual([chat('s1')]);
  });

  it('should keep a later subscriber when an earlier one unsubscribes again after the project emptied', () => {
    const events = new ProjectEventService();
    const unsubscribeFirst = events.subscribe(1n, () => undefined);
    unsubscribeFirst();
    const received: ProjectEvent[] = [];
    events.subscribe(1n, event => received.push(event));

    unsubscribeFirst();
    events.publish(1n, chat('s1'));

    expect(received).toEqual([chat('s1')]);
  });
});
