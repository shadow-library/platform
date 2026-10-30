import { ErrorCode } from '@shadow-library/common';

export class InternalApiErrorCode extends ErrorCode {
  /** The call never got an HTTP answer: refused, reset, timed out, or the token could not be minted */
  static readonly SERVICE_UNREACHABLE = InternalApiErrorCode.unavailable('INTERNAL_API_SERVICE_UNREACHABLE', '{service} could not be reached: {reason}');
}
