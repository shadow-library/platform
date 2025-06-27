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
  const store = { get: jest.fn().mockReturnValue(data.get), set: jest.fn().mockReturnValue(data.set) };
  const storage = { enterWith: jest.fn(), getStore: jest.fn().mockReturnValue(store) };

  beforeEach(() => {
    jest.clearAllMocks();
    context = new ContextService();
    // @ts-expect-error setting private readonly storage
    context['storage'] = storage;
  });

  it('should initialize the context', () => {
    const middleware = context.init();
    middleware(data.req as any, data.res as any);

    expect(storage.enterWith).toHaveBeenCalledWith(expect.any(Map));
  });

  describe('set()', () => {
    it('should throw an error if context is not inited', () => {
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

    it('should throw an error if context is not inited', () => {
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

  describe('initChild', () => {
    let context: ContextService;
    const req = { id: 'parent-id' };
    const parentStore = new Map();
    const storage = { enterWith: jest.fn(), getStore: jest.fn() };

    beforeEach(() => {
      jest.clearAllMocks();
      context = new ContextService();
      // @ts-expect-error setting private readonly storage
      context['storage'] = storage;
    });

    it('should throw if parent context is not initialized', async () => {
      storage.getStore.mockReturnValueOnce(undefined);
      await expect(context.initChild()(req as any, {} as any)).rejects.toThrow(InternalError);
    });

    it('should throw if already in a child context', async () => {
      parentStore.has = jest.fn(() => true);
      storage.getStore.mockReturnValueOnce(parentStore);
      await expect(context.initChild()(req as any, {} as any)).rejects.toThrow(InternalError);
    });

    it('should set up child context with incremented child RID and parent context', async () => {
      parentStore.has = jest.fn(() => false);
      storage.getStore.mockReturnValue(parentStore);
      const originalGet = parentStore.get;
      parentStore.get = jest.fn((key: string) => {
        if (key.toString() === 'Symbol(rid)') return 'parent-rid';
        return originalGet.call(parentStore, key);
      });
      await context.initChild()(req as any, {} as any);

      expect(storage.enterWith).toHaveBeenCalledWith(expect.any(Map));
      expect(Array.from(parentStore.values())).toStrictEqual([1]);
    });
  });

  describe('getChildRequest', () => {
    let context: ContextService;
    const req = { id: 'child-id' };
    const storage = { getStore: jest.fn() };

    beforeEach(() => {
      jest.clearAllMocks();
      context = new ContextService();
      // @ts-expect-error setting private readonly storage
      context['storage'] = storage;
    });

    it('should return the child request if present', () => {
      // Simulate resolve returning req
      jest.spyOn(context as any, 'resolve').mockReturnValue(req);
      expect(context.getChildRequest()).toBe(req);
      expect(context['resolve']).toHaveBeenCalledWith(expect.anything(), false);
    });

    it('should return null if child request not present', () => {
      jest.spyOn(context as any, 'resolve').mockReturnValue(null);
      expect(context.getChildRequest()).toBeNull();
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
  });
});
