export interface ChatListEntry {
  id: string;
  title?: string | null;
}

export function chatTitle(session: ChatListEntry): string {
  return session.title ?? 'New chat';
}

export function bySession<T extends { sessionId?: string | null }>(items: readonly T[], sessionId: string): T[] {
  return items.filter(item => item.sessionId === sessionId);
}

/** Names what the changes panel holds, for the collapse control that hides it. */
export function chatChangesSummary(waiting: number, changed: number): string {
  const parts: string[] = [];
  if (waiting > 0) parts.push(`${waiting} waiting`);
  if (changed > 0) parts.push(`${changed} changed`);
  return parts.length > 0 ? parts.join(', ') : 'nothing changed yet';
}

export type ChatColumnView = { kind: 'centred' } | { kind: 'conversation' };

export interface ChatColumnInput {
  messageCount: number;
  /** The transcript is on its way — hold the conversation layout so the composer never travels twice. */
  loading: boolean;
  /** A turn in flight or a streamed reply on screen: content exists before the transcript carries it. */
  active: boolean;
}

/**
 * Which of the column's two states to draw. One tree either way — the caller changes `justify-content`,
 * never the children — so the composer keeps its draft, its focus and its model across the move.
 */
export function chatColumnView({ messageCount, loading, active }: ChatColumnInput): ChatColumnView {
  return messageCount > 0 || loading || active ? { kind: 'conversation' } : { kind: 'centred' };
}

export interface ChatSearchEntry extends ChatListEntry {
  summary?: string | null;
}

/** The sessions endpoint takes no search term, so the modal filters the pages it has loaded. */
export function matchesChatQuery(session: ChatSearchEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${chatTitle(session)} ${session.summary ?? ''}`.toLowerCase().includes(needle);
}

export type ChatHistoryView = { kind: 'loading' } | { kind: 'error' } | { kind: 'rows' } | { kind: 'empty'; reason: 'no-match' | 'no-archived' | 'no-chats' };

export interface ChatHistoryInput {
  loading: boolean;
  error: boolean;
  /** Rows that survived the search, across every page loaded so far. */
  matches: number;
  query: string;
  status: 'active' | 'archived';
}

/**
 * What the history modal's body holds. Rows outrank a load in progress so fetching the next page never
 * replaces the list the reader is scrolling, and the empty reason is what lets one 680×660 frame say
 * three different things without changing size.
 */
export function chatHistoryView({ loading, error, matches, query, status }: ChatHistoryInput): ChatHistoryView {
  if (matches > 0) return { kind: 'rows' };
  if (error) return { kind: 'error' };
  if (loading) return { kind: 'loading' };
  if (query.trim()) return { kind: 'empty', reason: 'no-match' };
  return { kind: 'empty', reason: status === 'archived' ? 'no-archived' : 'no-chats' };
}
