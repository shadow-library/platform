/**
 * Importing npm packages
 */
import { Get, HttpController } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { HealthCheckResponse } from './dtos';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('health')
export class HealthController {
  @Get()
  getHealth(): HealthCheckResponse {
    return { status: 'ok' };
  }
}
