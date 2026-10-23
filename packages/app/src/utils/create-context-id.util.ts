export interface ContextId {
  readonly id: number;
}

export function createContextId(): ContextId {
  /** Contexts are keyed by object identity, so `id` need not be unique. */
  return { id: Math.random() };
}
