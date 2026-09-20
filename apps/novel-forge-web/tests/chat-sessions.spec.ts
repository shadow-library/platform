import { describe, expect, it } from 'bun:test';

import { bySession, chatChangesSummary, chatColumnView, chatHistoryView, chatTitle, matchesChatQuery } from '../src/lib/chat-sessions';

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

describe('chatColumnView', () => {
  it('should centre a chat that has nothing in it yet', () => {
    expect(chatColumnView({ messageCount: 0, loading: false, active: false })).toEqual({ kind: 'centred' });
  });

  it('should hold the conversation layout while the transcript is loading, so the composer never travels twice', () => {
    expect(chatColumnView({ messageCount: 0, loading: true, active: false })).toEqual({ kind: 'conversation' });
  });

  it('should leave the centre the moment a turn starts, before the transcript carries it', () => {
    expect(chatColumnView({ messageCount: 0, loading: false, active: true })).toEqual({ kind: 'conversation' });
  });

  it('should stay in conversation once the transcript has a message', () => {
    expect(chatColumnView({ messageCount: 2, loading: false, active: false })).toEqual({ kind: 'conversation' });
  });
});

describe('matchesChatQuery', () => {
  const session = { id: 'a', title: 'The betrayal at Meridian Gate', summary: 'Rewrote chapter four' };

  it('should keep every row when nothing is typed', () => {
    expect(matchesChatQuery(session, '')).toBe(true);
    expect(matchesChatQuery(session, '   ')).toBe(true);
  });

  it('should match the title and the summary, ignoring case', () => {
    expect(matchesChatQuery(session, 'MERIDIAN')).toBe(true);
    expect(matchesChatQuery(session, 'chapter four')).toBe(true);
  });

  it('should search the placeholder name an unnamed chat is shown under', () => {
    expect(matchesChatQuery({ id: 'a' }, 'new chat')).toBe(true);
  });

  it('should reject a term in neither field', () => {
    expect(matchesChatQuery(session, 'dragons')).toBe(false);
  });
});

describe('chatHistoryView', () => {
  const base = { loading: false, error: false, matches: 0, query: '', status: 'active' as const };

  it('should keep the rows on screen while the next page is fetched', () => {
    expect(chatHistoryView({ ...base, matches: 12, loading: true })).toEqual({ kind: 'rows' });
  });

  it('should report an error only when it has no rows to show instead', () => {
    expect(chatHistoryView({ ...base, error: true })).toEqual({ kind: 'error' });
    expect(chatHistoryView({ ...base, error: true, matches: 3 })).toEqual({ kind: 'rows' });
  });

  it('should distinguish a search that matched nothing from a project with no chats', () => {
    expect(chatHistoryView({ ...base, query: 'dragons' })).toEqual({ kind: 'empty', reason: 'no-match' });
    expect(chatHistoryView(base)).toEqual({ kind: 'empty', reason: 'no-chats' });
  });

  it('should name the archive when the archive is what is empty', () => {
    expect(chatHistoryView({ ...base, status: 'archived' })).toEqual({ kind: 'empty', reason: 'no-archived' });
  });
});
