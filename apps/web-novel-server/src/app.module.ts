import './bootstrap';

import { Module } from '@shadow-library/app';

import { DatastoreModule } from './modules/datastore';
import { HttpRouteModule } from './routes';

@Module({
  imports: [DatastoreModule, HttpRouteModule],
})
export class AppModule {}
