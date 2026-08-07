import './bootstrap';

import { Module } from '@shadow-library/app';

import { DatastoreModule } from './modules/infrastructure/datastore';
import { WorkerModule } from './modules/worker';

@Module({
  imports: [DatastoreModule, WorkerModule],
})
export class WorkerAppModule {}
