import { ErrorCode } from '@shadow-library/common';

export class ServiceCallErrorCode extends ErrorCode {
  /** The call never got an HTTP answer: refused, reset, timed out, or the token could not be minted */
  static readonly SERVICE_UNREACHABLE = ServiceCallErrorCode.unavailable('SERVICE_UNREACHABLE', '{service} could not be reached: {reason}');
}
