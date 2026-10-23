import { Get, HttpController } from '@shadow-library/fastify';

export interface HealthStatus {
  status: 'ok';
}

@HttpController('/health')
export class HealthController {
  @Get()
  healthCheck(): HealthStatus {
    return { status: 'ok' };
  }
}
