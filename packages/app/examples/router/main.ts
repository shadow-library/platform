/**
 * Importing npm packages
 */
import { ShadowFactory } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AppModule } from './app.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const app = await ShadowFactory.create(AppModule);
await app.start();
