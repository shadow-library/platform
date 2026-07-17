/**
 * Importing npm packages
 */
import { AppError } from '@shadow-library/common';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

/**
 * Importing user defined packages
 */
import { Module, ModuleRef, ShadowApplication } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('ShadowApplication', () => {
  let app: ShadowApplication;
  let registry: any;

  @Module({})
  class AppModule {}

  beforeEach(() => {
    app = new ShadowApplication(AppModule);
    registry = { get: mock(() => []), init: mock(async () => {}), terminate: mock(async () => {}) };
    (app as any).registry = registry;
  });

  afterEach(() => {
    mock.restore();
  });

  describe('initialization and termination', () => {
    it('should initialize the application', async () => {
      registry.get.mockReturnValue({ isInitiated: () => false });
      await app.init();
      expect(registry.init).toBeCalledTimes(1);
    });

    it('should not initialize the application if already initiated', async () => {
      spyOn(app, 'isInitiated').mockReturnValue(true);
      await app.init();
      expect(registry.init).not.toBeCalled();
    });

    it('should start the application', async () => {
      const module = { start: mock() };
      spyOn(app, 'isInitiated').mockReturnValue(true);
      registry.get.mockReturnValue([module]);

      await app.start();
      expect(module.start).toBeCalledTimes(1);
    });

    it('should initialize the application if not initiated when starting the application', async () => {
      const module = { start: mock(), init: mock() };
      spyOn(app, 'isInitiated').mockReturnValue(false);
      registry.get.mockReturnValue([module]);

      await app.start();
      expect(module.start).toBeCalledTimes(1);
    });

    it('should stop the application', async () => {
      spyOn(app, 'isInitiated').mockReturnValue(true);
      await app.stop();
      expect(registry.terminate).toBeCalledTimes(1);
    });

    it('should not stop the application if not initiated', async () => {
      spyOn(app, 'isInitiated').mockReturnValue(false);
      await app.stop();
      expect(registry.terminate).not.toBeCalled();
    });

    it('should stop the application when signal is received', async () => {
      spyOn(app, 'isInitiated').mockReturnValue(true);
      spyOn(process, 'kill').mockResolvedValue(null as never);
      spyOn(process, 'removeListener').mockReturnThis();
      const stop = spyOn(app, 'stop').mockReturnThis();

      await app.start();
      const listeners = process.listeners('SIGINT');
      listeners.at(-1)?.('SIGINT');

      expect(listeners.length).toBeGreaterThanOrEqual(1);
      expect(stop).toBeCalledTimes(1);
    });

    it('should stop the application only once when signal is received', async () => {
      spyOn(app, 'isInitiated').mockReturnValue(true);
      spyOn(process, 'kill').mockResolvedValue(null as never);
      const stop = spyOn(app, 'stop').mockReturnThis();

      await app.start();
      const listeners = process.listeners('SIGINT');
      listeners.at(-1)?.('SIGINT');
      listeners.at(-1)?.('SIGINT');

      expect(stop).toBeCalledTimes(1);
    });

    it('should not enable graceful shutdown if no signals are provided', async () => {
      spyOn(app, 'isInitiated').mockReturnValue(true);
      const onSignal = spyOn(process, 'on').mockReturnThis();
      app['options'].enableShutdownHooks = false;

      await app.start();
      expect(onSignal).not.toBeCalled();
    });
  });

  describe('select', () => {
    it('should return the module ref', () => {
      const instanceWrapper = { getInstance: mock() };
      const module = { getInternalProvider: mock().mockReturnValue(instanceWrapper) };
      registry.get.mockReturnValue(module);

      app.select(AppModule);

      expect(module.getInternalProvider).toBeCalledWith(ModuleRef);
      expect(instanceWrapper.getInstance).toBeCalledTimes(1);
    });
  });

  describe('get', () => {
    it('should throw an error if application not initiated', () => {
      spyOn(app, 'isInitiated').mockReturnValue(false);
      expect(() => app.get(AppModule)).toThrowError(AppError);
    });

    it('should throw an error is provider is not found', () => {
      const module = { getProvider: mock().mockReturnValue(undefined) };
      spyOn(app, 'isInitiated').mockReturnValue(true);
      registry.get.mockReturnValue([module]);

      expect(() => app.get(AppModule)).toThrowError(AppError);
      expect(() => app.get('RANDOM')).toThrowError(AppError);
    });

    it('should return the instance of the provider', () => {
      const instanceWrapper = { getInstance: mock() };
      const module = { getProvider: mock().mockReturnValue(instanceWrapper) };
      spyOn(app, 'isInitiated').mockReturnValue(true);
      registry.get.mockReturnValue([module]);

      app.get(AppModule);

      expect(module.getProvider).toBeCalledWith(AppModule, true);
      expect(instanceWrapper.getInstance).toBeCalledTimes(1);
    });
  });
});
