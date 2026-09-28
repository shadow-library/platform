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

interface StashedDraft {
  draft: SendDraft;
  stashedAt: number;
}

const DRAFT_KEY = 'pulse.send-draft';
const DRAFT_TTL_MS = 10 * 60 * 1000;
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

function isStashedDraft(value: unknown): value is StashedDraft {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['stashedAt'] === 'number' && isSendDraft(record['draft']);
}

/** The console send is an XHR, so the guard answers IAM_003 instead of bouncing; the page walks into the step-up prompt itself. */
export function consoleSendStepUpUrl(): string {
  return `${apiClient.auth.basePath}/step-up?return_to=${encodeURIComponent(SEND_PATH)}`;
}

/**
 * Holds the form, recipients and payload included, across the step-up round trip only: the page clears it once restored, and a draft
 * older than ten minutes is treated as an abandoned step-up and dropped rather than kept for the tab's lifetime.
 */
export function stashSendDraft(draft: SendDraft, storage: Storage | undefined = sessionStore()): void {
  try {
    const stashed: StashedDraft = { draft, stashedAt: Date.now() };
    storage?.setItem(DRAFT_KEY, JSON.stringify(stashed));
  } catch {
    return;
  }
}

/** Leaves a live draft in place, so a render that React repeats (StrictMode) sees it too; {@link clearSendDraft} removes it. Expired or malformed ones are dropped. */
export function readSendDraft(storage: Storage | undefined = sessionStore()): SendDraft | null {
  try {
    const stored = storage?.getItem(DRAFT_KEY) ?? null;
    if (stored === null) return null;
    const stashed: unknown = JSON.parse(stored);
    if (isStashedDraft(stashed) && Date.now() - stashed.stashedAt <= DRAFT_TTL_MS) return stashed.draft;
    storage?.removeItem(DRAFT_KEY);
    return null;
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
