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

export interface HealthStatus {
  status: 'ok';
}

/**
 * Declaring the constants
 */

@HttpController('/health')
export class HealthController {
  @Get()
  healthCheck(): HealthStatus {
    return { status: 'ok' };
  }
}
