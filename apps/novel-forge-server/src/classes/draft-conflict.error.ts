import { AppError, type AppErrorObject } from '@shadow-library/common';

import { AppErrorCode } from './app-error-code';

export interface ConflictingDraft {
  id: bigint;
  revision: number;
  saveSeq: number;
  title: string | null;
  body: string;
  summary: string | null;
  updatedAt: Date;
}

export interface DraftConflictErrorObject extends AppErrorObject {
  current: ConflictingDraft;
}

/** DRF_013 answered with the draft as it stands; the prose sits in a private field so a logged error never carries it. */
export class DraftConflictError extends AppError {
  readonly #current: ConflictingDraft;

  constructor(draft: ConflictingDraft) {
    super(AppErrorCode.DRF_013);
    this.#current = { id: draft.id, revision: draft.revision, saveSeq: draft.saveSeq, title: draft.title, body: draft.body, summary: draft.summary, updatedAt: draft.updatedAt };
  }

  override toResponse(): DraftConflictErrorObject {
    return { ...super.toResponse(), current: this.#current };
  }
}

export interface SummaryConflictErrorObject extends DraftConflictErrorObject {
  attemptedSummary: string;
}

/** DRF_013 for a summary computed against prose that has since moved; `attemptedSummary` carries the computed text so the caller can re-offer it once reloaded, instead of paying for another model call. */
export class SummaryConflictError extends DraftConflictError {
  readonly #attemptedSummary: string;

  constructor(draft: ConflictingDraft, attemptedSummary: string) {
    super(draft);
    this.#attemptedSummary = attemptedSummary;
  }

  override toResponse(): SummaryConflictErrorObject {
    return { ...super.toResponse(), attemptedSummary: this.#attemptedSummary };
  }
}
