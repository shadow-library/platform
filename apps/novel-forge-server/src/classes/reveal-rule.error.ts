import { AppError, type AppErrorObject, type ErrorCode } from '@shadow-library/common';

export interface RevealRuleViolationDetail {
  factKey: string;
  /** The secret's title, never its truth. */
  label: string;
  /** What still has to hold before the plan may reveal it, read as words. */
  missing: string[];
}

export interface RevealRuleErrorObject extends AppErrorObject {
  details: { violations: RevealRuleViolationDetail[] };
}

/** A reveal-rule refusal (PLN_001, PLN_004) that names each locked secret and what it still needs, so a client can point at it. */
export class RevealRuleError extends AppError {
  readonly violations: RevealRuleViolationDetail[];

  constructor(errorCode: ErrorCode, data: { chapter: number; violations: string }, violations: RevealRuleViolationDetail[]) {
    super(errorCode, data);
    this.violations = violations;
  }

  override toResponse(): RevealRuleErrorObject {
    return { ...super.toResponse(), details: { violations: this.violations } };
  }
}
