/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { InternalError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { ContextService } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Context', () => {
  let context: ContextService;
  const data = { req: { id: 1 }, res: {}, get: 'GET', set: 'SET' };
  const store = { get: jest.fn().mockReturnValue(data.get), set: jest.fn().mockReturnValue(data.set), has: jest.fn().mockReturnValue(false) };
  const storage = { run: jest.fn(), getStore: jest.fn().mockReturnValue(store) };

  beforeEach(() => {
    jest.clearAllMocks();
    context = new ContextService();
    // @ts-expect-error setting private readonly storage
    context['storage'] = storage;
  });

  describe('init()', () => {
    it('should initialize the context', () => {
      const callback = () => {};
      storage.getStore.mockReturnValueOnce(undefined);
      const middleware = context.init() as (...args: any[]) => void;
      middleware(data.req, data.res, callback);
      expect(storage.run).toHaveBeenCalledWith(expect.any(Map), callback);
      expect((storage.run.mock.lastCall?.[0] as Map<unknown, unknown>)?.size).toBe(3);
    });

    it('should initialize the child context', () => {
      const callback = () => {};
      const middleware = context.init() as (...args: any[]) => void;
      middleware(data.req, data.res, callback);
      expect(storage.run).toHaveBeenCalledWith(expect.any(Map), callback);
      expect((storage.run.mock.lastCall?.[0] as Map<unknown, unknown>)?.size).toBe(4);
    });

    it('should throw error when child route is inited inside a child route', () => {
      const callback = () => {};
      store.has.mockReturnValueOnce(true);
      const middleware = context.init() as (...args: any[]) => void;
      expect(() => middleware(data.req, data.res, callback)).toThrowError(InternalError);
    });
  });

  describe('set()', () => {
    it('should throw an error if context is not initiated', () => {
      storage.getStore.mockReturnValueOnce(undefined);
      expect(() => context['set']('key', 'value')).toThrowError(InternalError);
    });

    it('should set the context value', () => {
      context['set']('key', 'value');
      expect(store.set).toHaveBeenCalledWith('key', 'value');
    });
  });

  describe('get', () => {
    it('should get the context value', () => {
      const req = context.getRequest();
      expect(store.get).toHaveBeenCalledWith(expect.any(Symbol));
      expect(req).toBe(data.get);
    });

    it('should throw an error if context is not initiated', () => {
      storage.getStore.mockReturnValueOnce(undefined);
      expect(() => context.getResponse()).toThrowError(InternalError);
    });

    it('should throw an error if value not present when throwIfMissing is true', () => {
      store.get.mockReturnValueOnce(undefined);
      expect(() => context.getRID()).toThrowError(InternalError);
    });

    it('should return null if value not present when throwIfMissing is false', () => {
      store.get.mockReturnValueOnce(undefined);
      expect(context['get']('random')).toBeNull();
    });
  });

  describe('getFromParent', () => {
    let context: ContextService;
    const parentStore = new Map();
    const storage = { getStore: jest.fn() };

    beforeEach(() => {
      jest.clearAllMocks();
      context = new ContextService();
      // @ts-expect-error setting private readonly storage
      context['storage'] = storage;
    });

    it('should return value from parent store if in child context', () => {
      jest.spyOn(context, 'isChildContext').mockReturnValue(true);
      context.get = jest.fn((key: string) => (key.toString() === 'Symbol(parent-context)' ? parentStore : null));
      parentStore.get = jest.fn().mockReturnValue('parentValue');
      expect(context.getFromParent('someKey')).toBe('parentValue');
      expect(parentStore.get).toHaveBeenCalledWith('someKey');
    });

    it('should throw if value not present in parent and throwOnMissing is true', () => {
      jest.spyOn(context, 'isChildContext').mockReturnValue(true);
      context.get = jest.fn((key: string) => (key.toString() === 'Symbol(parent-context)' ? parentStore : null));
      parentStore.get = jest.fn().mockReturnValue(undefined);
      expect(() => context.getFromParent('missingKey', true)).toThrowError();
    });

    it('should return value from current context if not in child context', () => {
      jest.spyOn(context, 'isChildContext').mockReturnValue(false);
      context.get = jest.fn().mockReturnValue('currentValue');
      expect(context.getFromParent('someKey')).toBe('currentValue');
    });

    it('should return null if value not present in child and parent context', () => {
      jest.spyOn(context, 'isChildContext').mockReturnValue(true);
      context.get = jest.fn((key: string) => (key.toString() === 'Symbol(parent-context)' ? parentStore : null));
      parentStore.get = jest.fn().mockReturnValue(undefined);
      expect(context.getFromParent('missingKey')).toBeNull();
    });
  });

  describe('setInParent()', () => {
    it('should set value in parent store if in child context', () => {
      const parentStore = { set: jest.fn() };
      context.get = jest.fn((key: string) => (key.toString() === 'Symbol(parent-context)' ? parentStore : null));
      context.setInParent('someKey', 'someValue');
      expect(parentStore.set).toHaveBeenCalledWith('someKey', 'someValue');
    });

    it('should set in current context if not in child context', () => {
      jest.spyOn(context, 'isChildContext').mockReturnValue(false);
      context.setInParent('someKey', 'someValue');
      expect(store.set).toHaveBeenCalledWith('someKey', 'someValue');
    });
  });

  describe('resolve()', () => {
    it('should get from child context', () => {
      context.get = jest.fn().mockReturnValue('some-value');
      expect(context.resolve('someKey')).toBe('some-value');
      expect(context.get).toHaveBeenCalledWith('someKey', false);
    });

    it('should get from parent context', () => {
      context.isChildContext = () => true;
      context.get = jest.fn().mockReturnValue(null);
      context.getFromParent = jest.fn().mockReturnValue('some-value');
      expect(context.resolve('someKey', false)).toBe('some-value');
      expect(context.getFromParent).toHaveBeenCalledWith('someKey', false);
    });

    it('should return null if not found in current context if parent', () => {
      context.isChildContext = () => false;
      context.get = jest.fn().mockReturnValue(null);
      context.getFromParent = jest.fn();
      expect(context.resolve('someKey')).toBe(null);
      expect(context.getFromParent).not.toHaveBeenCalled();
    });
  });

  describe('isInitialized()', () => {
    it('should return true if context is initialized', () => {
      expect(context.isInitialized()).toBe(true);
    });

    it('should return false if context is not initialized', () => {
      storage.getStore.mockReturnValueOnce(undefined);
      expect(context.isInitialized()).toBe(false);
    });
  });

  describe('extend()', () => {
    it('should extend the context with new methods', () => {
      store.get.mockReturnValue(100);
      context.extend({
        getCurrentUserId(): string | null {
          return this.get<string | null>('current-user-id', false);
        },
        setCurrentUserId(userId: string) {
          return this.set('current-user-id', userId);
        },
      });

      expect((context as any).getCurrentUserId()).toBe(100);
      expect((context as any).setCurrentUserId('user-123')).toBe(context);
    });
  });
});
