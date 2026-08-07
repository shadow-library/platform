import { sql } from 'drizzle-orm';
import { tryCatch } from '@shadow-library/common';
import { Get, HttpController, type HttpResponse, Res, RespondFor } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { type PrimaryDatabase } from '@server/modules/datastore';

import { HealthResponse, ReadyResponse } from './health.dto';

@HttpController('/health')
export class HealthController {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  @Get()
  @RespondFor(200, HealthResponse)
  health(): HealthResponse {
    return { status: 'ok' };
  }

  @Get('/ready')
  @RespondFor(200, ReadyResponse)
  async ready(@Res() response: HttpResponse): Promise<ReadyResponse> {
    const postgres = await tryCatch(() => this.db.execute(sql`SELECT 1`));
    if (!postgres.success) response.status(503);
    return { status: postgres.success ? 'ok' : 'degraded', dependencies: { postgres: postgres.success ? 'up' : 'down' } };
  }
}
