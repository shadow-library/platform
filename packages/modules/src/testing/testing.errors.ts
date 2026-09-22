/**
 * Importing npm packages
 */
import { ErrorCode } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The in-memory Redis keeps Redis's own reply text, so an assertion written against a real server's
 * error reads the same against the fake.
 */
export class TestingErrorCode extends ErrorCode {
  /** A query reached the fake database's postgres client, which was never given a real one to answer with */
  static readonly POSTGRES_CLIENT_MISSING = TestingErrorCode.internal(
    'TESTING_POSTGRES_CLIENT_MISSING',
    "FakeDatabaseService has no postgres client, so '{path}' cannot run; pass one as `new FakeDatabaseService({ postgres })`",
  );

  /** Memcached has no fake; no application reads it */
  static readonly MEMCACHE_UNSUPPORTED = TestingErrorCode.internal('TESTING_MEMCACHE_UNSUPPORTED', 'FakeDatabaseService does not provide a memcached client');

  static readonly REDIS_WRONG_TYPE = TestingErrorCode.internal('TESTING_REDIS_WRONG_TYPE', 'WRONGTYPE Operation against a key holding the wrong kind of value');
  static readonly REDIS_NOT_INTEGER = TestingErrorCode.internal('TESTING_REDIS_NOT_INTEGER', 'ERR value is not an integer or out of range');
  static readonly REDIS_INVALID_EXPIRE = TestingErrorCode.internal('TESTING_REDIS_INVALID_EXPIRE', "ERR invalid expire time in '{command}' command");
  static readonly REDIS_SYNTAX = TestingErrorCode.internal('TESTING_REDIS_SYNTAX', 'ERR syntax error');
  static readonly REDIS_WRONG_ARITY = TestingErrorCode.internal('TESTING_REDIS_WRONG_ARITY', "ERR wrong number of arguments for '{command}' command");
  static readonly REDIS_UNKNOWN_COMMAND = TestingErrorCode.internal('TESTING_REDIS_UNKNOWN_COMMAND', "InMemoryRedis does not implement '{command}'");

  static readonly OPENAPI_OUTPUT_MISSING = TestingErrorCode.internal('TESTING_OPENAPI_OUTPUT_MISSING', 'No output path was given for the OpenAPI document');
  static readonly OPENAPI_UNAVAILABLE = TestingErrorCode.internal('TESTING_OPENAPI_UNAVAILABLE', "'{route}' answered http {status} instead of the OpenAPI document");
}
