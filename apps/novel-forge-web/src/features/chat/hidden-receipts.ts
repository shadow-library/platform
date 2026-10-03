const KEY = 'nf.chat-hidden-bible-receipts';

function store(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

/** The Story Bible receipts this tab hid: per viewer and per session, since the server lists a receipt for a day whoever has seen it. */
export function hiddenReceipts(): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(store()?.getItem(KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function hideReceipt(reviewId: string): ReadonlySet<string> {
  const hidden = new Set([...hiddenReceipts(), reviewId]);
  try {
    store()?.setItem(KEY, JSON.stringify([...hidden]));
  } catch {
    // Storage full or blocked: the receipt stays hidden in memory for this mount.
  }
  return hidden;
}
