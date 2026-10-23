import { ShadowFactory } from '@shadow-library/app';

import { AppModule } from './app.module';

const app = await ShadowFactory.create(AppModule);
await app.start();
