import './bootstrap';

import { Module } from '@shadow-library/app';
import { StorageModule } from '@shadow-library/modules';

import { HttpRouteModule } from '@modules/dynamic.modules';

import { DatabaseModule } from './database';

@Module({
  imports: [DatabaseModule, StorageModule.forRoot(), HttpRouteModule],
})
export class AppModule {}
