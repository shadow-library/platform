/**
 * Importing npm packages
 */
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { ShadowApplication, ShadowApplicationOptions } from './shadow-application';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export class ShadowFactoryStatic {
  async create(module: Class<unknown>, options?: ShadowApplicationOptions): Promise<ShadowApplication> {
    const app = new ShadowApplication(module, options);
    return await app.init();
  }
}

export const ShadowFactory = new ShadowFactoryStatic();
