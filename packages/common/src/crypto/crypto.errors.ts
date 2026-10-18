import { ErrorCode } from '@lib/errors';

/** Every key is internal: a response must never reveal which part of a sealed secret, or of the keyring, was wrong. Messages never carry key material. */
export class CryptoErrorCode extends ErrorCode {
  static readonly KEYRING_INVALID = CryptoErrorCode.internal('CRYPTO_KEYRING_INVALID', 'The keyring is malformed: {reason}');

  static readonly UNKNOWN_KEY = CryptoErrorCode.internal('CRYPTO_UNKNOWN_KEY', "The keyring has no key '{kid}'");

  /** Raised alike for a wrong context, a tampered field or a malformed envelope, so a caller cannot probe which */
  static readonly DECRYPTION_FAILED = CryptoErrorCode.internal('CRYPTO_DECRYPTION_FAILED', 'The secret could not be decrypted');

  static readonly ENVELOPE_UNSUPPORTED = CryptoErrorCode.internal('CRYPTO_ENVELOPE_UNSUPPORTED', 'The envelope version or algorithm is not supported');
}
