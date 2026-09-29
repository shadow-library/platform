import { AppError, type AppErrorObject, type ErrorCode } from '@shadow-library/common';

export interface OpDependencyErrorObject extends AppErrorObject {
  details: { opIndexes: number[] };
}

/** A per-change undo (RFN_015) or redo (RFN_016) refused over other changes of the same turn, listed in the order to undo or redo them. */
export class OpDependencyError extends AppError {
  readonly opIndexes: number[];

  constructor(errorCode: ErrorCode, opIndex: number, opIndexes: number[]) {
    super(errorCode, { opIndex: String(opIndex), opIndexes: opIndexes.join(', ') });
    this.opIndexes = opIndexes;
  }

  override toResponse(): OpDependencyErrorObject {
    return { ...super.toResponse(), details: { opIndexes: this.opIndexes } };
  }
}
