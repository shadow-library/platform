import { formatCount } from './collection-page';

/** How many conversations the sidebar shows before it hands over to the directory. */
export const RECENT_CHAT_LIMIT = 4;

export interface ChatListEntry {
  id: string;
  title?: string | null;
}

export function chatTitle(session: ChatListEntry): string {
  return session.title ?? 'New chat';
}

/** The nav's rows: the most recent few, plus the open chat wherever it actually sits, so the sidebar always says where you are. */
export function recentChats<T extends ChatListEntry>(sessions: readonly T[], open?: T, limit: number = RECENT_CHAT_LIMIT): T[] {
  const recent = sessions.slice(0, limit);
  if (!open || recent.some(session => session.id === open.id)) return recent;
  return [...recent, open];
}

/** Null until the list is actually hiding something — a link to a directory of what is already on screen is noise. */
export function allChatsLabel(total: number, shown: number): string | null {
  if (!Number.isFinite(total) || total <= shown) return null;
  return `All ${formatCount(total)} chats`;
}

/** The chat the URL has open, narrowed out of the router's loosely-typed search. The `new` and `all` sentinels name no session, and no session id can spell them. */
export function openChatId(search: unknown): string | undefined {
  if (typeof search !== 'object' || search === null) return undefined;
  const value = (search as Record<string, unknown>).session;
  return typeof value === 'string' && value !== '' && value !== 'new' && value !== 'all' ? value : undefined;
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
