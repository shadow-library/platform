/**
 * Importing npm packages
 */
import { sql } from 'drizzle-orm';
import { Logger } from '@shadow-library/common';
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { Auth } from '@server/modules/access';
import { DatabaseService } from '@server/modules/infrastructure/datastore';

import { DependencyStatus, HealthResponse, ReadinessResponse } from './health.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController()
export class HealthController {
  private readonly logger = Logger.getLogger(APP_NAME, HealthController.name);

  constructor(private readonly databaseService: DatabaseService) {}

  @Get('/health')
  @Auth({ public: true })
  @RespondFor(200, HealthResponse)
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }

  @Get('/health/ready')
  @Auth({ public: true })
  @RespondFor(200, ReadinessResponse)
  @RespondFor(503, ReadinessResponse)
  async getReadiness(): Promise<ReadinessResponse> {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    const status = postgres === 'up' && redis === 'up' ? 'ok' : 'degraded';
    return { status, dependencies: { postgres, redis } };
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    return this.databaseService
      .getPostgresClient()
      .execute(sql`SELECT 1`)
      .then((): DependencyStatus => 'up')
      .catch(error => (this.logger.warn('postgres readiness check failed', { error }), 'down'));
  }

  private async checkRedis(): Promise<DependencyStatus> {
    return this.databaseService
      .getRedisClient()
      .ping()
      .then((): DependencyStatus => 'up')
      .catch(error => (this.logger.warn('redis readiness check failed', { error }), 'down'));
  }
}
