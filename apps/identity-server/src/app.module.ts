import './bootstrap';

import { Module } from '@shadow-library/app';

import { ContextBinder } from './modules/access';
import { BootstrapModule } from './modules/bootstrap';
import { DatastoreModule } from './modules/infrastructure/datastore';
import { HttpRouteModule } from './routes';

@Module({
  imports: [DatastoreModule, HttpRouteModule, BootstrapModule],
  providers: [ContextBinder],
})
export class AppModule {}
