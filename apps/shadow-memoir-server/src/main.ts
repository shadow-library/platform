import 'reflect-metadata';

import { bootstrapServer } from '@shadow-library/modules/bootstrap';

import { AppModule } from './app.module';
import { manifestLogRedactionFormat } from './database/log-redaction';

await bootstrapServer(AppModule, import.meta.dirname, manifestLogRedactionFormat());
