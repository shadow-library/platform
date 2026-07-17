/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { Module, ShadowApplication, ShadowFactory } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('ShadowFactory', () => {
  describe('create', () => {
    it('should create and init the application', async () => {
      @Module({})
      class AppModule {}

      const app = await ShadowFactory.create(AppModule);

      expect(app).toBeInstanceOf(ShadowApplication);
      expect(app['main']).toBe(AppModule);
      expect(app['options'].enableShutdownHooks).toEqual(['SIGINT', 'SIGTERM']);
      expect(app.isInitiated()).toBe(true);
    });

    it('should forward the application options to the application', async () => {
      @Module({})
      class AppModule {}
      const options = { enableShutdownHooks: false as const };

      const app = await ShadowFactory.create(AppModule, options);

      expect(app).toBeInstanceOf(ShadowApplication);
      expect(app['main']).toBe(AppModule);
      expect(app['options'].enableShutdownHooks).toBe(false);
      expect(app.isInitiated()).toBe(true);
    });
  });
});
