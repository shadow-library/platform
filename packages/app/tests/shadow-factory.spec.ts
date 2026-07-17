/**
 * Importing npm packages
 */
import { describe, expect, it, jest } from '@jest/globals';

/**
 * Importing user defined packages
 */
import { ShadowApplication, ShadowFactory } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
jest.mock('@lib/shadow-application', () => ({
  ShadowApplication: jest.fn().mockImplementation(() => ({
    init: jest.fn(async () => {}).mockReturnThis(),
  })),
}));

describe('ShadowFactory', () => {
  describe('create', () => {
    it('should create and init the application', async () => {
      class AppModule {}
      const app = await ShadowFactory.create(AppModule);

      expect(ShadowApplication).toBeCalledWith(AppModule, undefined);
      expect(app.init).toBeCalledTimes(1);
    });

    it('should forward the application options to the application', async () => {
      class AppModule {}
      const options = { enableShutdownHooks: false as const };
      const app = await ShadowFactory.create(AppModule, options);

      expect(ShadowApplication).toBeCalledWith(AppModule, options);
      expect(app.init).toBeCalledTimes(1);
    });
  });
});
