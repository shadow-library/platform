/**
 * Importing npm packages
 */
import { ShadowFactory } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AppModule } from './app.module';
import { OutputService } from './common/output.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const app = await ShadowFactory.create(AppModule);
await app.start();

const outputService = app.select(AppModule).get(OutputService);
outputService.separator();
outputService.info('Application is running. Terminating the application...');
outputService.separator();

await app.stop();
