import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';

import { HelloController } from './hello.controller';

@Module({
  imports: [
    FastifyModule.forRoot({
      controllers: [HelloController],
      routePrefix: 'api',
    }),
  ],
})
export class AppModule {}
