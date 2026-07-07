/**
 * Importing user defined packages
 */
import { type ToastData, type ToastIntent, type ToastOptions, type ToastPromiseMessages } from './Toast.types';

/**
 * Declaring the constants
 */
type Listener = () => void;

let toasts: ToastData[] = [];
let counter = 0;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Add a new toast, or merge into an existing one by id (used for in-place promise resolution). */
function push(intent: ToastIntent, title: ToastData['title'], options: ToastOptions = {}): string {
  const id = options.id ?? `sh-toast-${++counter}`;
  const next: ToastData = { id, intent, title, ...options };
  const existing = toasts.some(toast => toast.id === id);
  toasts = existing ? toasts.map(toast => (toast.id === id ? { ...toast, ...next } : toast)) : [...toasts, next];
  emit();
  return id;
}

function dismiss(id?: string): void {
  toasts = id == null ? [] : toasts.filter(toast => toast.id !== id);
  emit();
}

export const toastStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ToastData[] {
    return toasts;
  },
  dismiss,
};

function make(intent: ToastIntent) {
  return (title: ToastData['title'], options?: ToastOptions): string => push(intent, title, options);
}

function resolveMessage<T>(message: ToastPromiseMessages<T>['success'] | ToastPromiseMessages<T>['error'], value: T | unknown): ToastData['title'] {
  return typeof message === 'function' ? (message as (input: unknown) => ToastData['title'])(value) : message;
}

/**
 * The imperative toast API — toasts are events, not markup. Render a single `<Toaster />` at the app
 * root and call these from anywhere. `promise` tracks an async operation in one toast that resolves
 * in place.
 */
export const toast = {
  neutral: make('neutral'),
  info: make('info'),
  success: make('success'),
  warning: make('warning'),
  danger: make('danger'),
  dismiss,
  promise<T>(promise: Promise<T>, messages: ToastPromiseMessages<T>): Promise<T> {
    const id = push('info', messages.loading, { loading: true, duration: Number.POSITIVE_INFINITY });
    promise.then(
      value => push('success', resolveMessage(messages.success, value), { id, loading: false, duration: undefined }),
      error => push('danger', resolveMessage(messages.error, error), { id, loading: false, duration: Number.POSITIVE_INFINITY }),
    );
    return promise;
  },
};
