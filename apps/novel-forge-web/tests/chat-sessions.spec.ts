import { describe, expect, it } from 'bun:test';

import { allChatsLabel, bySession, chatChangesSummary, chatTitle, recentChats } from '../src/lib/chat-sessions';

const sessions = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }];

describe('chatTitle', () => {
  it('should name an unnamed chat', () => {
    expect(chatTitle({ id: 'a' })).toBe('New chat');
    expect(chatTitle({ id: 'a', title: null })).toBe('New chat');
  });

  it('should use the title it was given', () => {
    expect(chatTitle({ id: 'a', title: 'The betrayal at Meridian Gate' })).toBe('The betrayal at Meridian Gate');
  });
});

describe('recentChats', () => {
  it('should cut the list at the limit', () => {
    expect(recentChats(sessions).map(s => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('should pin the open chat when it falls outside the recent few', () => {
    expect(recentChats(sessions, { id: 'f' }).map(s => s.id)).toEqual(['a', 'b', 'c', 'd', 'f']);
  });

  it('should not repeat an open chat that is already shown', () => {
    expect(recentChats(sessions, { id: 'b' }).map(s => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('should pin a chat the list does not carry at all', () => {
    expect(recentChats([{ id: 'a' }], { id: 'z' }).map(s => s.id)).toEqual(['a', 'z']);
  });

  it('should hold a shorter list whole', () => {
    expect(recentChats([{ id: 'a' }, { id: 'b' }]).map(s => s.id)).toEqual(['a', 'b']);
  });
});

describe('allChatsLabel', () => {
  it('should stay silent while the list hides nothing', () => {
    expect(allChatsLabel(4, 4)).toBeNull();
    expect(allChatsLabel(3, 4)).toBeNull();
    expect(allChatsLabel(0, 0)).toBeNull();
  });

  it('should name the whole collection once rows are hidden', () => {
    expect(allChatsLabel(14, 4)).toBe('All 14 chats');
  });

  it('should count a pinned open chat as shown', () => {
    expect(allChatsLabel(5, 5)).toBeNull();
  });

  it('should group a long count', () => {
    expect(allChatsLabel(1200, 4)).toBe('All 1,200 chats');
  });

  it('should refuse a count it cannot trust', () => {
    expect(allChatsLabel(Number.NaN, 4)).toBeNull();
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
