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
