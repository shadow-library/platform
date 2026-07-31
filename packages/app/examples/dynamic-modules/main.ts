/**
 * Importing npm packages
 */
import { ShadowFactory } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AppModule } from './app.module';
import { AppService } from './app.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const app = await ShadowFactory.create(AppModule);
const appService = app.select(AppModule).get(AppService);
console.log('Message:', appService.getHello());
