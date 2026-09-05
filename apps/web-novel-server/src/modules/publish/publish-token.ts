export interface PublishTokenVerdict {
  token: string | null;
  mismatch: boolean;
}

/**
 * Trust-on-first-use binding for a novel's per-project publish token: the first push carrying one binds it,
 * every later push under the same `(sourceClientId, sourceRef)` must present the same token, and a push that
 * carries none leaves an existing binding untouched (older publishers predate the token, so absence can never
 * enforce). A mismatch is fatal to the caller; it hardens the guessable `sourceRef` against targeting and is
 * not on its own a control against a publisher-side authorization gap acting on the target project directly.
 */
export function nextPublishToken(stored: string | null, incoming: string | null | undefined): PublishTokenVerdict {
  if (stored && incoming && stored !== incoming) return { token: stored, mismatch: true };
  return { token: stored ?? incoming ?? null, mismatch: false };
}
