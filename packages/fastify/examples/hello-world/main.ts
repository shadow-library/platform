import { ShadowFactory } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppModule } from './app.module';

Logger.addDefaultTransports();
const app = await ShadowFactory.create(AppModule);
await app.start();
