export interface ForwardReference<T> {
  forwardRef: () => T;
}

export type ForwardRef<T extends object> = T;

export function forwardRef<T = any>(fn: () => T): ForwardReference<T> {
  return { forwardRef: fn };
}
