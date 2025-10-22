/**
 * Importing npm packages
 */
import { fastifyCookie } from '@fastify/cookie';
import { Inject, Module, OnModuleInit } from '@shadow-library/app';
import { FASTIFY_INSTANCE, FastifyModule, type ServerInstance } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { HealthController } from './controllers/health.controller';
import { CsrfProtectionMiddleware } from './middlewares/csrf-protection.middleware';
import { RequestInitializerMiddleware } from './middlewares/request-initializer.middleware';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [FastifyModule],
  controllers: [HealthController, RequestInitializerMiddleware, CsrfProtectionMiddleware],
})
export class HttpCoreModule implements OnModuleInit {
  constructor(@Inject(FASTIFY_INSTANCE) private readonly fastify: ServerInstance) {}

  async onModuleInit(): Promise<void> {
    await this.fastify.register(fastifyCookie);
  }
}
