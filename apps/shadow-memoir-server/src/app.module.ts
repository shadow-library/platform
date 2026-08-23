import './bootstrap';

import { Module } from '@shadow-library/app';

import { HttpRouteModule } from './routes';

@Module({
  imports: [HttpRouteModule],
})
export class AppModule {}
