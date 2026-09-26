/**
 * Hands the Start dialog's opening message to the chat that opens next. Session storage lets it survive a reload
 * before the chat mounts, and taking it deletes it, so it is never sent twice. Only the short opener travels — the
 * notes themselves are already stored server-side. Memory stands in where storage is unavailable (SSR, blocked storage).
 */
const KEY_PREFIX = 'nf.pending-first-turn.';
const memory = new Map<string, string>();

function sessionStore(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export function queuePendingFirstTurn(sessionId: string, content: string): void {
  try {
    const store = sessionStore();
    if (store) return store.setItem(KEY_PREFIX + sessionId, content);
  } catch {
    // Quota or privacy mode: fall through to memory.
  }
  memory.set(sessionId, content);
}

function takeStored(sessionId: string): string | undefined {
  try {
    const store = sessionStore();
    const stored = store?.getItem(KEY_PREFIX + sessionId) ?? undefined;
    store?.removeItem(KEY_PREFIX + sessionId);
    return stored;
  } catch {
    return undefined;
  }
}

export function takePendingFirstTurn(sessionId: string): string | undefined {
  const stored = takeStored(sessionId);
  const remembered = memory.get(sessionId);
  memory.delete(sessionId);
  return stored ?? remembered;
}
