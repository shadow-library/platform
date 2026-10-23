import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';

import { HealthController } from './health.controller';
import { AccessMiddleware } from './middlewares/access.middleware';
import { AuthMiddleware } from './middlewares/auth.middleware';
import { UserController } from './user.controller';
import { UserService } from './user.service';

declare module '@shadow-library/fastify' {
  interface CustomTransformers {
    'int:stringify': (value: number) => string;
  }
}

@Module({
  imports: [
    FastifyModule.forRoot({
      prefixVersioning: true,
      controllers: [HealthController, UserController, AuthMiddleware, AccessMiddleware],
      providers: [UserService],
      transformers: { 'int:stringify': (value: number) => String(value) },
    }),
  ],
})
export class AppModule {}
