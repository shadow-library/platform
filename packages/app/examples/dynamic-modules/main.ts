import { ShadowFactory } from '@shadow-library/app';

import { AppModule } from './app.module';
import { AppService } from './app.service';

const app = await ShadowFactory.create(AppModule);
const appService = app.select(AppModule).get(AppService);
process.stdout.write(`Message: ${appService.getHello()}\n`);
