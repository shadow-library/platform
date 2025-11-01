/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest, spyOn } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ConsoleTransport, Logger } from '@shadow-library/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Logger Service', () => {
  const winstonLogger = Logger['logger'];
  const maskedValue = '****';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should mask sensitive data', () => {
    const redactor = Logger.getRedactor(['password']);
    const data = { username: 'username', password: 'password' };
    const value = redactor(data);

    expect(value).toBe(data);
    expect(data).toStrictEqual({ username: 'username', password: 'xxxx' });
  });

  it('should mask sensitive data with provided censor', () => {
    const redactor = Logger.getRedactor(['password'], maskedValue);
    const data = { username: 'username', password: 'password' };
    const value = redactor(data);

    expect(value).toBe(data);
    expect(data).toStrictEqual({ username: 'username', password: maskedValue });
  });

  it('should set default metadata', () => {
    const metadata = { service: 'test' };
    Logger.setDefaultMetadata(metadata);
    expect(winstonLogger.defaultMeta).toBe(metadata);
  });

  it('should return the logger', () => {
    const fn = spyOn(winstonLogger, 'child');
    Logger.getLogger('unit-test', 'UserService');
    expect(fn).toBeCalledWith({ label: 'UserService', namespace: 'unit-test' });
  });

  it('should return the logger with metadata', () => {
    const fn = spyOn(winstonLogger, 'child');
    Logger.getLogger({ name: 'test' });
    expect(fn).toBeCalledWith({ name: 'test' });
  });

  it('should add a dummy transport if no transport is provided', () => {
    expect(winstonLogger.transports).toHaveLength(1);
  });

  it('should add a transport and remove dummy transports', () => {
    const transport = new ConsoleTransport();
    winstonLogger.add = jest.fn();
    Logger.addTransport(transport);
    expect(winstonLogger.add).toBeCalledWith(transport);
  });

  it('should close the logger', () => {
    const fn = spyOn(winstonLogger, 'close');
    Logger.close();
    expect(fn).toBeCalled();
  });

  describe('Context Providers', () => {
    beforeEach(() => {
      Logger['contextProviders'].length = 0;
    });

    it('should add a context provider with namespace', () => {
      const provider = () => ({ requestId: '123' });
      Logger.addContextProvider('http', provider);

      expect(Logger['contextProviders']).toHaveLength(1);
      expect(Logger['contextProviders'][0]).toStrictEqual({ namespace: 'http', provider });
    });

    it('should add multiple context providers', () => {
      const httpProvider = () => ({ requestId: '123' });
      const dbProvider = () => ({ transactionId: 'tx-456' });

      Logger.addContextProvider('http', httpProvider);
      Logger.addContextProvider('db', dbProvider);

      expect(Logger['contextProviders']).toHaveLength(2);
    });

    it('should include context from provider when getting log context', () => {
      const provider = () => ({ requestId: '123', method: 'GET' });
      Logger.addContextProvider('http', provider);

      const context = Logger['getLogContext']();

      expect(context).toStrictEqual({ http: { requestId: '123', method: 'GET' } });
    });

    it('should merge context from multiple providers with different namespaces', () => {
      const httpProvider = () => ({ requestId: '123', method: 'GET' });
      const dbProvider = () => ({ transactionId: 'tx-456' });
      const authProvider = () => ({ userId: 'user-789' });

      Logger.addContextProvider('http', httpProvider);
      Logger.addContextProvider('db', dbProvider);
      Logger.addContextProvider('auth', authProvider);

      const context = Logger['getLogContext']();

      expect(context).toStrictEqual({
        http: { requestId: '123', method: 'GET' },
        db: { transactionId: 'tx-456' },
        auth: { userId: 'user-789' },
      });
    });

    it('should merge context from multiple providers with same namespace', () => {
      const provider1 = () => ({ requestId: '123' });
      const provider2 = () => ({ method: 'GET' });

      Logger.addContextProvider('http', provider1);
      Logger.addContextProvider('http', provider2);

      const context = Logger['getLogContext']();

      expect(context).toStrictEqual({ http: { requestId: '123', method: 'GET' } });
    });

    it('should allow same namespace to be overwritten by later provider', () => {
      const provider1 = () => ({ requestId: '123', method: 'GET' });
      const provider2 = () => ({ requestId: '456', url: '/api' });

      Logger.addContextProvider('http', provider1);
      Logger.addContextProvider('http', provider2);

      const context = Logger['getLogContext']();

      // Last provider wins for conflicting keys, but merges non-conflicting keys
      expect(context).toStrictEqual({ http: { requestId: '456', method: 'GET', url: '/api' } });
    });

    it('should handle provider returning undefined', () => {
      const provider = () => undefined;
      Logger.addContextProvider('http', provider);

      const context = Logger['getLogContext']();

      expect(context).toStrictEqual({});
    });
  });
});
