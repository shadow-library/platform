import 'reflect-metadata';

import { bootstrapServer } from '@shadow-library/modules/bootstrap';

import { AppModule } from './app.module';

await bootstrapServer(AppModule, import.meta.dirname);
