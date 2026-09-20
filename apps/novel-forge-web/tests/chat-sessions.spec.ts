import { describe, expect, it } from 'bun:test';

import { bySession, chatChangesSummary, chatTitle } from '../src/lib/chat-sessions';

describe('chatTitle', () => {
  it('should name an unnamed chat', () => {
    expect(chatTitle({ id: 'a' })).toBe('New chat');
    expect(chatTitle({ id: 'a', title: null })).toBe('New chat');
  });

  it('should use the title it was given', () => {
    expect(chatTitle({ id: 'a', title: 'The betrayal at Meridian Gate' })).toBe('The betrayal at Meridian Gate');
  });
});

describe('bySession', () => {
  it('should keep only the rows this chat produced', () => {
    const items = [{ sessionId: 'a' }, { sessionId: 'b' }, { sessionId: null }, {}];
    expect(bySession(items, 'a')).toEqual([{ sessionId: 'a' }]);
  });

  it('should never claim a row that belongs to no chat', () => {
    expect(bySession([{ sessionId: null }, {}], 'a')).toEqual([]);
  });
});

describe('chatChangesSummary', () => {
  it('should say so when the chat has changed nothing', () => {
    expect(chatChangesSummary(0, 0)).toBe('nothing changed yet');
  });

  it('should lead with what is waiting on the author', () => {
    expect(chatChangesSummary(2, 5)).toBe('2 waiting, 5 changed');
  });

  it('should drop the half that is zero', () => {
    expect(chatChangesSummary(0, 3)).toBe('3 changed');
    expect(chatChangesSummary(1, 0)).toBe('1 waiting');
  });
});
