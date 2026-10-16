/** `finished`: the request already answered, and anything it left running upstream is cut */
export type AbortCause = 'client' | 'timeout' | 'shutdown' | 'stalled' | 'finished';

/** One request's cancellation: the first cause wins, and every upstream call made for the request listens to `signal` */
export class RequestAbort {
  private readonly controller = new AbortController();
  private abortCause: AbortCause | undefined;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get cause(): AbortCause | undefined {
    return this.abortCause;
  }

  abort(cause: AbortCause): void {
    if (this.abortCause) return;
    this.abortCause = cause;
    this.controller.abort(new DOMException(`The request was aborted (${cause})`, 'AbortError'));
  }
}
