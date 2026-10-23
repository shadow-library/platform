export interface PublishTokenVerdict {
  token: string | null;
  mismatch: boolean;
}

/** Trust-on-first-use: the first token binds, later pushes must match it, and an absent token never enforces because older publishers predate it. */
export function nextPublishToken(stored: string | null, incoming: string | null | undefined): PublishTokenVerdict {
  if (stored && incoming && stored !== incoming) return { token: stored, mismatch: true };
  return { token: stored ?? incoming ?? null, mismatch: false };
}
