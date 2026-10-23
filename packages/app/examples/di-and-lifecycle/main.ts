import { ShadowFactory } from '@shadow-library/app';

import { AppModule } from './app.module';
import { OutputService } from './common/output.service';

const app = await ShadowFactory.create(AppModule);
await app.start();

const outputService = app.select(AppModule).get(OutputService);
outputService.separator();
outputService.info('Application is running. Terminating the application...');
outputService.separator();

await app.stop();
