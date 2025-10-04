/**
 * Importing npm packages
 */
import { Get, HttpController } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/health')
export class HealthController {
  @Get()
  healthCheck() {
    return { status: 'ok' };
  }
}
