import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';

import { RoutesController } from './routes.controller';

@Module({
  imports: [
    FastifyModule.forRoot({
      enableChildRoutes: true,
      controllers: [RoutesController],
    }),
  ],
})
export class AppModule {}
