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
const divider = new Array(60).fill('-').join('');

const app = await ShadowFactory.create(AppModule);
await app.start();

console.log(divider);
console.log('Application is running. Terminating the application...');
console.log(divider);

await app.stop();
