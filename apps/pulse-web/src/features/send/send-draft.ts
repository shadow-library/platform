import { apiClient } from '@/lib/apis/transport';

export interface SendDraft {
  templateKey: string;
  email: string;
  phone: string;
  push: string;
  payload: string;
  locale: string;
  service: string;
}

export const EMPTY_SEND_DRAFT: SendDraft = { templateKey: '', email: '', phone: '', push: '', payload: '', locale: '', service: '' };

const DRAFT_KEY = 'pulse.send-draft';
const SEND_PATH = '/send';

function sessionStore(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

function isSendDraft(value: unknown): value is SendDraft {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(EMPTY_SEND_DRAFT).every(field => typeof record[field] === 'string');
}

/** The console send is an XHR, so the guard answers IAM_003 instead of bouncing; the page walks into the step-up prompt itself. */
export function consoleSendStepUpUrl(): string {
  return `${apiClient.auth.basePath}/step-up?return_to=${encodeURIComponent(SEND_PATH)}`;
}

/** Holds the form, recipients and payload included, across the step-up round trip only: the page clears it once restored. */
export function stashSendDraft(draft: SendDraft, storage: Storage | undefined = sessionStore()): void {
  try {
    storage?.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    return;
  }
}

/** Reads without removing, so a render that React repeats (StrictMode) sees the same draft; {@link clearSendDraft} removes it. */
export function readSendDraft(storage: Storage | undefined = sessionStore()): SendDraft | null {
  try {
    const stored = storage?.getItem(DRAFT_KEY) ?? null;
    if (stored === null) return null;
    const draft: unknown = JSON.parse(stored);
    return isSendDraft(draft) ? draft : null;
  } catch {
    return null;
  }
}

export function clearSendDraft(storage: Storage | undefined = sessionStore()): void {
  try {
    storage?.removeItem(DRAFT_KEY);
  } catch {
    return;
  }
}
