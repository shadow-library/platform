import './bootstrap';

import { Module } from '@shadow-library/app';

import { HttpRouteModule } from '@modules/dynamic.modules';

import { DatabaseModule } from './database';

@Module({
  imports: [DatabaseModule, HttpRouteModule],
})
export class AppModule {}
